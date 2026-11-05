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

contract CancelModule is EscrowStorage {
    using SafeERC20 for IERC20;

    constructor(IParameterRegistry registry_, address treasury_, ISignatureTransfer permit2_, address forwarder)
        EscrowStorage(registry_, treasury_, permit2_, forwarder)
    {}

    function selectors() external pure returns (bytes4[] memory selectors_) {
        selectors_ = new bytes4[](6);
        selectors_[0] = CancelModule.cancel.selector;
        selectors_[1] = CancelModule.reclaim.selector;
        selectors_[2] = CancelModule.checkIn.selector;
        selectors_[3] = CancelModule.confirmArrival.selector;
        selectors_[4] = CancelModule.claimNoShow.selector;
        selectors_[5] = CancelModule.moderate.selector;
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

    function moderate(uint256 orderId, bytes32 reasonHash) external nonReentrant onlyRole(MODERATOR_ROLE) {
        Order storage order = _orders[orderId];
        OrderStatus status = order.status;
        if (status == OrderStatus.None) revert UnknownOrder(orderId);
        if (status != OrderStatus.Open && status != OrderStatus.Reserved) revert InvalidStatus(orderId, status);
        address moderator = _msgSender();
        emit OrderModerated(orderId, moderator, reasonHash);
        _finishCancel(orderId, order, moderator, CancelReason.Moderated, address(0), 0, 0);
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
}
