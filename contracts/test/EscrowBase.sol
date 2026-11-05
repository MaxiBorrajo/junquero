// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IEscrowFull} from "../src/interfaces/IEscrowFull.sol";
import {EscrowAssembly} from "../script/lib/EscrowAssembly.sol";
import {Forwarder} from "../src/Forwarder.sol";
import {Treasury} from "../src/Treasury.sol";
import {ParameterRegistry} from "../src/ParameterRegistry.sol";
import {IParameterRegistry} from "../src/interfaces/IParameterRegistry.sol";
import {EscrowHashes} from "../src/libraries/EscrowHashes.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {
    Order,
    OrderStatus,
    PaymentMode,
    Modality,
    DepositMethod,
    CreateParams,
    DepositAuth,
    Reservation,
    Agreement,
    Release,
    TokenConfig
} from "../src/libraries/OrderTypes.sol";
import {MockPermitToken} from "./mocks/MockPermitToken.sol";
import {MockToken} from "./mocks/MockToken.sol";
import {MockPermit2} from "./mocks/MockPermit2.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

abstract contract EscrowBase is Test {
    uint256 internal constant USDC = 1e6;
    bytes32 internal constant SPEC = keccak256("spec");
    bytes32 internal constant TERMS = keccak256("terms");
    bytes32 internal constant EVIDENCE = keccak256("evidence");

    IEscrowFull internal escrow;
    Forwarder internal forwarder;
    Treasury internal treasury;
    ParameterRegistry internal registry;
    MockPermit2 internal permit2;
    MockPermitToken internal usdc;
    MockToken internal usdt;

    address internal admin = makeAddr("admin");
    address internal relayer = makeAddr("relayer");
    address internal moderator = makeAddr("moderator");
    uint256 internal payerKey;
    uint256 internal payeeKey;
    uint256 internal otherKey;
    address internal payer;
    address internal payee;
    address internal other;

    function setUp() public virtual {
        (payer, payerKey) = makeAddrAndKey("payer");
        (payee, payeeKey) = makeAddrAndKey("payee");
        (other, otherKey) = makeAddrAndKey("other");

        registry = new ParameterRegistry(admin);
        treasury = new Treasury(admin);
        forwarder = new Forwarder();
        permit2 = new MockPermit2();
        vm.startPrank(admin);
        escrow = EscrowAssembly.deploy(
            admin, IParameterRegistry(address(registry)), address(treasury), permit2, address(forwarder)
        );
        vm.stopPrank();

        bytes32 setterRole = registry.SETTER_ROLE();
        vm.startPrank(admin);
        escrow.grantRole(escrow.MODERATOR_ROLE(), moderator);
        registry.grantRole(setterRole, admin);
        registry.defineParameter(ParameterKeys.FEE_BPS, 0, 200, 0);
        registry.defineParameter(ParameterKeys.REQUEST_CHANGES_MAX, 0, 5, 2);
        registry.defineParameter(ParameterKeys.CONTRIBUTION_MIN_BPS, 0, 2000, 500);
        registry.defineParameter(ParameterKeys.CONTRIBUTION_MAX_BPS, 1000, 10_000, 5000);
        registry.defineParameter(ParameterKeys.OBJECTION_MONEY_BPS, 100, 10_000, 2500);
        registry.defineParameter(ParameterKeys.OBJECTION_MIN_PEOPLE, 1, 10, 2);
        registry.defineParameter(ParameterKeys.GROUP_VETO_WINDOW, 1 hours, 7 days, 24 hours);
        registry.defineParameter(ParameterKeys.MILESTONE_MIN_DURATION, 1 hours, 90 days, 5 days);
        registry.defineParameter(ParameterKeys.AUTO_RELEASE_MILESTONE, 1 hours, 14 days, 72 hours);
        registry.defineParameter(ParameterKeys.ADVANCE_MAX_BPS, 0, 5000, 3000);
        registry.defineParameter(ParameterKeys.ADVANCE_MIN_CLOSED_ORDERS, 0, 100, 5);
        registry.defineParameter(ParameterKeys.TERMINATION_COMP_BPS, 0, 2000, 1000);
        registry.defineParameter(ParameterKeys.JURY_SIZE_MEDIUM, 1, 15, 3);
        registry.defineParameter(ParameterKeys.JURY_SIZE_LARGE, 1, 15, 5);
        registry.defineParameter(ParameterKeys.SMALL_DISPUTES_PER_ACCOUNT_MONTH, 0, 20, 3);
        registry.defineParameter(ParameterKeys.AUTO_RELEASE_SHORT, 1 hours, 7 days, 24 hours);
        registry.defineParameter(ParameterKeys.RESERVATION_GRACE, 0, 7 days, 12 hours);
        registry.defineParameter(ParameterKeys.RESERVATION_RAMP, 1 hours, 30 days, 3 days);
        registry.defineParameter(ParameterKeys.RESERVATION_MAX_BPS, 0, 300, 200);
        registry.defineParameter(ParameterKeys.CASH_FEE_BPS, 0, 1000, 500);
        registry.defineParameter(ParameterKeys.CANCEL_FEE_AGREED_BPS, 0, 2000, 1000);
        registry.defineParameter(ParameterKeys.CANCEL_PAYEE_SHARE_BPS, 5000, 10_000, 8000);
        registry.defineParameter(ParameterKeys.NO_SHOW_COMPENSATION_BPS, 0, 2000, 1000);
        registry.defineParameter(ParameterKeys.NO_SHOW_WAIT, 5 minutes, 2 hours, 20 minutes);
        registry.defineParameter(ParameterKeys.FREE_CANCEL_NOTICE, 1 hours, 7 days, 24 hours);
        registry.defineParameter(ParameterKeys.FREE_CANCELS_PER_ACCOUNT_MONTH, 0, 10, 2);
        registry.defineParameter(ParameterKeys.FREE_CANCELS_PER_PAIR_MONTH, 0, 10, 1);
        vm.stopPrank();

        usdc = new MockPermitToken();
        usdt = new MockToken("USDT", 6);
        _configure(address(usdc), DepositMethod.Permit);
        _configure(address(usdt), DepositMethod.Permit2);

        usdc.mint(payer, 10_000 * USDC);
        usdt.mint(payer, 10_000 * USDC);
        vm.prank(payer);
        usdt.approve(address(escrow), type(uint256).max);
        vm.prank(payer);
        usdt.approve(address(permit2), type(uint256).max);
    }

    function _configure(address token, DepositMethod method) internal {
        TokenConfig memory config = TokenConfig({
            allowed: true,
            method: method,
            smallMax: uint128(20 * USDC),
            mediumMax: uint128(300 * USDC),
            milestoneAmount: type(uint128).max,
            witnessAmount: uint128(300 * USDC),
            reputationMin: uint128(5 * USDC),
            feeFloor: uint128(USDC / 4),
            feeCap: uint128(5 * USDC),
            cashFeeFloor: uint128(2 * USDC),
            reservationCap: uint128(10 * USDC),
            jurorFee: uint128(USDC)
        });
        vm.prank(admin);
        escrow.configureToken(token, config);
    }

    function _configureThresholds(address token, uint256 smallMax, uint256 mediumMax) internal {
        TokenConfig memory config = escrow.tokenConfig(token);
        config.smallMax = uint128(smallMax);
        config.mediumMax = uint128(mediumMax);
        vm.prank(admin);
        escrow.configureToken(token, config);
    }

    function _setParameter(bytes32 key, uint64 value) internal {
        vm.prank(admin);
        registry.set(key, value);
    }

    function _params(address token, uint256 amount) internal pure returns (CreateParams memory) {
        return CreateParams({
            token: token,
            amount: uint128(amount),
            specHash: SPEC,
            mode: PaymentMode.Escrowed,
            modality: Modality.OnSite,
            startsAt: 0,
            deadline: 0,
            category: 0
        });
    }

    function _noAuth() internal pure returns (DepositAuth memory) {
        return DepositAuth({method: DepositMethod.Allowance, nonce: 0, deadline: 0, signature: ""});
    }

    function _permitAuth(uint256 amount) internal view returns (DepositAuth memory) {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                payer,
                address(escrow),
                amount,
                usdc.nonces(payer),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        return
            DepositAuth({
                method: DepositMethod.Permit, nonce: 0, deadline: deadline, signature: abi.encodePacked(r, s, v)
            });
    }

    function _permit2Auth(address token, uint256 amount, uint256 nonce) internal view returns (DepositAuth memory) {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = permit2.digestFor(token, amount, nonce, deadline, address(escrow));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        return DepositAuth({
            method: DepositMethod.Permit2, nonce: nonce, deadline: deadline, signature: abi.encodePacked(r, s, v)
        });
    }

    function _createUsdc(uint256 amount) internal returns (uint256 orderId) {
        DepositAuth memory auth = _permitAuth(amount);
        vm.prank(payer);
        orderId = escrow.createOrder(_params(address(usdc), amount), auth);
    }

    function _createUsdcAs(address who, uint256 whoKey, uint256 amount) internal returns (uint256 orderId) {
        usdc.mint(who, amount);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                who,
                address(escrow),
                amount,
                usdc.nonces(who),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(whoKey, digest);
        DepositAuth memory auth = DepositAuth({
            method: DepositMethod.Permit, nonce: 0, deadline: deadline, signature: abi.encodePacked(r, s, v)
        });
        vm.prank(who);
        orderId = escrow.createOrder(_params(address(usdc), amount), auth);
    }

    function _sign(uint256 key, bytes32 structHash) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _agreementHash(Agreement memory a) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                EscrowHashes.AGREEMENT_TYPEHASH, a.orderId, a.payer, a.payee, a.price, a.specHash, a.termsHash, a.expiry
            )
        );
    }

    function _releaseHash(Release memory r) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(EscrowHashes.RELEASE_TYPEHASH, r.orderId, r.payee, r.amount, r.rating, r.evidenceHash, r.expiry)
        );
    }

    function _reservationHash(Reservation memory r) internal pure returns (bytes32) {
        return keccak256(abi.encode(EscrowHashes.RESERVATION_TYPEHASH, r.orderId, r.payer, r.payee, r.expiry));
    }

    function _agreement(uint256 orderId, uint256 price) internal view returns (Agreement memory) {
        return Agreement({
            orderId: orderId,
            payer: payer,
            payee: payee,
            price: uint128(price),
            specHash: SPEC,
            termsHash: TERMS,
            expiry: uint40(block.timestamp + 24 hours)
        });
    }

    function _agree(uint256 orderId, uint256 price) internal {
        Agreement memory a = _agreement(orderId, price);
        bytes32 structHash = _agreementHash(a);
        vm.prank(relayer);
        escrow.agree(a, _sign(payerKey, structHash), _sign(payeeKey, structHash));
    }

    function _reserve(uint256 orderId) internal {
        Reservation memory r =
            Reservation({orderId: orderId, payer: payer, payee: payee, expiry: uint40(block.timestamp + 24 hours)});
        bytes32 structHash = _reservationHash(r);
        vm.prank(relayer);
        escrow.reserve(r, _sign(payerKey, structHash), _sign(payeeKey, structHash));
    }

    function _release(uint256 orderId, uint256 amount, uint8 rating)
        internal
        view
        returns (Release memory, bytes memory)
    {
        Release memory r = Release({
            orderId: orderId,
            payee: payee,
            amount: uint128(amount),
            rating: rating,
            evidenceHash: EVIDENCE,
            expiry: uint40(block.timestamp + 10 minutes)
        });
        return (r, _sign(payerKey, _releaseHash(r)));
    }

    function _order(uint256 orderId) internal view returns (Order memory) {
        return escrow.getOrder(orderId);
    }

    function _forward(uint256 key, address from, address to, bytes memory data) internal {
        uint48 deadline = uint48(block.timestamp + 1 hours);
        uint256 gas = 2_000_000;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)"
                ),
                from,
                to,
                uint256(0),
                gas,
                forwarder.nonces(from),
                deadline,
                keccak256(data)
            )
        );
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Forwarder"),
                keccak256("1"),
                block.chainid,
                address(forwarder)
            )
        );
        (uint8 v, bytes32 r, bytes32 sv) = vm.sign(key, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        ERC2771Forwarder.ForwardRequestData memory request = ERC2771Forwarder.ForwardRequestData({
            from: from,
            to: to,
            value: 0,
            gas: gas,
            deadline: deadline,
            data: data,
            signature: abi.encodePacked(r, sv, v)
        });
        vm.prank(relayer);
        forwarder.execute(request);
    }

    function _settleFlow(uint256 amount) internal returns (uint256 orderId) {
        orderId = _createUsdc(amount);
        _agree(orderId, amount);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
        (Release memory r, bytes memory sig) = _release(orderId, amount, 5);
        vm.prank(payee);
        escrow.release(r, sig);
    }
}
