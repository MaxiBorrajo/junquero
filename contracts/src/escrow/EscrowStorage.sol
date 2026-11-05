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
import {IEscrowEvents} from "../interfaces/IEscrowEvents.sol";
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

abstract contract EscrowStorage is IEscrowEvents, EIP712, ERC2771Context, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant TOKEN_ADMIN_ROLE = keccak256("TOKEN_ADMIN_ROLE");
    bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");
    uint256 internal constant BPS = 10_000;
    uint256 internal constant MONTH = 30 days;

    IParameterRegistry public immutable registry;
    address public immutable treasury;
    ISignatureTransfer public immutable permit2;

    IReputation public reputation;
    uint256 public lastOrderId;

    mapping(uint256 orderId => Order) internal _orders;
    mapping(address token => TokenConfig) internal _tokenConfigs;
    mapping(address token => mapping(address account => uint256)) public claimable;
    mapping(address payer => mapping(uint256 month => uint8)) internal _freeCancelsByAccount;
    mapping(bytes32 pair => mapping(uint256 month => uint8)) internal _freeCancelsByPair;

    constructor(IParameterRegistry registry_, address treasury_, ISignatureTransfer permit2_, address forwarder)
        EIP712("Escrow", "1")
        ERC2771Context(forwarder)
    {
        if (treasury_ == address(0) || address(registry_) == address(0)) revert ZeroAddress();
        registry = registry_;
        treasury = treasury_;
        permit2 = permit2_;
    }

    function configHash() public view returns (bytes32) {
        return keccak256(abi.encode(address(registry), treasury, address(permit2), trustedForwarder()));
    }

    function _recordSettled(uint256 orderId, Order storage order, uint8 rating, bool automatic) internal {
        IReputation target = reputation;
        if (address(target) == address(0)) return;
        bool qualifies = order.price > _tokenConfigs[order.token].reputationMin;
        try target.recordSettled(order.payer, order.payee, rating, automatic, false, qualifies) {}
        catch {
            emit HookFailed(orderId, IReputation.recordSettled.selector);
        }
    }

    function _recordCash(uint256 orderId, Order storage order, uint8 rating) internal {
        IReputation target = reputation;
        if (address(target) == address(0)) return;
        try target.recordCash(order.payer, order.payee, rating) {}
        catch {
            emit HookFailed(orderId, IReputation.recordCash.selector);
        }
    }

    function _recordFailure(uint256 orderId, address account, Role role) internal {
        IReputation target = reputation;
        if (address(target) == address(0)) return;
        try target.recordFailure(account, role) {}
        catch {
            emit HookFailed(orderId, IReputation.recordFailure.selector);
        }
    }

    function _payout(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20.transfer, (to, amount)));
        bool delivered = ok && (data.length == 0 ? token.code.length > 0 : abi.decode(data, (bool)));
        if (delivered) return;
        claimable[token][to] += amount;
        emit PayoutDeferred(token, to, amount);
    }

    function _settle(uint256 orderId, Order storage order, uint128 amount, uint8 rating, bool automatic) internal {
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
    ) internal {
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

    function _shares(uint256 total) internal view returns (uint128 toPayee, uint128 toTreasury) {
        toPayee = uint128((total * registry.get(ParameterKeys.CANCEL_PAYEE_SHARE_BPS)) / BPS);
        toTreasury = uint128(total) - toPayee;
    }

    function _collect(address token, address from, uint256 amount, DepositAuth calldata auth) internal {
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

    function _verify(address signer, bytes32 digest, bytes calldata signature) internal view {
        if (!SignatureChecker.isValidSignatureNow(signer, digest, signature)) revert InvalidSignature(signer);
    }

    function _split(address signer, bytes calldata signature) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        if (signature.length != 65) revert InvalidSignature(signer);
        r = bytes32(signature[0:32]);
        s = bytes32(signature[32:64]);
        v = uint8(signature[64]);
    }

    function _requireStatus(uint256 orderId, OrderStatus expected) internal view returns (Order storage order) {
        order = _orders[orderId];
        OrderStatus status = order.status;
        if (status == OrderStatus.None) revert UnknownOrder(orderId);
        if (status != expected) revert InvalidStatus(orderId, status);
    }

    function _protocolFee(TokenConfig storage config, uint128 amount) internal view returns (uint128 fee) {
        uint256 bps = registry.get(ParameterKeys.FEE_BPS);
        if (bps == 0) return 0;
        uint256 computed = (uint256(amount) * bps) / BPS;
        if (computed < config.feeFloor) computed = config.feeFloor;
        if (config.feeCap != 0 && computed > config.feeCap) computed = config.feeCap;
        if (computed > amount) computed = amount;
        fee = uint128(computed);
    }

    function _reservationCompensation(Order storage order) internal view returns (uint128) {
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

    function _pairKey(address payer, address payee) internal pure returns (bytes32) {
        return keccak256(abi.encode(payer, payee));
    }
}
