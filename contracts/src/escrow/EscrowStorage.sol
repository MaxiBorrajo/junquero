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
import {IArbitration} from "../interfaces/IArbitration.sol";
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
    TokenConfig,
    Dispute,
    Milestone,
    MilestonePlan,
    MilestoneStatus,
    GroupInfo,
    AttestationRecord
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
    IArbitration public arbitration;
    uint256 public lastOrderId;

    mapping(uint256 orderId => Order) internal _orders;
    mapping(address token => TokenConfig) internal _tokenConfigs;
    mapping(address token => mapping(address account => uint256)) public claimable;
    mapping(address payer => mapping(uint256 month => uint8)) internal _freeCancelsByAccount;
    mapping(bytes32 pair => mapping(uint256 month => uint8)) internal _freeCancelsByPair;
    mapping(uint256 orderId => Dispute) internal _disputes;
    mapping(address account => mapping(uint256 month => uint8)) internal _smallDisputesByAccount;
    mapping(uint256 orderId => Milestone[]) internal _milestones;
    mapping(uint256 orderId => MilestonePlan) internal _plans;
    mapping(uint256 orderId => GroupInfo) internal _groups;
    mapping(uint256 orderId => address) internal _witnesses;
    mapping(uint256 orderId => mapping(uint8 index => AttestationRecord)) internal _attestations;
    mapping(address token => mapping(address witness => uint256)) public witnessOwed;
    mapping(uint256 orderId => address[]) internal _contributors;
    mapping(uint256 orderId => mapping(address account => uint128)) internal _contributions;
    mapping(uint256 orderId => mapping(uint32 epoch => mapping(address account => bool))) internal _vetoed;
    mapping(uint256 orderId => mapping(uint32 epoch => mapping(address account => address))) internal _coordinatorVote;
    mapping(uint256 orderId => mapping(uint32 epoch => mapping(address candidate => uint128))) internal
        _coordinatorWeight;
    mapping(uint256 orderId => mapping(address account => bytes32)) internal _objectedAt;

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

    function _recordSettled(uint256 orderId, Order storage order, uint8 rating, bool automatic, bool disputed)
        internal
    {
        IReputation target = reputation;
        if (address(target) == address(0)) return;
        bool qualifies = order.price > _tokenConfigs[order.token].reputationMin;
        try target.recordSettled(order.payer, order.payee, rating, automatic, disputed, qualifies) {}
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
        address token = order.token;

        order.status = OrderStatus.Settled;
        order.settledAt = uint40(block.timestamp);
        order.paidOut = amount > 0;
        order.deposited = 0;

        _payout(token, payee, paid);
        _payout(token, treasury, fee);
        _refundPayer(orderId, order, refunded);
        emit OrderSettled(orderId, payee, paid, refunded, fee, rating, automatic);
        _recordSettled(orderId, order, rating, automatic, false);
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
        uint128 refund = order.deposited - toRecipient - toTreasury;

        order.status = OrderStatus.Cancelled;
        order.deposited = 0;
        order.reservedPayee = address(0);
        order.reservedAt = 0;

        _payout(token, recipient, toRecipient);
        _payout(token, treasury, toTreasury);
        _refundPayer(orderId, order, refund);
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

    function _refundPayer(uint256 orderId, Order storage order, uint128 amount) internal {
        if (amount == 0) return;
        address token = order.token;
        if (!order.isGroup) {
            _payout(token, order.payer, amount);
            return;
        }
        address[] storage list = _contributors[orderId];
        uint256 total = _groups[orderId].totalContributed;
        uint128 remaining = amount;
        uint256 last = list.length - 1;
        for (uint256 i = 0; i < list.length; i++) {
            uint128 share =
                i == last ? remaining : uint128((uint256(amount) * _contributions[orderId][list[i]]) / total);
            remaining -= share;
            _payout(token, list[i], share);
        }
    }

    function _classify(TokenConfig storage config, uint128 amount) internal view returns (SizeClass) {
        if (amount <= config.smallMax) return SizeClass.Small;
        if (amount <= config.mediumMax) return SizeClass.Medium;
        return SizeClass.Large;
    }

    function _requiresMilestones(Order storage order, uint128 price) internal view returns (bool) {
        if (order.mode != PaymentMode.Escrowed) return false;
        if (price > _tokenConfigs[order.token].milestoneAmount) return true;
        uint40 deadline = order.deadline;
        return
            deadline > block.timestamp
                && deadline - block.timestamp > registry.get(ParameterKeys.MILESTONE_MIN_DURATION);
    }

    function _agree(
        Agreement calldata agreement,
        bytes calldata payerSignature,
        bytes calldata payeeSignature,
        bool milestoned
    ) internal {
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
        if (!milestoned && _requiresMilestones(order, agreement.price)) revert MilestonesRequired();
        if (order.isGroup) _checkGroupProposal(agreement.orderId, agreement.payee);

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

        _refundPayer(agreement.orderId, order, refund);
        emit OrderAgreed(agreement.orderId, agreement.payee, agreement.price, agreement.termsHash, uint8(sizeClass));
    }

    function _payMilestone(
        uint256 orderId,
        Order storage order,
        uint8 index,
        uint128 amount,
        uint8 rating,
        bool automatic
    ) internal {
        Milestone storage milestone = _milestones[orderId][index];
        MilestonePlan storage plan = _plans[orderId];
        uint128 fee = _protocolFee(_tokenConfigs[order.token], amount);
        uint128 toPayee = amount - fee;
        uint128 refund = milestone.amount - amount;

        milestone.status = MilestoneStatus.Paid;
        order.deposited -= milestone.amount;
        plan.next = index + 1;
        plan.started = true;
        plan.progressBps = 0;
        plan.progressEvidence = bytes32(0);
        plan.paidTotal += toPayee;
        plan.refundedTotal += refund;
        plan.feeTotal += fee;
        if (!automatic) {
            plan.ratingSum += rating;
            plan.ratingCount += 1;
        }

        address token = order.token;
        _payout(token, order.payee, toPayee);
        _refundPayer(orderId, order, refund);
        _payout(token, treasury, fee);
        emit MilestonePaid(orderId, index, toPayee, refund, fee, rating, automatic);
        if (index + 1 == plan.count) _closeMilestoned(orderId, order, false);
    }

    function _closeMilestoned(uint256 orderId, Order storage order, bool disputed) internal {
        MilestonePlan storage plan = _plans[orderId];
        order.status = OrderStatus.Settled;
        order.settledAt = uint40(block.timestamp);
        order.paidOut = plan.paidTotal > 0;
        bool automatic = plan.ratingCount == 0;
        uint8 rating = automatic ? 0 : uint8(plan.ratingSum / plan.ratingCount);
        emit OrderSettled(orderId, order.payee, plan.paidTotal, plan.refundedTotal, plan.feeTotal, rating, automatic);
        _recordSettled(orderId, order, rating, automatic, disputed);
    }

    function _checkGroupProposal(uint256 orderId, address payee) internal view {
        GroupInfo storage group = _groups[orderId];
        if (group.proposedPayee == address(0) || group.proposedPayee != payee) revert GroupAgreementNeedsProposal();
        uint40 readyAt = group.proposedAt + uint40(registry.get(ParameterKeys.GROUP_VETO_WINDOW));
        if (block.timestamp < readyAt) revert VetoWindowOpen(readyAt);
        if (_contributions[orderId][payee] > 0) revert ProviderIsContributor(payee);
    }

    function _checkSchedule(uint40 startsAt, uint40 deadline) internal view {
        if (startsAt != 0 && startsAt <= block.timestamp) revert InvalidSchedule();
        uint40 floor = startsAt != 0 ? startsAt : uint40(block.timestamp);
        if (deadline != 0 && deadline <= floor) revert InvalidSchedule();
    }

    function _thresholdReached(uint128 total, uint128 money, uint8 count) internal view returns (bool) {
        return uint256(money) * BPS >= uint256(total) * registry.get(ParameterKeys.OBJECTION_MONEY_BPS)
            || count >= registry.get(ParameterKeys.OBJECTION_MIN_PEOPLE);
    }

    function _requiresWitness(Order storage order) internal view returns (bool) {
        return order.mode == PaymentMode.Escrowed && order.price > _tokenConfigs[order.token].witnessAmount;
    }

    function _requireWitnessAssigned(uint256 orderId, Order storage order) internal view {
        if (_requiresWitness(order) && _witnesses[orderId] == address(0)) revert WitnessRequired();
    }

    function _requireWitnessApproval(uint256 orderId, Order storage order, uint8 index, bytes32 evidenceHash)
        internal
        view
    {
        if (!_requiresWitness(order)) return;
        AttestationRecord storage record = _attestations[orderId][index];
        if (!record.approved || evidenceHash == bytes32(0) || record.evidenceHash != evidenceHash) {
            revert WitnessAttestationMissing(index);
        }
    }
}
