// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {IParameterRegistry} from "../interfaces/IParameterRegistry.sol";
import {IReputation, Role} from "../interfaces/IReputation.sol";
import {EscrowHashes} from "../libraries/EscrowHashes.sol";
import {ParameterKeys} from "../libraries/ParameterKeys.sol";
import {
    Order,
    OrderStatus,
    PaymentMode,
    CancelReason,
    Agreement,
    Milestone,
    MilestonePlan,
    MilestoneStatus,
    MilestoneTerms,
    MilestoneRelease,
    TokenConfig
} from "../libraries/OrderTypes.sol";
import {EscrowStorage} from "./EscrowStorage.sol";

contract MilestoneModule is EscrowStorage {
    uint8 private constant MAX_MILESTONES = 20;

    constructor(IParameterRegistry registry_, address treasury_, ISignatureTransfer permit2_, address forwarder)
        EscrowStorage(registry_, treasury_, permit2_, forwarder)
    {}

    function selectors() external pure returns (bytes4[] memory selectors_) {
        selectors_ = new bytes4[](11);
        selectors_[0] = MilestoneModule.agreeWithMilestones.selector;
        selectors_[1] = MilestoneModule.deliverMilestone.selector;
        selectors_[2] = MilestoneModule.reportProgress.selector;
        selectors_[3] = MilestoneModule.releaseMilestone.selector;
        selectors_[4] = MilestoneModule.autoReleaseMilestone.selector;
        selectors_[5] = MilestoneModule.claimAdvance.selector;
        selectors_[6] = MilestoneModule.terminateEarly.selector;
        selectors_[7] = MilestoneModule.abandon.selector;
        selectors_[8] = MilestoneModule.declareAbandoned.selector;
        selectors_[9] = MilestoneModule.getMilestones.selector;
        selectors_[10] = MilestoneModule.getPlan.selector;
    }

    function agreeWithMilestones(
        Agreement calldata agreement,
        MilestoneTerms calldata terms,
        bytes calldata payerSignature,
        bytes calldata payeeSignature
    ) external nonReentrant {
        Order storage order = _orders[agreement.orderId];
        if (order.status == OrderStatus.None) revert UnknownOrder(agreement.orderId);
        if (order.mode != PaymentMode.Escrowed) revert UnsupportedForMode();
        _validateTerms(agreement, terms, agreement.payee);

        order.hasMilestones = true;
        MilestonePlan storage plan = _plans[agreement.orderId];
        plan.count = uint8(terms.amounts.length);
        plan.firstIsAdvance = terms.firstIsAdvance;
        Milestone[] storage list = _milestones[agreement.orderId];
        for (uint256 i = 0; i < terms.amounts.length; i++) {
            list.push(Milestone(terms.amounts[i], MilestoneStatus.Pending, 0, bytes32(0)));
        }

        _agree(agreement, payerSignature, payeeSignature, true);
        emit MilestonesAgreed(agreement.orderId, plan.count, terms.firstIsAdvance);
    }

    function deliverMilestone(uint256 orderId, uint8 index, bytes32 evidenceHash) external {
        (Order storage order, MilestonePlan storage plan) = _activePlan(orderId);
        address caller = _msgSender();
        if (caller != order.payee) revert NotPayee(caller);
        if (index != plan.next) revert WrongMilestone(index, plan.next);
        if (evidenceHash == bytes32(0)) revert EvidenceRequired();
        Milestone storage milestone = _milestones[orderId][index];
        if (milestone.status != MilestoneStatus.Pending) revert MilestoneNotPending(index);
        _requireWitnessAssigned(orderId, order);

        milestone.status = MilestoneStatus.Delivered;
        milestone.deliveredAt = uint40(block.timestamp);
        milestone.evidenceHash = evidenceHash;
        plan.started = true;
        emit MilestoneDelivered(orderId, index, evidenceHash);
    }

    function reportProgress(uint256 orderId, uint16 progressBps, bytes32 evidenceHash) external {
        (Order storage order, MilestonePlan storage plan) = _activePlan(orderId);
        address caller = _msgSender();
        if (caller != order.payee) revert NotPayee(caller);
        if (progressBps > BPS) revert InvalidProgress(progressBps);
        if (evidenceHash == bytes32(0)) revert EvidenceRequired();
        if (_milestones[orderId][plan.next].status != MilestoneStatus.Pending) revert MilestoneNotPending(plan.next);

        plan.progressBps = progressBps;
        plan.progressEvidence = evidenceHash;
        plan.started = true;
        emit ProgressReported(orderId, plan.next, progressBps, evidenceHash);
    }

    function releaseMilestone(MilestoneRelease calldata release, bytes calldata payerSignature) external nonReentrant {
        (Order storage order, MilestonePlan storage plan) = _activePlan(release.orderId);
        address caller = _msgSender();
        if (caller != order.payee) revert NotPayee(caller);
        if (release.index != plan.next) revert WrongMilestone(release.index, plan.next);
        if (block.timestamp > release.expiry) revert SignatureExpired(release.expiry);
        if (release.rating == 0 || release.rating > 5) revert InvalidRating(release.rating);
        Milestone storage milestone = _milestones[release.orderId][release.index];
        if (release.amount > milestone.amount) revert ReleaseAmountExceedsPrice(release.amount, milestone.amount);

        if (!(release.index == 0 && plan.firstIsAdvance)) {
            _requireWitnessApproval(release.orderId, order, release.index, milestone.evidenceHash);
        }
        _verify(order.payer, _hashTypedDataV4(EscrowHashes.hash(release)), payerSignature);
        _payMilestone(release.orderId, order, release.index, release.amount, release.rating, false);
    }

    function autoReleaseMilestone(uint256 orderId) external nonReentrant {
        (Order storage order, MilestonePlan storage plan) = _activePlan(orderId);
        uint8 index = plan.next;
        Milestone storage milestone = _milestones[orderId][index];
        if (milestone.status != MilestoneStatus.Delivered) revert MilestoneNotDelivered(index);
        uint40 readyAt = milestone.deliveredAt + uint40(registry.get(ParameterKeys.AUTO_RELEASE_MILESTONE));
        if (block.timestamp < readyAt) revert AutoReleaseNotReady(readyAt);
        _requireWitnessApproval(orderId, order, index, milestone.evidenceHash);
        _payMilestone(orderId, order, index, milestone.amount, 0, true);
    }

    function claimAdvance(uint256 orderId) external nonReentrant {
        (Order storage order, MilestonePlan storage plan) = _activePlan(orderId);
        address caller = _msgSender();
        if (caller != order.payee) revert NotPayee(caller);
        if (!plan.firstIsAdvance || plan.next != 0) revert AdvanceNotAllowed();
        Milestone storage first = _milestones[orderId][0];
        if (first.status != MilestoneStatus.Pending) revert MilestoneNotPending(0);
        _requireAdvanceStanding(order.payee);
        _payMilestone(orderId, order, 0, first.amount, 0, true);
    }

    function terminateEarly(uint256 orderId) external nonReentrant {
        (Order storage order, MilestonePlan storage plan) = _activePlan(orderId);
        address caller = _msgSender();
        if (caller != order.payer) revert NotPayer(caller);
        Milestone storage current = _milestones[orderId][plan.next];
        if (current.status == MilestoneStatus.Delivered) revert MilestoneNotPending(plan.next);

        uint128 progressPart = uint128((uint256(current.amount) * plan.progressBps) / BPS);
        uint128 compensation = uint128(
            ((uint256(order.deposited) - progressPart) * registry.get(ParameterKeys.TERMINATION_COMP_BPS)) / BPS
        );
        (uint128 compToPayee, uint128 compToTreasury) = _shares(compensation);
        uint128 fee = _protocolFee(_tokenConfigs[order.token], progressPart);
        uint128 toPayee = progressPart - fee + compToPayee;
        uint128 toTreasury = fee + compToTreasury;
        uint128 refund = order.deposited - progressPart - compensation;

        order.status = OrderStatus.Cancelled;
        order.deposited = 0;
        address token = order.token;
        _payout(token, order.payee, toPayee);
        _payout(token, treasury, toTreasury);
        _refundPayer(orderId, order, refund);
        emit OrderTerminated(orderId, caller, toPayee, toTreasury, refund);
    }

    function abandon(uint256 orderId) external nonReentrant {
        (Order storage order,) = _activePlan(orderId);
        address caller = _msgSender();
        if (caller != order.payee) revert NotPayee(caller);
        _reopen(orderId, order, caller);
    }

    function declareAbandoned(uint256 orderId) external nonReentrant {
        (Order storage order,) = _activePlan(orderId);
        address caller = _msgSender();
        if (caller != order.payer) revert NotPayer(caller);
        if (order.deadline == 0 || block.timestamp <= order.deadline) revert DeadlineNotReached(order.deadline);
        uint8 current = _plans[orderId].next;
        if (_milestones[orderId][current].status == MilestoneStatus.Delivered) revert MilestoneNotPending(current);
        _reopen(orderId, order, caller);
    }

    function getMilestones(uint256 orderId) external view returns (Milestone[] memory) {
        return _milestones[orderId];
    }

    function getPlan(uint256 orderId) external view returns (MilestonePlan memory) {
        return _plans[orderId];
    }

    function _activePlan(uint256 orderId) private view returns (Order storage order, MilestonePlan storage plan) {
        order = _requireStatus(orderId, OrderStatus.Agreed);
        if (!order.hasMilestones) revert InvalidMilestones();
        plan = _plans[orderId];
    }

    function _validateTerms(Agreement calldata agreement, MilestoneTerms calldata terms, address payee) private view {
        uint256 count = terms.amounts.length;
        if (count < 2 || count > MAX_MILESTONES || terms.criteria.length != count) revert InvalidMilestones();
        uint256 sum;
        for (uint256 i = 0; i < count; i++) {
            if (terms.amounts[i] == 0) revert InvalidMilestones();
            sum += terms.amounts[i];
        }
        if (sum != agreement.price) revert InvalidMilestones();
        bytes32 expected = keccak256(abi.encode(terms.baseTerms, terms.amounts, terms.criteria, terms.firstIsAdvance));
        if (agreement.termsHash != expected) revert AgreementMismatch();
        if (terms.firstIsAdvance) {
            if (
                uint256(terms.amounts[0]) * BPS > uint256(agreement.price) * registry.get(ParameterKeys.ADVANCE_MAX_BPS)
            ) {
                revert AdvanceNotAllowed();
            }
            _requireAdvanceStanding(payee);
        }
    }

    function _requireAdvanceStanding(address payee) private view {
        IReputation target = reputation;
        if (address(target) == address(0)) revert AdvanceNotAllowed();
        if (target.closedWithoutDispute(payee) < registry.get(ParameterKeys.ADVANCE_MIN_CLOSED_ORDERS)) {
            revert AdvanceNotAllowed();
        }
    }

    function _reopen(uint256 orderId, Order storage order, address by) private {
        address abandoned = order.payee;
        uint128 remaining = order.deposited;
        delete _milestones[orderId];
        delete _plans[orderId];

        order.status = OrderStatus.Open;
        order.payee = address(0);
        order.price = 0;
        order.termsHash = bytes32(0);
        order.agreedAt = 0;
        order.startsAt = 0;
        order.deadline = 0;
        order.checkedInAt = 0;
        order.arrivalConfirmed = false;
        order.hasMilestones = false;
        emit OrderAbandoned(orderId, by, remaining);
        _recordFailure(orderId, abandoned, Role.Provider);
    }
}
