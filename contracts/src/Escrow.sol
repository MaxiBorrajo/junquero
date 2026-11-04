// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {IEscrow} from "./interfaces/IEscrow.sol";
import {IParameterRegistry} from "./interfaces/IParameterRegistry.sol";
import {IReputation, Role} from "./interfaces/IReputation.sol";
import {EscrowHashes} from "./libraries/EscrowHashes.sol";
import {ParameterKeys} from "./libraries/ParameterKeys.sol";
import {
    Order,
    OrderStatus,
    PaymentMode,
    Modality,
    DepositMethod,
    SizeClass,
    CancelReason,
    CreateParams,
    DepositAuth,
    Reservation,
    Agreement,
    Release,
    TokenConfig
} from "./libraries/OrderTypes.sol";

contract Escrow is IEscrow, EIP712, ERC2771Context, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant TOKEN_ADMIN_ROLE = keccak256("TOKEN_ADMIN_ROLE");
    bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");
    uint256 private constant BPS = 10_000;
    uint256 private constant MONTH = 30 days;

    IParameterRegistry public immutable registry;
    address public immutable treasury;
    ISignatureTransfer public immutable permit2;

    IReputation public reputation;
    uint256 public lastOrderId;

    mapping(uint256 orderId => Order) private _orders;
    mapping(address token => TokenConfig) private _tokenConfigs;
    mapping(address token => mapping(address account => uint256)) public claimable;
    mapping(address payer => mapping(uint256 month => uint8)) private _freeCancelsByAccount;
    mapping(bytes32 pair => mapping(uint256 month => uint8)) private _freeCancelsByPair;

    constructor(
        address admin,
        IParameterRegistry registry_,
        address treasury_,
        ISignatureTransfer permit2_,
        address forwarder
    ) EIP712("Escrow", "1") ERC2771Context(forwarder) {
        if (admin == address(0) || treasury_ == address(0) || address(registry_) == address(0)) revert ZeroAddress();
        registry = registry_;
        treasury = treasury_;
        permit2 = permit2_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TOKEN_ADMIN_ROLE, admin);
        _grantRole(MODERATOR_ROLE, admin);
    }

    function createOrder(CreateParams calldata params, DepositAuth calldata auth)
        external
        nonReentrant
        returns (uint256 orderId)
    {
        address payer = _msgSender();
        TokenConfig storage config = _tokenConfigs[params.token];
        if (!config.allowed) revert TokenNotAllowed(params.token);
        if (params.amount == 0) revert InvalidAmount();
        _checkSchedule(params.startsAt, params.deadline);

        bool escrowed = params.mode == PaymentMode.Escrowed;
        uint128 fee = escrowed ? 0 : _cashFee(config, params.amount);

        orderId = ++lastOrderId;
        Order storage order = _orders[orderId];
        order.payer = payer;
        order.status = OrderStatus.Open;
        order.mode = params.mode;
        order.modality = params.modality;
        order.createdAt = uint40(block.timestamp);
        order.startsAt = params.startsAt;
        order.deadline = params.deadline;
        order.token = params.token;
        order.specHash = params.specHash;
        order.category = params.category;
        if (escrowed) order.deposited = params.amount;
        else order.price = params.amount;

        _collect(params.token, payer, escrowed ? params.amount : fee, auth);
        _payout(params.token, treasury, fee);

        _emitCreated(orderId, payer, params, fee);
    }

    function reserve(Reservation calldata reservation, bytes calldata payerSignature, bytes calldata payeeSignature)
        external
    {
        Order storage order = _requireStatus(reservation.orderId, OrderStatus.Open);
        if (reservation.payer != order.payer) revert NotPayer(reservation.payer);
        if (reservation.payee == reservation.payer) revert PayeeIsPayer();
        if (block.timestamp > reservation.expiry) revert SignatureExpired(reservation.expiry);

        bytes32 digest = _hashTypedDataV4(EscrowHashes.hash(reservation));
        _verify(reservation.payer, digest, payerSignature);
        _verify(reservation.payee, digest, payeeSignature);

        order.status = OrderStatus.Reserved;
        order.reservedPayee = reservation.payee;
        order.reservedAt = uint40(block.timestamp);
        emit OrderReserved(reservation.orderId, reservation.payee);
    }

    function withdrawReservation(uint256 orderId) external {
        Order storage order = _requireStatus(orderId, OrderStatus.Reserved);
        address caller = _msgSender();
        if (caller != order.reservedPayee) revert NotPayee(caller);
        order.status = OrderStatus.Open;
        order.reservedPayee = address(0);
        order.reservedAt = 0;
        emit ReservationWithdrawn(orderId, caller);
    }

    function agree(Agreement calldata agreement, bytes calldata payerSignature, bytes calldata payeeSignature)
        external
        nonReentrant
    {
        Order storage order = _orders[agreement.orderId];
        OrderStatus status = order.status;
        if (status == OrderStatus.None) revert UnknownOrder(agreement.orderId);
        if (status != OrderStatus.Open && status != OrderStatus.Reserved) {
            revert InvalidStatus(agreement.orderId, status);
        }
        if (agreement.payer != order.payer) revert NotPayer(agreement.payer);
        if (agreement.payee == agreement.payer) revert PayeeIsPayer();
        if (status == OrderStatus.Reserved && agreement.payee != order.reservedPayee) revert AgreementMismatch();
        if (agreement.specHash != order.specHash) revert AgreementMismatch();
        if (block.timestamp > agreement.expiry) revert SignatureExpired(agreement.expiry);
        if (agreement.price == 0) revert InvalidAmount();

        bool escrowed = order.mode == PaymentMode.Escrowed;
        if (escrowed && agreement.price > order.deposited) {
            revert PriceExceedsDeposit(agreement.price, order.deposited);
        }

        bytes32 digest = _hashTypedDataV4(EscrowHashes.hash(agreement));
        _verify(agreement.payer, digest, payerSignature);
        _verify(agreement.payee, digest, payeeSignature);

        uint128 refund = escrowed ? order.deposited - agreement.price : 0;
        SizeClass sizeClass = _classify(_tokenConfigs[order.token], agreement.price);

        order.status = OrderStatus.Agreed;
        order.payee = agreement.payee;
        order.price = agreement.price;
        order.termsHash = agreement.termsHash;
        order.agreedAt = uint40(block.timestamp);
        order.sizeClass = sizeClass;
        order.reservedPayee = address(0);
        order.reservedAt = 0;
        if (escrowed) order.deposited = agreement.price;

        _payout(order.token, order.payer, refund);
        emit OrderAgreed(agreement.orderId, agreement.payee, agreement.price, agreement.termsHash, uint8(sizeClass));
    }

    function deliver(uint256 orderId, bytes32 evidenceHash) external {
        Order storage order = _requireStatus(orderId, OrderStatus.Agreed);
        address caller = _msgSender();
        if (caller != order.payee) revert NotPayee(caller);
        if (order.mode != PaymentMode.Escrowed) revert UnsupportedForMode();
        if (evidenceHash == bytes32(0)) revert EvidenceRequired();
        order.status = OrderStatus.Delivered;
        order.deliveredAt = uint40(block.timestamp);
        order.evidenceHash = evidenceHash;
        emit OrderDelivered(orderId, evidenceHash);
    }

    function release(Release calldata releaseData, bytes calldata payerSignature) external nonReentrant {
        Order storage order = _orders[releaseData.orderId];
        OrderStatus status = order.status;
        if (status == OrderStatus.None) revert UnknownOrder(releaseData.orderId);
        if (status != OrderStatus.Agreed && status != OrderStatus.Delivered) {
            revert InvalidStatus(releaseData.orderId, status);
        }
        address caller = _msgSender();
        if (caller != order.payee) revert NotPayee(caller);
        if (releaseData.payee != order.payee) revert NotPayee(releaseData.payee);
        if (block.timestamp > releaseData.expiry) revert SignatureExpired(releaseData.expiry);
        if (releaseData.rating == 0 || releaseData.rating > 5) revert InvalidRating(releaseData.rating);
        if (releaseData.amount > order.price) revert ReleaseAmountExceedsPrice(releaseData.amount, order.price);

        _verify(order.payer, _hashTypedDataV4(EscrowHashes.hash(releaseData)), payerSignature);
        if (order.mode == PaymentMode.Cash) {
            order.status = OrderStatus.Settled;
            order.settledAt = uint40(block.timestamp);
            emit OrderSettled(releaseData.orderId, caller, 0, 0, 0, releaseData.rating, false);
            _recordCash(releaseData.orderId, order, releaseData.rating);
            return;
        }
        _settle(releaseData.orderId, order, releaseData.amount, releaseData.rating, false);
    }

    function autoRelease(uint256 orderId) external nonReentrant {
        Order storage order = _requireStatus(orderId, OrderStatus.Delivered);
        uint40 readyAt = _reviewDeadline(order);
        if (block.timestamp < readyAt) revert AutoReleaseNotReady(readyAt);
        _settle(orderId, order, order.price, 0, true);
    }

    function cancel(uint256 orderId) external nonReentrant {
        Order storage order = _orders[orderId];
        OrderStatus status = order.status;
        if (status == OrderStatus.None) revert UnknownOrder(orderId);
        address caller = _msgSender();

        if (status == OrderStatus.Open || status == OrderStatus.Reserved) {
            if (caller != order.payer) revert NotPayer(caller);
            _finishCancel(
                orderId,
                order,
                caller,
                CancelReason.PayerCancelled,
                order.reservedPayee,
                _reservationCompensation(order),
                0
            );
        } else if (status == OrderStatus.Agreed) {
            if (caller == order.payee) {
                _finishCancel(orderId, order, caller, CancelReason.PayeeCancelled, caller, 0, 0);
                _recordFailure(orderId, caller, Role.Provider);
            } else if (caller == order.payer) {
                (uint128 toPayee, uint128 toTreasury) = _lateCancelShares(order);
                _finishCancel(orderId, order, caller, CancelReason.PayerCancelled, order.payee, toPayee, toTreasury);
            } else {
                revert NotParty(caller);
            }
        } else {
            revert InvalidStatus(orderId, status);
        }
    }

    function reclaim(uint256 orderId) external nonReentrant {
        Order storage order = _requireStatus(orderId, OrderStatus.Agreed);
        if (order.deadline == 0 || block.timestamp <= order.deadline) revert DeadlineNotReached(order.deadline);
        _finishCancel(orderId, order, _msgSender(), CancelReason.Expired, address(0), 0, 0);
        _recordFailure(orderId, order.payee, Role.Provider);
    }

    function checkIn(uint256 orderId) external {
        Order storage order = _requireStatus(orderId, OrderStatus.Agreed);
        address caller = _msgSender();
        if (caller != order.payee) revert NotPayee(caller);
        if (order.mode != PaymentMode.Escrowed || order.modality != Modality.OnSite) revert CheckInNotAllowed();
        if (order.startsAt == 0 || block.timestamp < order.startsAt) revert CheckInNotAllowed();
        if (order.checkedInAt != 0) revert AlreadyCheckedIn();
        order.checkedInAt = uint40(block.timestamp);
        emit OrderCheckedIn(orderId, caller, uint40(block.timestamp));
    }

    function confirmArrival(uint256 orderId) external {
        Order storage order = _requireStatus(orderId, OrderStatus.Agreed);
        address caller = _msgSender();
        if (caller != order.payer) revert NotPayer(caller);
        if (order.checkedInAt == 0) revert NotCheckedIn();
        if (order.arrivalConfirmed) revert ArrivalAlreadyConfirmed();
        order.arrivalConfirmed = true;
        emit ArrivalConfirmed(orderId, caller);
    }

    function claimNoShow(uint256 orderId) external nonReentrant {
        Order storage order = _requireStatus(orderId, OrderStatus.Agreed);
        address caller = _msgSender();
        if (caller != order.payee) revert NotPayee(caller);
        if (order.checkedInAt == 0) revert NotCheckedIn();
        if (order.arrivalConfirmed) revert ArrivalAlreadyConfirmed();
        uint40 readyAt = order.checkedInAt + uint40(registry.get(ParameterKeys.NO_SHOW_WAIT));
        if (block.timestamp < readyAt) revert NoShowNotReady(readyAt);

        uint256 total = (uint256(order.price) * registry.get(ParameterKeys.NO_SHOW_COMPENSATION_BPS)) / BPS;
        (uint128 toPayee, uint128 toTreasury) = _shares(total);
        _finishCancel(orderId, order, caller, CancelReason.NoShow, caller, toPayee, toTreasury);
        _recordFailure(orderId, order.payer, Role.Requester);
    }

    function extendReview(uint256 orderId) external {
        Order storage order = _requireStatus(orderId, OrderStatus.Delivered);
        address caller = _msgSender();
        if (caller != order.payer) revert NotPayer(caller);
        if (order.extended) revert AlreadyExtended();
        uint40 readyAt = _reviewDeadline(order);
        if (block.timestamp >= readyAt) revert ReviewWindowClosed(readyAt);
        order.extended = true;
        uint40 newReadyAt = _reviewDeadline(order);
        emit ReviewExtended(orderId, newReadyAt);
    }

    function requestChanges(uint256 orderId, bytes32 reasonHash) external {
        Order storage order = _requireStatus(orderId, OrderStatus.Delivered);
        address caller = _msgSender();
        if (caller != order.payer) revert NotPayer(caller);
        if (order.modality != Modality.Remote || order.mode != PaymentMode.Escrowed) revert ChangesNotAllowed();
        uint64 max = registry.get(ParameterKeys.REQUEST_CHANGES_MAX);
        if (order.changeRequests >= max) revert ChangeRequestsExhausted(uint8(max));
        uint40 readyAt = _reviewDeadline(order);
        if (block.timestamp >= readyAt) revert ReviewWindowClosed(readyAt);
        order.changeRequests += 1;
        order.status = OrderStatus.Agreed;
        order.deliveredAt = 0;
        order.evidenceHash = bytes32(0);
        emit ChangesRequested(orderId, reasonHash, order.changeRequests);
    }

    function moderate(uint256 orderId, bytes32 reasonHash) external nonReentrant onlyRole(MODERATOR_ROLE) {
        Order storage order = _orders[orderId];
        OrderStatus status = order.status;
        if (status == OrderStatus.None) revert UnknownOrder(orderId);
        if (status != OrderStatus.Open && status != OrderStatus.Reserved) revert InvalidStatus(orderId, status);
        address moderator = _msgSender();
        emit OrderModerated(orderId, moderator, reasonHash);
        _finishCancel(orderId, order, moderator, CancelReason.Moderated, address(0), 0, 0);
    }

    function claim(address token, address account) external nonReentrant {
        uint256 amount = claimable[token][account];
        if (amount == 0) revert NothingToClaim();
        claimable[token][account] = 0;
        IERC20(token).safeTransfer(account, amount);
        emit Claimed(token, account, amount);
    }

    function setReputation(IReputation reputation_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        reputation = reputation_;
        emit ReputationUpdated(address(reputation_));
    }

    function configureToken(address token, TokenConfig calldata config) external onlyRole(TOKEN_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        if (config.smallMax > config.mediumMax) revert InvalidThresholds();
        _tokenConfigs[token] = config;
        emit TokenConfigured(token, config);
    }

    function getOrder(uint256 orderId) external view returns (Order memory) {
        return _orders[orderId];
    }

    function tokenConfig(address token) external view returns (TokenConfig memory) {
        return _tokenConfigs[token];
    }

    function reservationCompensation(uint256 orderId) external view returns (uint128) {
        return _reservationCompensation(_orders[orderId]);
    }

    function freeCancelsUsed(address payer, address payee) external view returns (uint8 account, uint8 pair) {
        uint256 month = block.timestamp / MONTH;
        account = _freeCancelsByAccount[payer][month];
        pair = _freeCancelsByPair[_pairKey(payer, payee)][month];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function _recordSettled(uint256 orderId, Order storage order, uint8 rating, bool automatic) private {
        IReputation target = reputation;
        if (address(target) == address(0)) return;
        bool qualifies = order.price > _tokenConfigs[order.token].reputationMin;
        try target.recordSettled(order.payer, order.payee, rating, automatic, false, qualifies) {}
        catch {
            emit HookFailed(orderId, IReputation.recordSettled.selector);
        }
    }

    function _recordCash(uint256 orderId, Order storage order, uint8 rating) private {
        IReputation target = reputation;
        if (address(target) == address(0)) return;
        try target.recordCash(order.payer, order.payee, rating) {}
        catch {
            emit HookFailed(orderId, IReputation.recordCash.selector);
        }
    }

    function _recordFailure(uint256 orderId, address account, Role role) private {
        IReputation target = reputation;
        if (address(target) == address(0)) return;
        try target.recordFailure(account, role) {}
        catch {
            emit HookFailed(orderId, IReputation.recordFailure.selector);
        }
    }

    function _emitCreated(uint256 orderId, address payer, CreateParams calldata params, uint128 fee) private {
        emit OrderCreated(
            orderId,
            payer,
            params.token,
            params.amount,
            params.specHash,
            uint8(params.mode),
            uint8(params.modality),
            fee,
            params.category
        );
    }

    function _payout(address token, address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20.transfer, (to, amount)));
        bool delivered = ok && (data.length == 0 ? token.code.length > 0 : abi.decode(data, (bool)));
        if (delivered) return;
        claimable[token][to] += amount;
        emit PayoutDeferred(token, to, amount);
    }

    function _settle(uint256 orderId, Order storage order, uint128 amount, uint8 rating, bool automatic) private {
        TokenConfig storage config = _tokenConfigs[order.token];
        uint128 fee = _protocolFee(config, amount);
        uint128 paid = amount - fee;
        uint128 refunded = order.deposited - amount;
        address payee = order.payee;
        address payer = order.payer;
        address token = order.token;

        order.status = OrderStatus.Settled;
        order.settledAt = uint40(block.timestamp);
        order.paidOut = amount > 0;
        order.deposited = 0;

        _payout(token, payee, paid);
        _payout(token, treasury, fee);
        _payout(token, payer, refunded);
        emit OrderSettled(orderId, payee, paid, refunded, fee, rating, automatic);
        _recordSettled(orderId, order, rating, automatic);
    }

    function _finishCancel(
        uint256 orderId,
        Order storage order,
        address by,
        CancelReason reason,
        address recipient,
        uint128 toRecipient,
        uint128 toTreasury
    ) private {
        address token = order.token;
        address payer = order.payer;
        uint128 refund = order.deposited - toRecipient - toTreasury;

        order.status = OrderStatus.Cancelled;
        order.deposited = 0;
        order.reservedPayee = address(0);
        order.reservedAt = 0;

        _payout(token, recipient, toRecipient);
        _payout(token, treasury, toTreasury);
        _payout(token, payer, refund);
        emit OrderCancelled(orderId, by, uint8(reason), toRecipient, toTreasury, refund);
    }

    function _lateCancelShares(Order storage order) private returns (uint128, uint128) {
        if (order.mode == PaymentMode.Cash || _consumeFreeCancel(order)) return (0, 0);
        return _shares((uint256(order.price) * registry.get(ParameterKeys.CANCEL_FEE_AGREED_BPS)) / BPS);
    }

    function _consumeFreeCancel(Order storage order) private returns (bool) {
        if (order.startsAt == 0 || block.timestamp + registry.get(ParameterKeys.FREE_CANCEL_NOTICE) > order.startsAt) {
            return false;
        }
        uint256 month = block.timestamp / MONTH;
        bytes32 pair = _pairKey(order.payer, order.payee);
        uint8 byAccount = _freeCancelsByAccount[order.payer][month];
        uint8 byPair = _freeCancelsByPair[pair][month];
        if (
            byAccount >= registry.get(ParameterKeys.FREE_CANCELS_PER_ACCOUNT_MONTH)
                || byPair >= registry.get(ParameterKeys.FREE_CANCELS_PER_PAIR_MONTH)
        ) return false;
        _freeCancelsByAccount[order.payer][month] = byAccount + 1;
        _freeCancelsByPair[pair][month] = byPair + 1;
        return true;
    }

    function _shares(uint256 total) private view returns (uint128 toPayee, uint128 toTreasury) {
        toPayee = uint128((total * registry.get(ParameterKeys.CANCEL_PAYEE_SHARE_BPS)) / BPS);
        toTreasury = uint128(total) - toPayee;
    }

    function _pairKey(address payer, address payee) private pure returns (bytes32) {
        return keccak256(abi.encode(payer, payee));
    }

    function _reviewDeadline(Order storage order) private view returns (uint40) {
        uint256 window = registry.get(ParameterKeys.AUTO_RELEASE_SHORT);
        return order.deliveredAt + uint40(order.extended ? window * 2 : window);
    }

    function _collect(address token, address from, uint256 amount, DepositAuth calldata auth) private {
        IERC20 erc20 = IERC20(token);
        uint256 balanceBefore = erc20.balanceOf(address(this));

        if (auth.method == DepositMethod.Permit) {
            (bytes32 r, bytes32 s, uint8 v) = _split(from, auth.signature);
            try IERC20Permit(token).permit(from, address(this), amount, auth.deadline, v, r, s) {} catch {}
            erc20.safeTransferFrom(from, address(this), amount);
        } else if (auth.method == DepositMethod.Permit2) {
            permit2.permitTransferFrom(
                ISignatureTransfer.PermitTransferFrom(
                    ISignatureTransfer.TokenPermissions(token, amount), auth.nonce, auth.deadline
                ),
                ISignatureTransfer.SignatureTransferDetails(address(this), amount),
                from,
                auth.signature
            );
        } else {
            erc20.safeTransferFrom(from, address(this), amount);
        }

        if (erc20.balanceOf(address(this)) - balanceBefore != amount) revert FeeOnTransferToken(token);
    }

    function _verify(address signer, bytes32 digest, bytes calldata signature) private view {
        if (!SignatureChecker.isValidSignatureNow(signer, digest, signature)) revert InvalidSignature(signer);
    }

    function _split(address signer, bytes calldata signature) private pure returns (bytes32 r, bytes32 s, uint8 v) {
        if (signature.length != 65) revert InvalidSignature(signer);
        r = bytes32(signature[0:32]);
        s = bytes32(signature[32:64]);
        v = uint8(signature[64]);
    }

    function _requireStatus(uint256 orderId, OrderStatus expected) private view returns (Order storage order) {
        order = _orders[orderId];
        OrderStatus status = order.status;
        if (status == OrderStatus.None) revert UnknownOrder(orderId);
        if (status != expected) revert InvalidStatus(orderId, status);
    }

    function _checkSchedule(uint40 startsAt, uint40 deadline) private view {
        if (startsAt != 0 && startsAt <= block.timestamp) revert InvalidSchedule();
        uint40 floor = startsAt != 0 ? startsAt : uint40(block.timestamp);
        if (deadline != 0 && deadline <= floor) revert InvalidSchedule();
    }

    function _classify(TokenConfig storage config, uint128 price) private view returns (SizeClass) {
        if (price <= config.smallMax) return SizeClass.Small;
        if (price <= config.mediumMax) return SizeClass.Medium;
        return SizeClass.Large;
    }

    function _protocolFee(TokenConfig storage config, uint128 amount) private view returns (uint128 fee) {
        uint256 bps = registry.get(ParameterKeys.FEE_BPS);
        if (bps == 0) return 0;
        uint256 computed = (uint256(amount) * bps) / BPS;
        if (computed < config.feeFloor) computed = config.feeFloor;
        if (config.feeCap != 0 && computed > config.feeCap) computed = config.feeCap;
        if (computed > amount) computed = amount;
        fee = uint128(computed);
    }

    function _cashFee(TokenConfig storage config, uint128 declared) private view returns (uint128) {
        uint256 variable = (uint256(declared) * registry.get(ParameterKeys.CASH_FEE_BPS)) / BPS;
        return uint128(uint256(config.cashFeeFloor) + variable);
    }

    function _reservationCompensation(Order storage order) private view returns (uint128) {
        if (order.status != OrderStatus.Reserved || order.mode != PaymentMode.Escrowed) return 0;
        uint256 elapsed = block.timestamp - order.reservedAt;
        uint256 grace = registry.get(ParameterKeys.RESERVATION_GRACE);
        if (elapsed <= grace) return 0;
        uint256 ramp = registry.get(ParameterKeys.RESERVATION_RAMP);
        uint256 maxBps = registry.get(ParameterKeys.RESERVATION_MAX_BPS);
        uint256 over = elapsed - grace;
        uint256 bps = over >= ramp ? maxBps : (maxBps * over) / ramp;
        uint256 compensation = (uint256(order.deposited) * bps) / BPS;
        uint128 cap = _tokenConfigs[order.token].reservationCap;
        if (cap != 0 && compensation > cap) compensation = cap;
        return uint128(compensation);
    }

    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }
}
