// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IEscrowFull} from "../src/interfaces/IEscrowFull.sol";
import {EscrowHashes} from "../src/libraries/EscrowHashes.sol";
import {
    CreateParams,
    DepositAuth,
    DepositMethod,
    PaymentMode,
    Modality,
    Agreement,
    Release,
    OrderStatus
} from "../src/libraries/OrderTypes.sol";
import {TestUSDC} from "../src/TestUSDC.sol";
import {Receipt as JunqueroReceipt} from "../src/Receipt.sol";

contract Smoke is Script {
    uint256 internal constant UNIT = 1e6;
    uint256 internal constant PRICE = 10 * UNIT;
    bytes32 internal constant EVIDENCE = keccak256("smoke evidence");

    IEscrowFull internal escrow;
    TestUSDC internal token;
    JunqueroReceipt internal receipt;
    address internal requester;
    address internal provider;

    function run() external {
        string memory json = vm.readFile(
            string.concat(vm.projectRoot(), "/deployments/", vm.envOr("DEPLOYMENT", string("sepolia")), ".json")
        );
        escrow = IEscrowFull(vm.parseJsonAddress(json, ".contracts.escrow.address"));
        token = TestUSDC(vm.parseJsonAddress(json, ".contracts.token.address"));
        receipt = JunqueroReceipt(vm.parseJsonAddress(json, ".contracts.receipt.address"));
        requester = vm.parseJsonAddress(json, ".demoAccounts.solicitante");
        provider = vm.parseJsonAddress(json, ".demoAccounts.prestador");

        _scenarioA();
        _scenarioB();
    }

    function _scenarioA() private {
        uint256 providerBefore = token.balanceOf(provider);
        uint256 orderId = _create(PaymentMode.Escrowed, PRICE, PRICE, keccak256("smoke A"));
        _agree(orderId, keccak256("smoke A"));

        vm.broadcast(provider);
        escrow.deliver(orderId, EVIDENCE);

        _release(orderId, 5);

        vm.broadcast(provider);
        receipt.claim(orderId);

        require(token.balanceOf(provider) == providerBefore + PRICE, "A: provider was not paid");
        require(uint8(escrow.getOrder(orderId).status) == uint8(OrderStatus.Settled), "A: not settled");
        require(receipt.ownerOf(orderId) == provider, "A: receipt not issued");
        console.log("A ok, order", orderId);
    }

    function _scenarioB() private {
        uint256 providerBefore = token.balanceOf(provider);
        uint256 fee = UNIT + (PRICE * 200) / 10_000;
        uint256 orderId = _create(PaymentMode.Cash, PRICE, fee, keccak256("smoke B"));
        _agree(orderId, keccak256("smoke B"));
        _release(orderId, 4);

        require(token.balanceOf(provider) == providerBefore, "B: cash moved money");
        require(uint8(escrow.getOrder(orderId).status) == uint8(OrderStatus.Settled), "B: not settled");
        console.log("B ok, order", orderId);
    }

    function _create(PaymentMode mode, uint256 amount, uint256 deposit, bytes32 spec)
        private
        returns (uint256 orderId)
    {
        DepositAuth memory auth = _permitAuth(deposit);
        CreateParams memory params = CreateParams({
            token: address(token),
            amount: uint128(amount),
            specHash: spec,
            mode: mode,
            modality: Modality.OnSite,
            startsAt: 0,
            deadline: 0,
            category: 2
        });
        vm.broadcast(requester);
        orderId = escrow.createOrder(params, auth);
    }

    function _permitAuth(uint256 amount) private view returns (DepositAuth memory) {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                requester,
                address(escrow),
                amount,
                token.nonces(requester),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(requester, digest);
        return
            DepositAuth({
                method: DepositMethod.Permit, nonce: 0, deadline: deadline, signature: abi.encodePacked(r, s, v)
            });
    }

    function _agree(uint256 orderId, bytes32 spec) private {
        Agreement memory a = Agreement({
            orderId: orderId,
            payer: requester,
            payee: provider,
            price: uint128(PRICE),
            specHash: spec,
            termsHash: keccak256("smoke terms"),
            expiry: uint40(block.timestamp + 24 hours)
        });
        bytes32 structHash = keccak256(
            abi.encode(
                EscrowHashes.AGREEMENT_TYPEHASH, a.orderId, a.payer, a.payee, a.price, a.specHash, a.termsHash, a.expiry
            )
        );
        bytes memory payerSignature = _sign(requester, structHash);
        bytes memory payeeSignature = _sign(provider, structHash);
        vm.broadcast(requester);
        escrow.agree(a, payerSignature, payeeSignature);
    }

    function _release(uint256 orderId, uint8 rating) private {
        Release memory r = Release({
            orderId: orderId,
            payee: provider,
            amount: uint128(PRICE),
            rating: rating,
            evidenceHash: EVIDENCE,
            expiry: uint40(block.timestamp + 10 minutes)
        });
        bytes32 structHash = keccak256(
            abi.encode(EscrowHashes.RELEASE_TYPEHASH, r.orderId, r.payee, r.amount, r.rating, r.evidenceHash, r.expiry)
        );
        bytes memory signature = _sign(requester, structHash);
        vm.broadcast(provider);
        escrow.release(r, signature);
    }

    function _sign(address signer, bytes32 structHash) private view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signer, digest);
        return abi.encodePacked(r, s, v);
    }
}
