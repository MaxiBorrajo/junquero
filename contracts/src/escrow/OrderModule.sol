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
import {IParameterRegistry} from "../interfaces/IParameterRegistry.sol";
import {IReputation, Role} from "../interfaces/IReputation.sol";
import {EscrowHashes} from "../libraries/EscrowHashes.sol";
import {ParameterKeys} from "../libraries/ParameterKeys.sol";
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
} from "../libraries/OrderTypes.sol";
import {EscrowStorage} from "./EscrowStorage.sol";

contract OrderModule is EscrowStorage {
    using SafeERC20 for IERC20;

    constructor(IParameterRegistry registry_, address treasury_, ISignatureTransfer permit2_, address forwarder)
        EscrowStorage(registry_, treasury_, permit2_, forwarder)
    {}

    function selectors() external pure returns (bytes4[] memory selectors_) {
        selectors_ = new bytes4[](9);
        selectors_[0] = OrderModule.createOrder.selector;
        selectors_[1] = OrderModule.reserve.selector;
        selectors_[2] = OrderModule.withdrawReservation.selector;
        selectors_[3] = OrderModule.agree.selector;
        selectors_[4] = OrderModule.deliver.selector;
        selectors_[5] = OrderModule.release.selector;
        selectors_[6] = OrderModule.autoRelease.selector;
        selectors_[7] = OrderModule.extendReview.selector;
        selectors_[8] = OrderModule.requestChanges.selector;
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

    function _cashFee(TokenConfig storage config, uint128 declared) private view returns (uint128) {
        uint256 variable = (uint256(declared) * registry.get(ParameterKeys.CASH_FEE_BPS)) / BPS;
        return uint128(uint256(config.cashFeeFloor) + variable);
    }

    function _reviewDeadline(Order storage order) private view returns (uint40) {
        uint256 window = registry.get(ParameterKeys.AUTO_RELEASE_SHORT);
        return order.deliveredAt + uint40(order.extended ? window * 2 : window);
    }
}
