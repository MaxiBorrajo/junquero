// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    Order,
    OrderStatus,
    CreateParams,
    DepositAuth,
    Reservation,
    Agreement,
    Release,
    TokenConfig,
    SizeClass
} from "../libraries/OrderTypes.sol";

interface IEscrowEvents {
    event OrderCreated(
        uint256 indexed orderId,
        address indexed payer,
        address indexed token,
        uint128 amount,
        bytes32 specHash,
        uint8 mode,
        uint8 modality,
        uint128 fee,
        uint8 category
    );
    event OrderReserved(uint256 indexed orderId, address indexed payee);
    event ReservationWithdrawn(uint256 indexed orderId, address indexed payee);
    event OrderAgreed(
        uint256 indexed orderId, address indexed payee, uint128 price, bytes32 termsHash, uint8 sizeClass
    );
    event OrderDelivered(uint256 indexed orderId, bytes32 evidenceHash);
    event OrderSettled(
        uint256 indexed orderId,
        address indexed payee,
        uint128 paid,
        uint128 refunded,
        uint128 fee,
        uint8 rating,
        bool automatic
    );
    event OrderCancelled(
        uint256 indexed orderId,
        address indexed by,
        uint8 reason,
        uint128 compensation,
        uint128 toTreasury,
        uint128 refunded
    );
    event OrderCheckedIn(uint256 indexed orderId, address indexed payee, uint40 at);
    event ArrivalConfirmed(uint256 indexed orderId, address indexed payer);
    event ReviewExtended(uint256 indexed orderId, uint40 readyAt);
    event TokenConfigured(address indexed token, TokenConfig config);
    event OrderModerated(uint256 indexed orderId, address indexed moderator, bytes32 reasonHash);
    event ChangesRequested(uint256 indexed orderId, bytes32 reasonHash, uint8 count);
    event PayoutDeferred(address indexed token, address indexed to, uint256 amount);
    event Claimed(address indexed token, address indexed account, uint256 amount);
    event ReputationUpdated(address indexed reputation);
    event HookFailed(uint256 indexed orderId, bytes4 selector);
    event DisputeOpened(
        uint256 indexed orderId, address indexed claimant, bytes32 reasonHash, uint256 caseId, uint128 fee
    );
    event DisputeResolved(
        uint256 indexed orderId,
        uint16 payeeShareBps,
        uint128 paidToPayee,
        uint128 refundedToPayer,
        uint128 protocolFee,
        uint128 arbitrationCost,
        bool automatic
    );
    event ArbitrationUpdated(address indexed arbitration);
    event MilestonesAgreed(uint256 indexed orderId, uint8 count, bool firstIsAdvance);
    event MilestoneDelivered(uint256 indexed orderId, uint8 index, bytes32 evidenceHash);
    event ProgressReported(uint256 indexed orderId, uint8 index, uint16 progressBps, bytes32 evidenceHash);
    event MilestonePaid(
        uint256 indexed orderId, uint8 index, uint128 paid, uint128 refunded, uint128 fee, uint8 rating, bool automatic
    );
    event OrderTerminated(
        uint256 indexed orderId, address indexed by, uint128 paidToPayee, uint128 toTreasury, uint128 refunded
    );
    event OrderAbandoned(uint256 indexed orderId, address indexed by, uint128 reopenedWith);
    event GroupCreated(
        uint256 indexed orderId, address indexed creator, address indexed coordinator, uint128 target, uint40 deadline
    );
    event Contributed(uint256 indexed orderId, address indexed contributor, uint128 amount, uint128 total);
    event ContributionWithdrawn(uint256 indexed orderId, address indexed contributor, uint128 amount);
    event FundingCompleted(uint256 indexed orderId);
    event FundingRefunded(uint256 indexed orderId, uint128 total);
    event ProviderProposed(uint256 indexed orderId, address indexed payee, uint40 readyAt);
    event ProviderVetoed(uint256 indexed orderId, address indexed by, uint128 money, uint8 count);
    event ProposalCleared(uint256 indexed orderId);
    event CoordinatorSupported(uint256 indexed orderId, address indexed by, address indexed candidate);
    event CoordinatorChanged(uint256 indexed orderId, address indexed previous, address indexed current);
    event WitnessAssigned(uint256 indexed orderId, address indexed witness);
    event Attested(uint256 indexed orderId, address indexed witness, uint8 index, bytes32 evidenceHash, bool approved);
    event WitnessPaid(uint256 indexed orderId, address indexed witness, uint128 fee);
    event WitnessFeeOwed(uint256 indexed orderId, address indexed witness, uint128 fee);
    event WitnessFeeClaimed(address indexed token, address indexed witness, uint256 amount);
    event ObjectionRegistered(uint256 indexed orderId, address indexed by, uint128 money, uint8 count);

    error TokenNotAllowed(address token);
    error InvalidAmount();
    error InvalidSchedule();
    error InvalidThresholds();
    error UnknownOrder(uint256 orderId);
    error InvalidStatus(uint256 orderId, OrderStatus current);
    error NotPayer(address caller);
    error NotPayee(address caller);
    error InvalidSignature(address signer);
    error SignatureExpired(uint40 expiry);
    error AgreementMismatch();
    error PriceExceedsDeposit(uint128 price, uint128 deposited);
    error PayeeIsPayer();
    error InvalidRating(uint8 rating);
    error ReleaseAmountExceedsPrice(uint128 amount, uint128 price);
    error EvidenceRequired();
    error AutoReleaseNotReady(uint40 readyAt);
    error FeeOnTransferToken(address token);
    error ZeroAddress();
    error UnsupportedForMode();
    error NotParty(address caller);
    error CheckInNotAllowed();
    error AlreadyCheckedIn();
    error NotCheckedIn();
    error ArrivalAlreadyConfirmed();
    error NoShowNotReady(uint40 readyAt);
    error DeadlineNotReached(uint40 deadline);
    error AlreadyExtended();
    error ReviewWindowClosed(uint40 readyAt);
    error ChangesNotAllowed();
    error ChangeRequestsExhausted(uint8 max);
    error NothingToClaim();
    error ArbitrationNotSet();
    error NotArbitration(address caller);
    error DisputeCapReached(uint64 max);
    error InvalidShare(uint16 share);
    error MilestonesRequired();
    error InvalidMilestones();
    error UseMilestones();
    error MilestonesInProgress();
    error WrongMilestone(uint8 index, uint8 expected);
    error MilestoneNotDelivered(uint8 index);
    error MilestoneNotPending(uint8 index);
    error AdvanceNotAllowed();
    error InvalidProgress(uint16 progressBps);
    error NotGroup();
    error GroupOnly();
    error NotContributor(address account);
    error ContributionOutOfRange(uint128 min, uint128 max);
    error ExceedsTarget(uint128 remaining);
    error TooManyContributors();
    error FundingClosed();
    error FundingNotExpired(uint40 deadline);
    error InvalidDeadline();
    error NoProposal();
    error VetoWindowOpen(uint40 readyAt);
    error ProviderIsContributor(address payee);
    error AlreadyVoted(address account);
    error InvalidCoordinator(address candidate);
    error GroupAgreementNeedsProposal();
    error WitnessRequired();
    error WitnessAlreadyAssigned(address witness);
    error WitnessNotAssigned();
    error InvalidWitness(address witness);
    error WitnessAttestationMissing(uint8 index);
    error AlreadyAttested(uint8 index);
    error EvidenceMismatch();
    error NothingOwed();
    error VetoWindowClosed(uint40 readyAt);
    error NotAvailableForGroup();
}
