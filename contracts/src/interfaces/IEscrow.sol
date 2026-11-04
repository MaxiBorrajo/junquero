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

interface IEscrow {
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
    function claimable(address token, address account) external view returns (uint256);

    function configureToken(address token, TokenConfig calldata config) external;
    function getOrder(uint256 orderId) external view returns (Order memory);
    function tokenConfig(address token) external view returns (TokenConfig memory);
    function reservationCompensation(uint256 orderId) external view returns (uint128);
    function freeCancelsUsed(address payer, address payee) external view returns (uint8 account, uint8 pair);
    function domainSeparator() external view returns (bytes32);
}
