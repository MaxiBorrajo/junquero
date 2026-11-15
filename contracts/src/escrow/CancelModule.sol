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

        if (status == OrderStatus.Open || status == OrderStatus.Reserved || status == OrderStatus.Funding) {
            if (caller != order.payer) revert NotPayer(caller);
            // Gratis si nadie se postuló; si hubo postulaciones (aunque se hayan retirado), cobra un porcentaje al tesoro.
            uint128 fee = hadApplicants[orderId] ? _applicantFee(order, order.deposited) : 0;
            _cancelWithTreasuryFee(orderId, order, caller, fee);
        } else if (status == OrderStatus.Agreed) {
            if (order.hasMilestones && _plans[orderId].started) revert MilestonesInProgress();
            if (caller == order.payee) {
                _finishCancel(orderId, order, caller, CancelReason.PayeeCancelled, caller, 0, 0);
                _recordFailure(orderId, caller, Role.Provider);
            } else if (caller == order.payer) {
                if (_isEarlyCancel(order)) {
                    // Con tiempo de aviso: el mismo cobro que antes de acordar, para el tesoro.
                    _cancelWithTreasuryFee(orderId, order, caller, _applicantFee(order, order.price));
                } else {
                    (uint128 toPayee, uint128 toTreasury) = _lateCancelShares(order);
                    _finishCancel(orderId, order, caller, CancelReason.PayerCancelled, order.payee, toPayee, toTreasury);
                }
            } else {
                revert NotParty(caller);
            }
        } else {
            revert InvalidStatus(orderId, status);
        }
    }

    function reclaim(uint256 orderId) external nonReentrant {
        Order storage order = _requireStatus(orderId, OrderStatus.Agreed);
        if (order.hasMilestones && _plans[orderId].started) revert MilestonesInProgress();
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
        if (status != OrderStatus.Open && status != OrderStatus.Reserved && status != OrderStatus.Funding) {
            revert InvalidStatus(orderId, status);
        }
        address moderator = _msgSender();
        emit OrderModerated(orderId, moderator, reasonHash);
        _finishCancel(orderId, order, moderator, CancelReason.Moderated, address(0), 0, 0);
    }

    // Con tiempo de aviso: hay fecha de inicio y faltan al menos `FREE_CANCEL_NOTICE` segundos; sin fecha de inicio,
    // dentro de ese mismo período desde el acuerdo.
    function _isEarlyCancel(Order storage order) private view returns (bool) {
        uint256 notice = registry.get(ParameterKeys.FREE_CANCEL_NOTICE);
        if (order.startsAt != 0) return block.timestamp + notice <= order.startsAt;
        return block.timestamp <= uint256(order.agreedAt) + notice;
    }

    // Cancelación tardía: un porcentaje del monto, con la mayor parte para el prestador. En efectivo no se cobra.
    function _lateCancelShares(Order storage order) private view returns (uint128, uint128) {
        if (order.mode == PaymentMode.Cash) return (0, 0);
        return _shares((uint256(order.price) * registry.get(ParameterKeys.CANCEL_FEE_AGREED_BPS)) / BPS);
    }

    // Devuelve todo salvo `fee`, que va al tesoro. En una changa grupal el cobro sale solo de la parte del coordinador
    // (hasta el tope de su parte): los demás aportantes recuperan todo lo que les corresponde.
    function _cancelWithTreasuryFee(uint256 orderId, Order storage order, address by, uint128 fee) private {
        if (fee == 0) {
            _finishCancel(orderId, order, by, CancelReason.PayerCancelled, address(0), 0, 0);
            return;
        }
        if (!order.isGroup) {
            _finishCancel(orderId, order, by, CancelReason.PayerCancelled, address(0), 0, fee);
            return;
        }
        _cancelGroupWithFee(orderId, order, by, fee);
    }

    // Lo que le toca a cada aportante del total, en proporción a su aporte (igual que un reintegro común).
    function _groupShares(uint256 orderId, uint128 total) private view returns (uint128[] memory shares) {
        address[] storage list = _contributors[orderId];
        uint256 contributed = _groups[orderId].totalContributed;
        shares = new uint128[](list.length);
        uint128 remaining = total;
        for (uint256 i = 0; i < list.length; i++) {
            uint128 share = i == list.length - 1
                ? remaining
                : uint128((uint256(total) * _contributions[orderId][list[i]]) / contributed);
            shares[i] = share;
            remaining -= share;
        }
    }

    function _cancelGroupWithFee(uint256 orderId, Order storage order, address by, uint128 fee) private {
        uint128 total = order.deposited;
        uint128[] memory shares = _groupShares(orderId, total);
        address[] storage list = _contributors[orderId];
        bool found;
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] != order.payer) continue;
            if (fee > shares[i]) fee = shares[i];
            shares[i] -= fee;
            found = true;
            break;
        }
        // Si el coordinador no aportó, no hay una parte suya de la cual descontar: el cobro se reparte en proporción.
        if (!found) shares = _groupShares(orderId, total - fee);

        address token = order.token;
        order.status = OrderStatus.Cancelled;
        order.deposited = 0;
        order.reservedPayee = address(0);
        order.reservedAt = 0;
        for (uint256 i = 0; i < list.length; i++) {
            _payout(token, list[i], shares[i]);
        }
        _payout(token, treasury, fee);
        emit OrderCancelled(orderId, by, uint8(CancelReason.PayerCancelled), 0, fee, total - fee);
    }
}
