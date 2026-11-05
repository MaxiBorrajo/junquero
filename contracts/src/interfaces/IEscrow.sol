// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEscrowEvents} from "./IEscrowEvents.sol";
import {IReputation} from "./IReputation.sol";
import {IArbitration} from "./IArbitration.sol";
import {
    Order,
    OrderStatus,
    CreateParams,
    DepositAuth,
    Reservation,
    Agreement,
    Release,
    TokenConfig,
    SizeClass,
    Dispute,
    Milestone,
    MilestonePlan,
    MilestoneTerms,
    MilestoneRelease,
    GroupParams,
    GroupInfo,
    WitnessAssignment,
    Attestation,
    AttestationRecord
} from "../libraries/OrderTypes.sol";

interface IEscrow is IEscrowEvents {
    function createOrder(CreateParams calldata params, DepositAuth calldata auth) external returns (uint256 orderId);
    function reserve(Reservation calldata reservation, bytes calldata payerSignature, bytes calldata payeeSignature)
        external;
    function withdrawReservation(uint256 orderId) external;
    function agree(Agreement calldata agreement, bytes calldata payerSignature, bytes calldata payeeSignature) external;
    function deliver(uint256 orderId, bytes32 evidenceHash) external;
    function release(Release calldata release, bytes calldata payerSignature) external;
    function autoRelease(uint256 orderId) external;
    function cancel(uint256 orderId) external;
    function reclaim(uint256 orderId) external;
    function checkIn(uint256 orderId) external;
    function confirmArrival(uint256 orderId) external;
    function claimNoShow(uint256 orderId) external;
    function extendReview(uint256 orderId) external;
    function requestChanges(uint256 orderId, bytes32 reasonHash) external;
    function moderate(uint256 orderId, bytes32 reasonHash) external;
    function claim(address token, address account) external;
    function setReputation(IReputation reputation) external;
    function agreeWithMilestones(
        Agreement calldata agreement,
        MilestoneTerms calldata terms,
        bytes calldata payerSignature,
        bytes calldata payeeSignature
    ) external;
    function deliverMilestone(uint256 orderId, uint8 index, bytes32 evidenceHash) external;
    function reportProgress(uint256 orderId, uint16 progressBps, bytes32 evidenceHash) external;
    function releaseMilestone(MilestoneRelease calldata release, bytes calldata payerSignature) external;
    function autoReleaseMilestone(uint256 orderId) external;
    function claimAdvance(uint256 orderId) external;
    function terminateEarly(uint256 orderId) external;
    function abandon(uint256 orderId) external;
    function declareAbandoned(uint256 orderId) external;
    function getMilestones(uint256 orderId) external view returns (Milestone[] memory);
    function getPlan(uint256 orderId) external view returns (MilestonePlan memory);
    function createGroupOrder(CreateParams calldata params, GroupParams calldata group)
        external
        returns (uint256 orderId);
    function contribute(uint256 orderId, uint128 amount, DepositAuth calldata auth) external;
    function withdrawContribution(uint256 orderId) external;
    function refundFunding(uint256 orderId) external;
    function proposeProvider(uint256 orderId, address payee) external;
    function vetoProvider(uint256 orderId) external;
    function supportCoordinator(uint256 orderId, address candidate) external;
    function object(uint256 orderId, bytes32 reasonHash, DepositAuth calldata auth) external;
    function assignWitness(
        WitnessAssignment calldata assignment,
        bytes calldata payerSignature,
        bytes calldata payeeSignature
    ) external;
    function attest(Attestation calldata attestation, bytes calldata witnessSignature) external;
    function claimWitnessFee(address token, address witness) external;
    function witnessOf(uint256 orderId) external view returns (address);
    function attestationOf(uint256 orderId, uint8 index) external view returns (AttestationRecord memory);
    function witnessOwed(address token, address witness) external view returns (uint256);
    function getGroup(uint256 orderId) external view returns (GroupInfo memory);
    function contributorsOf(uint256 orderId) external view returns (address[] memory);
    function contributionOf(uint256 orderId, address account) external view returns (uint128);
    function setArbitration(IArbitration arbitration) external;
    function openDispute(uint256 orderId, bytes32 reasonHash, DepositAuth calldata auth) external;
    function resolveDispute(uint256 orderId, uint16 payeeShareBps, bool waiveCost) external;
    function getDispute(uint256 orderId) external view returns (Dispute memory);
    function smallDisputesUsed(address account) external view returns (uint8);
    function claimable(address token, address account) external view returns (uint256);

    function configureToken(address token, TokenConfig calldata config) external;
    function getOrder(uint256 orderId) external view returns (Order memory);
    function tokenConfig(address token) external view returns (TokenConfig memory);
    function reservationCompensation(uint256 orderId) external view returns (uint128);
    function freeCancelsUsed(address payer, address payee) external view returns (uint8 account, uint8 pair);
    function domainSeparator() external view returns (bytes32);
}
