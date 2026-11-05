// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {IArbitration} from "../interfaces/IArbitration.sol";
import {IParameterRegistry} from "../interfaces/IParameterRegistry.sol";
import {IReputation, Role} from "../interfaces/IReputation.sol";
import {ParameterKeys} from "../libraries/ParameterKeys.sol";
import {Order, OrderStatus, SizeClass, DepositAuth, TokenConfig, Dispute} from "../libraries/OrderTypes.sol";
import {EscrowStorage} from "./EscrowStorage.sol";

contract DisputeModule is EscrowStorage {
    using SafeERC20 for IERC20;

    uint16 private constant HALF = 5000;

    constructor(IParameterRegistry registry_, address treasury_, ISignatureTransfer permit2_, address forwarder)
        EscrowStorage(registry_, treasury_, permit2_, forwarder)
    {}

    function selectors() external pure returns (bytes4[] memory selectors_) {
        selectors_ = new bytes4[](5);
        selectors_[0] = DisputeModule.setArbitration.selector;
        selectors_[1] = DisputeModule.openDispute.selector;
        selectors_[2] = DisputeModule.resolveDispute.selector;
        selectors_[3] = DisputeModule.getDispute.selector;
        selectors_[4] = DisputeModule.smallDisputesUsed.selector;
    }

    function setArbitration(IArbitration arbitration_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        arbitration = arbitration_;
        emit ArbitrationUpdated(address(arbitration_));
    }

    function openDispute(uint256 orderId, bytes32 reasonHash, DepositAuth calldata auth) external nonReentrant {
        Order storage order = _requireStatus(orderId, OrderStatus.Delivered);
        address caller = _msgSender();
        if (caller != order.payer && caller != order.payee) revert NotParty(caller);
        uint40 readyAt = _reviewDeadline(order);
        if (block.timestamp >= readyAt) revert ReviewWindowClosed(readyAt);

        if (order.sizeClass == SizeClass.Small) {
            _openSmall(orderId, order, caller, reasonHash);
        } else {
            _openWithJury(orderId, order, caller, reasonHash, auth);
        }
    }

    function resolveDispute(uint256 orderId, uint16 payeeShareBps, bool waiveCost) external nonReentrant {
        address caller = _msgSender();
        if (caller != address(arbitration)) revert NotArbitration(caller);
        if (payeeShareBps > BPS) revert InvalidShare(payeeShareBps);
        Order storage order = _requireStatus(orderId, OrderStatus.Disputed);
        _resolve(orderId, order, payeeShareBps, false, waiveCost);
    }

    function getDispute(uint256 orderId) external view returns (Dispute memory) {
        return _disputes[orderId];
    }

    function smallDisputesUsed(address account) external view returns (uint8) {
        return _smallDisputesByAccount[account][block.timestamp / MONTH];
    }

    function _openSmall(uint256 orderId, Order storage order, address caller, bytes32 reasonHash) private {
        uint256 month = block.timestamp / MONTH;
        uint8 used = _smallDisputesByAccount[caller][month];
        uint64 max = registry.get(ParameterKeys.SMALL_DISPUTES_PER_ACCOUNT_MONTH);
        if (used >= max) revert DisputeCapReached(max);
        _smallDisputesByAccount[caller][month] = used + 1;

        _disputes[orderId] = Dispute(caller, 0, uint40(block.timestamp), 0, reasonHash);
        emit DisputeOpened(orderId, caller, reasonHash, 0, 0);
        _resolve(orderId, order, HALF, true, false);
    }

    function _openWithJury(
        uint256 orderId,
        Order storage order,
        address caller,
        bytes32 reasonHash,
        DepositAuth calldata auth
    ) private {
        IArbitration court = arbitration;
        if (address(court) == address(0)) revert ArbitrationNotSet();

        uint8 jurors = uint8(
            registry.get(
                order.sizeClass == SizeClass.Medium ? ParameterKeys.JURY_SIZE_MEDIUM : ParameterKeys.JURY_SIZE_LARGE
            )
        );
        uint128 fee = _tokenConfigs[order.token].jurorFee * jurors;
        if (fee > 0) _collect(order.token, caller, fee, auth);

        order.status = OrderStatus.Disputed;
        uint256 caseId =
            court.openCase(orderId, order.payer, order.payee, caller, order.price, order.token, jurors, reasonHash);
        _disputes[orderId] = Dispute(caller, fee, uint40(block.timestamp), caseId, reasonHash);
        emit DisputeOpened(orderId, caller, reasonHash, caseId, fee);
    }

    struct Split {
        address claimant;
        uint128 gross;
        uint128 protocolFee;
        uint128 toPayee;
        uint128 toPayer;
        uint128 cost;
        uint128 claimantRefund;
    }

    function _resolve(uint256 orderId, Order storage order, uint16 share, bool automatic, bool waiveCost) private {
        Split memory split = _computeSplit(order, _disputes[orderId], share, waiveCost);

        order.status = OrderStatus.Settled;
        order.settledAt = uint40(block.timestamp);
        order.paidOut = split.gross > 0;
        order.deposited = 0;

        _pay(order, split);
        emit DisputeResolved(orderId, share, split.toPayee, split.toPayer, split.protocolFee, split.cost, automatic);
        _recordOutcome(orderId, order, share, split.gross);
    }

    function _computeSplit(Order storage order, Dispute storage dispute, uint16 share, bool waiveCost)
        private
        view
        returns (Split memory split)
    {
        split.claimant = dispute.claimant;
        split.gross = uint128((uint256(order.price) * share) / BPS);
        split.protocolFee = _protocolFee(_tokenConfigs[order.token], split.gross);
        split.toPayee = split.gross - split.protocolFee;
        split.toPayer = order.deposited - split.gross;
        if (waiveCost) {
            split.claimantRefund = dispute.fee;
            return split;
        }
        split.cost = dispute.fee;

        if (split.cost > 0 && _claimantWins(split.claimant, order.payee, share)) {
            bool respondentIsPayer = split.claimant == order.payee;
            uint128 respondentAmount = respondentIsPayer ? split.toPayer : split.toPayee;
            split.claimantRefund = split.cost < respondentAmount ? split.cost : respondentAmount;
            if (respondentIsPayer) split.toPayer -= split.claimantRefund;
            else split.toPayee -= split.claimantRefund;
        }
    }

    function _pay(Order storage order, Split memory split) private {
        address token = order.token;
        _payout(token, order.payee, split.toPayee);
        _payout(token, order.payer, split.toPayer);
        _payout(token, treasury, split.protocolFee);
        _payout(token, split.claimant, split.claimantRefund);
        _payout(token, address(arbitration), split.cost);
    }

    function _claimantWins(address claimant, address payee, uint16 share) private pure returns (bool) {
        return claimant == payee ? share > HALF : share < HALF;
    }

    function _recordOutcome(uint256 orderId, Order storage order, uint16 share, uint128 gross) private {
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
        if (gross == 0) return;
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
