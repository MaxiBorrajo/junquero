// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IEscrowFull} from "../../src/interfaces/IEscrowFull.sol";
import {EscrowHashes} from "../../src/libraries/EscrowHashes.sol";
import {MockPermitToken} from "../mocks/MockPermitToken.sol";
import {MockArbitration} from "../mocks/MockArbitration.sol";
import {
    Order,
    OrderStatus,
    PaymentMode,
    Modality,
    DepositMethod,
    CreateParams,
    DepositAuth,
    GroupParams,
    Agreement,
    Release,
    MilestoneRelease,
    MilestoneTerms,
    Milestone
} from "../../src/libraries/OrderTypes.sol";

contract EscrowHandler is Test {
    uint256 internal constant UNIT = 1e6;
    uint256 internal constant ACTORS = 9;

    IEscrowFull public immutable escrow;
    MockPermitToken public immutable usdc;
    MockArbitration public immutable court;

    uint256[] public keys;
    address[] public actors;
    uint256 public initialSupply;

    constructor(IEscrowFull escrow_, MockPermitToken usdc_, MockArbitration court_) {
        escrow = escrow_;
        usdc = usdc_;
        court = court_;
        uint256 before = usdc.totalSupply();
        for (uint256 i = 0; i < ACTORS; i++) {
            uint256 key = 0xA11CE + i;
            address actor = vm.addr(key);
            keys.push(key);
            actors.push(actor);
            usdc.mint(actor, 1_000_000 * UNIT);
            vm.prank(actor);
            usdc.approve(address(escrow), type(uint256).max);
        }
        initialSupply = usdc.totalSupply() - before;
    }

    function actorCount() external pure returns (uint256) {
        return ACTORS;
    }

    function _keyOf(address who) internal view returns (uint256) {
        for (uint256 i = 0; i < ACTORS; i++) {
            if (actors[i] == who) return keys[i];
        }
        return 0;
    }

    function _bit(OrderStatus status) internal pure returns (uint256) {
        return 1 << uint256(uint8(status));
    }

    function _pick(uint256 seed, uint256 mask) internal view returns (uint256) {
        uint256 last = escrow.lastOrderId();
        uint256 matches;
        for (uint256 id = 1; id <= last; id++) {
            if (mask & _bit(escrow.getOrder(id).status) != 0) matches++;
        }
        if (matches == 0) return 0;
        uint256 target = seed % matches;
        for (uint256 id = 1; id <= last; id++) {
            if (mask & _bit(escrow.getOrder(id).status) != 0) {
                if (target == 0) return id;
                target--;
            }
        }
        return 0;
    }

    uint256 internal constant FUNDING = 1 << 8;
    uint256 internal constant OPEN = 1 << 1;
    uint256 internal constant RESERVED = 1 << 2;
    uint256 internal constant AGREED = 1 << 3;
    uint256 internal constant DELIVERED = 1 << 4;
    uint256 internal constant DISPUTED = 1 << 5;

    function _sign(uint256 key, bytes32 structHash) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _noAuth() internal pure returns (DepositAuth memory) {
        return DepositAuth({method: DepositMethod.Allowance, nonce: 0, deadline: 0, signature: ""});
    }

    function _params(uint256 amount, bool remote) internal view returns (CreateParams memory) {
        return CreateParams({
            token: address(usdc),
            amount: uint128(amount),
            specHash: keccak256("spec"),
            mode: PaymentMode.Escrowed,
            modality: remote ? Modality.Remote : Modality.OnSite,
            startsAt: 0,
            deadline: 0,
            category: 1
        });
    }

    function _agreementHash(Agreement memory a) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                EscrowHashes.AGREEMENT_TYPEHASH, a.orderId, a.payer, a.payee, a.price, a.specHash, a.termsHash, a.expiry
            )
        );
    }

    function createPlain(uint256 payerSeed, uint256 amountSeed, bool remote) external {
        CreateParams memory params = _params(bound(amountSeed, 1 * UNIT, 400 * UNIT), remote);
        vm.prank(actors[payerSeed % 3]);
        try escrow.createOrder(params, _noAuth()) {} catch {}
    }

    function createGroup(uint256 payerSeed, uint256 amountSeed) external {
        CreateParams memory params = _params(bound(amountSeed, 20 * UNIT, 400 * UNIT), false);
        vm.prank(actors[payerSeed % 3]);
        try escrow.createGroupOrder(params, GroupParams(address(0), uint40(block.timestamp + 7 days))) {} catch {}
    }

    function contribute(uint256 idSeed, uint256 memberSeed, uint256 amountSeed) external {
        uint256 id = _pick(idSeed, FUNDING);
        if (id == 0) return;
        uint256 target = escrow.getGroup(id).target;
        if (target == 0) return;
        uint256 amount = bound(amountSeed, target / 20, target / 2);
        uint256 remaining = target - escrow.getGroup(id).totalContributed;
        if (amount > remaining) amount = remaining;
        vm.prank(actors[5 + (memberSeed % 4)]);
        try escrow.contribute(id, uint128(amount), _noAuth()) {} catch {}
    }

    function withdrawContribution(uint256 idSeed, uint256 memberSeed) external {
        if (idSeed % 4 != 0) return;
        idSeed = idSeed / 4;
        uint256 id = _pick(idSeed, FUNDING | OPEN);
        if (id == 0) return;
        vm.prank(actors[5 + (memberSeed % 4)]);
        try escrow.withdrawContribution(id) {} catch {}
    }

    function refundFunding(uint256 idSeed) external {
        if (idSeed % 3 != 0) return;
        idSeed = idSeed / 3;
        uint256 id = _pick(idSeed, FUNDING);
        if (id == 0) return;
        try escrow.refundFunding(id) {} catch {}
    }

    function agree(uint256 idSeed, uint256 priceSeed) external {
        uint256 id = _pick(idSeed, OPEN);
        if (id == 0) return;
        Order memory order = escrow.getOrder(id);
        if (order.status == OrderStatus.Funding || order.deposited == 0) return;
        address payee = actors[3 + (priceSeed % 2)];
        if (order.isGroup) {
            vm.prank(order.payer);
            try escrow.proposeProvider(id, payee) {} catch {}
            vm.warp(block.timestamp + 1 days);
        }
        Agreement memory a = Agreement({
            orderId: id,
            payer: order.payer,
            payee: payee,
            price: uint128(bound(priceSeed, 1, order.deposited)),
            specHash: keccak256("spec"),
            termsHash: keccak256("terms"),
            expiry: uint40(block.timestamp + 1 hours)
        });
        bytes32 structHash = _agreementHash(a);
        try escrow.agree(a, _sign(_keyOf(a.payer), structHash), _sign(_keyOf(a.payee), structHash)) {} catch {}
    }

    function agreeMilestones(uint256 idSeed, uint256 splitSeed) external {
        uint256 id = _pick(idSeed, OPEN);
        if (id == 0) return;
        Order memory order = escrow.getOrder(id);
        if (order.status == OrderStatus.Funding || order.deposited < 2) return;
        address payee = actors[3 + (splitSeed % 2)];
        if (order.isGroup) {
            vm.prank(order.payer);
            try escrow.proposeProvider(id, payee) {} catch {}
            vm.warp(block.timestamp + 1 days);
        }
        MilestoneTerms memory terms = _split(order.deposited, splitSeed);
        Agreement memory a = Agreement({
            orderId: id,
            payer: order.payer,
            payee: payee,
            price: order.deposited,
            specHash: keccak256("spec"),
            termsHash: keccak256(abi.encode(terms.baseTerms, terms.amounts, terms.criteria, terms.firstIsAdvance)),
            expiry: uint40(block.timestamp + 1 hours)
        });
        bytes32 structHash = _agreementHash(a);
        bytes memory payerSig = _sign(_keyOf(a.payer), structHash);
        bytes memory payeeSig = _sign(_keyOf(a.payee), structHash);
        try escrow.agreeWithMilestones(a, terms, payerSig, payeeSig) {} catch {}
    }

    function _split(uint128 price, uint256 seed) internal pure returns (MilestoneTerms memory terms) {
        uint128 first = uint128(bound(seed, 1, price - 1));
        uint128[] memory amounts = new uint128[](2);
        amounts[0] = first;
        amounts[1] = price - first;
        terms = MilestoneTerms({
            baseTerms: keccak256("base"), amounts: amounts, criteria: new bytes32[](2), firstIsAdvance: false
        });
    }

    function deliver(uint256 idSeed) external {
        uint256 id = _pick(idSeed, AGREED);
        if (id == 0) return;
        Order memory order = escrow.getOrder(id);
        bytes32 evidence = keccak256(abi.encode("e", block.timestamp));
        vm.prank(order.payee);
        if (order.hasMilestones) {
            try escrow.deliverMilestone(id, escrow.getPlan(id).next, evidence) {} catch {}
        } else {
            try escrow.deliver(id, evidence) {} catch {}
        }
    }

    function release(uint256 idSeed, uint256 pctSeed) external {
        uint256 id = _pick(idSeed, AGREED | DELIVERED);
        if (id == 0) return;
        Order memory order = escrow.getOrder(id);
        uint256 pct = bound(pctSeed, 0, 10_000);
        if (order.hasMilestones) {
            _releaseMilestone(id, order, pct);
        } else {
            _releasePlain(id, order, pct);
        }
    }

    function _releaseMilestone(uint256 id, Order memory order, uint256 pct) internal {
        uint8 index = escrow.getPlan(id).next;
        Milestone[] memory list = escrow.getMilestones(id);
        if (index >= list.length) return;
        MilestoneRelease memory r = MilestoneRelease({
            orderId: id,
            index: index,
            amount: uint128((uint256(list[index].amount) * pct) / 10_000),
            rating: 4,
            evidenceHash: bytes32(0),
            expiry: uint40(block.timestamp + 1 hours)
        });
        bytes memory sig = _sign(_keyOf(order.payer), EscrowHashes.hash(r));
        vm.prank(order.payee);
        try escrow.releaseMilestone(r, sig) {} catch {}
    }

    function _releasePlain(uint256 id, Order memory order, uint256 pct) internal {
        Release memory r = Release({
            orderId: id,
            payee: order.payee,
            amount: uint128((uint256(order.price) * pct) / 10_000),
            rating: 4,
            evidenceHash: bytes32(0),
            expiry: uint40(block.timestamp + 1 hours)
        });
        bytes32 structHash = keccak256(
            abi.encode(EscrowHashes.RELEASE_TYPEHASH, r.orderId, r.payee, r.amount, r.rating, r.evidenceHash, r.expiry)
        );
        bytes memory sig = _sign(_keyOf(order.payer), structHash);
        vm.prank(order.payee);
        try escrow.release(r, sig) {} catch {}
    }

    function autoRelease(uint256 idSeed) external {
        uint256 id = _pick(idSeed, DELIVERED | AGREED);
        if (id == 0) return;
        vm.warp(block.timestamp + 4 days);
        if (escrow.getOrder(id).hasMilestones) {
            try escrow.autoReleaseMilestone(id) {} catch {}
        } else {
            try escrow.autoRelease(id) {} catch {}
        }
    }

    function cancel(uint256 idSeed, bool byPayee) external {
        if (idSeed % 8 != 0) return;
        idSeed = idSeed / 8;
        uint256 id = _pick(idSeed, OPEN | FUNDING | AGREED);
        if (id == 0) return;
        Order memory order = escrow.getOrder(id);
        vm.prank(byPayee && order.payee != address(0) ? order.payee : order.payer);
        try escrow.cancel(id) {} catch {}
    }

    function terminateEarly(uint256 idSeed, uint256 progressSeed) external {
        if (idSeed % 4 != 0) return;
        idSeed = idSeed / 4;
        uint256 id = _pick(idSeed, AGREED);
        if (id == 0) return;
        Order memory order = escrow.getOrder(id);
        if (!order.hasMilestones) return;
        vm.prank(order.payee);
        try escrow.reportProgress(id, uint16(bound(progressSeed, 0, 10_000)), keccak256("progress")) {} catch {}
        vm.prank(order.payer);
        try escrow.terminateEarly(id) {} catch {}
    }

    function abandon(uint256 idSeed) external {
        if (idSeed % 6 != 0) return;
        idSeed = idSeed / 6;
        uint256 id = _pick(idSeed, AGREED);
        if (id == 0) return;
        vm.prank(escrow.getOrder(id).payee);
        try escrow.abandon(id) {} catch {}
    }

    function requestChanges(uint256 idSeed) external {
        if (idSeed % 3 != 0) return;
        idSeed = idSeed / 3;
        uint256 id = _pick(idSeed, DELIVERED);
        if (id == 0) return;
        vm.prank(escrow.getOrder(id).payer);
        try escrow.requestChanges(id, keccak256("changes")) {} catch {}
    }

    function openDispute(uint256 idSeed, bool byPayee) external {
        uint256 id = _pick(idSeed, DELIVERED | AGREED);
        if (id == 0) return;
        Order memory order = escrow.getOrder(id);
        vm.prank(byPayee ? order.payee : order.payer);
        try escrow.openDispute(id, keccak256("dispute"), _noAuth()) {} catch {}
    }

    function resolve(uint256 idSeed, uint256 shareSeed, bool waive) external {
        uint256 id = _pick(idSeed, DISPUTED);
        if (id == 0) return;
        uint16 share = uint16(bound(shareSeed, 0, 10_000));
        if (waive) {
            try court.resolveWaived(id, share) {} catch {}
        } else {
            try court.resolve(id, share) {} catch {}
        }
    }

    function moderate(uint256 idSeed) external {
        if (idSeed % 12 != 0) return;
        idSeed = idSeed / 12;
        uint256 id = _pick(idSeed, OPEN | FUNDING);
        if (id == 0) return;
        try escrow.moderate(id, keccak256("moderated")) {} catch {}
    }

    function warp(uint256 secondsSeed) external {
        vm.warp(block.timestamp + bound(secondsSeed, 1, 3 days));
    }
}
