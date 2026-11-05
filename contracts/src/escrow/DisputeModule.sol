// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {IArbitration} from "../interfaces/IArbitration.sol";
import {IParameterRegistry} from "../interfaces/IParameterRegistry.sol";
import {IReputation, Role} from "../interfaces/IReputation.sol";
import {ParameterKeys} from "../libraries/ParameterKeys.sol";
import {
    Order,
    OrderStatus,
    SizeClass,
    DepositAuth,
    TokenConfig,
    Dispute,
    Milestone,
    MilestonePlan,
    MilestoneStatus,
    GroupInfo
} from "../libraries/OrderTypes.sol";
import {EscrowStorage} from "./EscrowStorage.sol";

contract DisputeModule is EscrowStorage {
    using SafeERC20 for IERC20;

    uint16 private constant HALF = 5000;

    constructor(IParameterRegistry registry_, address treasury_, ISignatureTransfer permit2_, address forwarder)
        EscrowStorage(registry_, treasury_, permit2_, forwarder)
    {}

    function selectors() external pure returns (bytes4[] memory selectors_) {
        selectors_ = new bytes4[](6);
        selectors_[0] = DisputeModule.setArbitration.selector;
        selectors_[1] = DisputeModule.openDispute.selector;
        selectors_[2] = DisputeModule.resolveDispute.selector;
        selectors_[3] = DisputeModule.getDispute.selector;
        selectors_[4] = DisputeModule.smallDisputesUsed.selector;
        selectors_[5] = DisputeModule.object.selector;
    }

    function setArbitration(IArbitration arbitration_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        arbitration = arbitration_;
        emit ArbitrationUpdated(address(arbitration_));
    }

    function openDispute(uint256 orderId, bytes32 reasonHash, DepositAuth calldata auth) external nonReentrant {
        Order storage order = _orders[orderId];
        _requireReviewState(orderId, order);
        address caller = _msgSender();
        if (caller != order.payer && caller != order.payee) revert NotParty(caller);
        _open(orderId, order, caller, reasonHash, auth);
    }

    function object(uint256 orderId, bytes32 reasonHash, DepositAuth calldata auth) external nonReentrant {
        Order storage order = _orders[orderId];
        if (order.status == OrderStatus.None) revert UnknownOrder(orderId);
        if (!order.isGroup) revert NotGroup();
        _requireReviewState(orderId, order);
        address caller = _msgSender();
        uint128 weight = _contributions[orderId][caller];
        if (weight == 0) revert NotContributor(caller);

        GroupInfo storage info = _groups[orderId];
        bytes32 key = _reviewKey(orderId, order);
        if (info.reviewKey != key) {
            info.reviewKey = key;
            info.objectionMoney = 0;
            info.objectionCount = 0;
        }
        if (_objectedAt[orderId][caller] == key) revert AlreadyVoted(caller);
        _objectedAt[orderId][caller] = key;
        info.objectionMoney += weight;
        info.objectionCount += 1;
        emit ObjectionRegistered(orderId, caller, info.objectionMoney, info.objectionCount);

        if (_thresholdReached(info.totalContributed, info.objectionMoney, info.objectionCount)) {
            _open(orderId, order, caller, reasonHash, auth);
        }
    }

    function resolveDispute(uint256 orderId, uint16 payeeShareBps, bool waiveCost, uint128 appealFee, address appellant)
        external
        nonReentrant
    {
        address caller = _msgSender();
        if (caller != address(arbitration)) revert NotArbitration(caller);
        if (payeeShareBps > BPS) revert InvalidShare(payeeShareBps);
        Order storage order = _requireStatus(orderId, OrderStatus.Disputed);
        _resolve(orderId, order, payeeShareBps, false, waiveCost, appealFee, appellant);
    }

    function getDispute(uint256 orderId) external view returns (Dispute memory) {
        return _disputes[orderId];
    }

    function smallDisputesUsed(address account) external view returns (uint8) {
        return _smallDisputesByAccount[account][block.timestamp / MONTH];
    }

    function _requireReviewState(uint256 orderId, Order storage order) private view {
        if (order.hasMilestones) {
            if (order.status != OrderStatus.Agreed) revert InvalidStatus(orderId, order.status);
            uint8 index = _plans[orderId].next;
            if (_milestones[orderId][index].status != MilestoneStatus.Delivered) revert MilestoneNotDelivered(index);
        } else {
            _requireStatus(orderId, OrderStatus.Delivered);
        }
    }

    function _reviewKey(uint256 orderId, Order storage order) private view returns (bytes32) {
        if (order.hasMilestones) {
            uint8 index = _plans[orderId].next;
            return keccak256(abi.encode(true, index, _milestones[orderId][index].deliveredAt));
        }
        return keccak256(abi.encode(false, order.deliveredAt));
    }

    function _open(uint256 orderId, Order storage order, address caller, bytes32 reasonHash, DepositAuth calldata auth)
        private
    {
        SizeClass size = order.sizeClass;
        if (order.hasMilestones) {
            size = _openMilestoneScope(orderId, order);
        } else {
            uint40 readyAt = _reviewDeadline(order);
            if (block.timestamp >= readyAt) revert ReviewWindowClosed(readyAt);
        }

        if (size == SizeClass.Small) {
            _openSmall(orderId, order, caller, reasonHash);
        } else {
            _openWithJury(orderId, order, caller, reasonHash, auth, size);
        }
    }

    function _openSmall(uint256 orderId, Order storage order, address caller, bytes32 reasonHash) private {
        uint256 month = block.timestamp / MONTH;
        uint8 used = _smallDisputesByAccount[caller][month];
        uint64 max = registry.get(ParameterKeys.SMALL_DISPUTES_PER_ACCOUNT_MONTH);
        if (used >= max) revert DisputeCapReached(max);
        _smallDisputesByAccount[caller][month] = used + 1;

        _disputes[orderId] = Dispute(caller, 0, uint40(block.timestamp), 0, reasonHash);
        emit DisputeOpened(orderId, caller, reasonHash, 0, 0);
        _resolve(orderId, order, HALF, true, false, 0, address(0));
    }

    function _openWithJury(
        uint256 orderId,
        Order storage order,
        address caller,
        bytes32 reasonHash,
        DepositAuth calldata auth,
        SizeClass size
    ) private {
        IArbitration court = arbitration;
        if (address(court) == address(0)) revert ArbitrationNotSet();

        uint8 jurors = uint8(
            registry.get(size == SizeClass.Medium ? ParameterKeys.JURY_SIZE_MEDIUM : ParameterKeys.JURY_SIZE_LARGE)
        );
        uint128 fee = _tokenConfigs[order.token].jurorFee * jurors;
        if (fee > 0) {
            _collect(order.token, caller, fee, auth);
            IERC20(order.token).safeTransfer(address(court), fee);
        }

        order.status = OrderStatus.Disputed;
        uint256 caseId = court.openCase(orderId, order.payer, order.payee, caller, fee, order.token, jurors, reasonHash);
        _disputes[orderId] = Dispute(caller, fee, uint40(block.timestamp), caseId, reasonHash);
        emit DisputeOpened(orderId, caller, reasonHash, caseId, fee);
    }

    struct Split {
        address claimant;
        uint128 gross;
        uint128 protocolFee;
        uint128 toPayee;
        uint128 toPayer;
        address appellant;
        uint128 cost;
        uint128 claimantRefund;
        uint128 appellantRefund;
    }

    function _resolve(
        uint256 orderId,
        Order storage order,
        uint16 share,
        bool automatic,
        bool waiveCost,
        uint128 appealFee,
        address appellant
    ) private {
        bool milestoned = order.hasMilestones;
        uint128 base = milestoned ? _milestones[orderId][_plans[orderId].disputedIndex].amount : order.price;
        Split memory split = _computeSplit(order, _disputes[orderId], share, waiveCost, base, appealFee, appellant);

        if (milestoned) {
            _applyMilestoneOutcome(orderId, order, split);
        } else {
            order.status = OrderStatus.Settled;
            order.settledAt = uint40(block.timestamp);
            order.paidOut = split.gross > 0;
            order.deposited = 0;
        }

        _pay(orderId, order, split);
        emit DisputeResolved(orderId, share, split.toPayee, split.toPayer, split.protocolFee, split.cost, automatic);
        _recordOutcome(orderId, order, share, split.gross, !milestoned);
    }

    function _openMilestoneScope(uint256 orderId, Order storage order) private returns (SizeClass) {
        MilestonePlan storage plan = _plans[orderId];
        uint8 index = plan.next;
        Milestone storage milestone = _milestones[orderId][index];
        if (milestone.status != MilestoneStatus.Delivered) revert MilestoneNotDelivered(index);
        uint40 readyAt = milestone.deliveredAt + uint40(registry.get(ParameterKeys.AUTO_RELEASE_MILESTONE));
        if (block.timestamp >= readyAt) revert ReviewWindowClosed(readyAt);
        plan.disputing = true;
        plan.disputedIndex = index;
        return _classify(_tokenConfigs[order.token], milestone.amount);
    }

    function _applyMilestoneOutcome(uint256 orderId, Order storage order, Split memory split) private {
        MilestonePlan storage plan = _plans[orderId];
        uint8 index = plan.disputedIndex;
        Milestone storage milestone = _milestones[orderId][index];
        milestone.status = MilestoneStatus.Paid;
        order.deposited -= milestone.amount;
        plan.next = index + 1;
        plan.started = true;
        plan.disputing = false;
        plan.progressBps = 0;
        plan.progressEvidence = bytes32(0);
        plan.paidTotal += split.toPayee;
        plan.refundedTotal += split.toPayer;
        plan.feeTotal += split.protocolFee;
        if (index + 1 == plan.count) _closeMilestoned(orderId, order, true);
        else order.status = OrderStatus.Agreed;
    }

    function _computeSplit(
        Order storage order,
        Dispute storage dispute,
        uint16 share,
        bool waiveCost,
        uint128 base,
        uint128 appealFee,
        address appellant
    ) private view returns (Split memory split) {
        split.claimant = dispute.claimant;
        split.gross = uint128((uint256(base) * share) / BPS);
        split.protocolFee = _protocolFee(_tokenConfigs[order.token], split.gross);
        split.toPayee = split.gross - split.protocolFee;
        split.toPayer = base - split.gross;
        split.appellant = appellant;
        split.cost = dispute.fee;
        if (waiveCost || share == HALF) return split;

        bool loserIsPayer = share > HALF;
        uint128 available = loserIsPayer ? split.toPayer : split.toPayee;
        if (split.cost > 0 && _claimantWins(split.claimant, order.payee, share)) {
            split.claimantRefund = split.cost < available ? split.cost : available;
            available -= split.claimantRefund;
        }
        if (appealFee > 0 && appellant != address(0) && _claimantWins(appellant, order.payee, share)) {
            split.appellantRefund = appealFee < available ? appealFee : available;
        }
        uint128 taken = split.claimantRefund + split.appellantRefund;
        if (loserIsPayer) split.toPayer -= taken;
        else split.toPayee -= taken;
    }

    function _pay(uint256 orderId, Order storage order, Split memory split) private {
        address token = order.token;
        _payout(token, order.payee, split.toPayee);
        _refundPayer(orderId, order, split.toPayer);
        _payout(token, treasury, split.protocolFee);
        _payout(token, split.claimant, split.claimantRefund);
        _payout(token, split.appellant, split.appellantRefund);
    }

    function _claimantWins(address claimant, address payee, uint16 share) private pure returns (bool) {
        return claimant == payee ? share > HALF : share < HALF;
    }

    function _recordOutcome(uint256 orderId, Order storage order, uint16 share, uint128 gross, bool settleOrder)
        private
    {
        IReputation target = reputation;
        if (address(target) == address(0)) return;
        address payer = order.payer;
        address payee = order.payee;
        try target.recordDispute(payer, Role.Requester, share > HALF) {}
        catch {
            emit HookFailed(orderId, IReputation.recordDispute.selector);
        }
        try target.recordDispute(payee, Role.Provider, share < HALF) {}
        catch {
            emit HookFailed(orderId, IReputation.recordDispute.selector);
        }
        if (gross == 0 || !settleOrder) return;
        bool qualifies = order.price > _tokenConfigs[order.token].reputationMin;
        try target.recordSettled(payer, payee, 0, true, true, qualifies) {}
        catch {
            emit HookFailed(orderId, IReputation.recordSettled.selector);
        }
    }

    function _reviewDeadline(Order storage order) private view returns (uint40) {
        uint256 window = registry.get(ParameterKeys.AUTO_RELEASE_SHORT);
        return order.deliveredAt + uint40(order.extended ? window * 2 : window);
    }
}
