// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";
import {Reputation} from "../src/Reputation.sol";
import {IParameterRegistry} from "../src/interfaces/IParameterRegistry.sol";
import {EscrowHashes} from "../src/libraries/EscrowHashes.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {
    Agreement,
    MilestoneTerms,
    MilestoneRelease,
    MilestonePlan,
    Milestone,
    TokenConfig,
    CreateParams,
    DepositAuth,
    DepositMethod
} from "../src/libraries/OrderTypes.sol";

abstract contract MilestoneBase is EscrowBase {
    bytes32 internal constant BASE_TERMS = keccak256("base terms");
    bytes32 internal constant PROGRESS = keccak256("progress evidence");

    Reputation internal reputation;

    function setUp() public virtual override {
        super.setUp();
        vm.prank(admin);
        registry.defineParameter(ParameterKeys.REPUTATION_PAIR_CAP, 1, 10, 2);
        reputation = new Reputation(admin, IParameterRegistry(address(registry)));
        bytes32 recorderRole = reputation.RECORDER_ROLE();
        vm.startPrank(admin);
        reputation.grantRole(recorderRole, address(escrow));
        reputation.grantRole(recorderRole, address(this));
        escrow.setReputation(reputation);
        vm.stopPrank();
    }

    function _amounts(uint128 a, uint128 b, uint128 c) internal pure returns (uint128[] memory list) {
        list = new uint128[](3);
        list[0] = a;
        list[1] = b;
        list[2] = c;
    }

    function _amounts2(uint128 a, uint128 b) internal pure returns (uint128[] memory list) {
        list = new uint128[](2);
        list[0] = a;
        list[1] = b;
    }

    function _terms(uint128[] memory amounts, bool advance) internal pure returns (MilestoneTerms memory terms) {
        bytes32[] memory criteria = new bytes32[](amounts.length);
        for (uint256 i = 0; i < amounts.length; i++) {
            criteria[i] = keccak256(abi.encode("criteria", i));
        }
        terms = MilestoneTerms({baseTerms: BASE_TERMS, amounts: amounts, criteria: criteria, firstIsAdvance: advance});
    }

    function _termsHash(MilestoneTerms memory terms) internal pure returns (bytes32) {
        return keccak256(abi.encode(terms.baseTerms, terms.amounts, terms.criteria, terms.firstIsAdvance));
    }

    function _sum(uint128[] memory amounts) internal pure returns (uint128 total) {
        for (uint256 i = 0; i < amounts.length; i++) {
            total += amounts[i];
        }
    }

    function _milestoneAgreement(uint256 orderId, MilestoneTerms memory terms)
        internal
        view
        returns (Agreement memory)
    {
        return Agreement({
            orderId: orderId,
            payer: payer,
            payee: payee,
            price: _sum(terms.amounts),
            specHash: SPEC,
            termsHash: _termsHash(terms),
            expiry: uint40(block.timestamp + 24 hours)
        });
    }

    function _agreeMilestones(uint256 orderId, MilestoneTerms memory terms) internal {
        Agreement memory a = _milestoneAgreement(orderId, terms);
        bytes32 structHash = _agreementHash(a);
        bytes memory payerSig = _sign(payerKey, structHash);
        bytes memory payeeSig = _sign(payeeKey, structHash);
        vm.prank(relayer);
        escrow.agreeWithMilestones(a, terms, payerSig, payeeSig);
    }

    function _newMilestoneOrder(uint128[] memory amounts, bool advance) internal returns (uint256 orderId) {
        orderId = _createUsdc(_sum(amounts));
        _agreeMilestones(orderId, _terms(amounts, advance));
    }

    function _standard() internal returns (uint256 orderId) {
        return _newMilestoneOrder(_amounts(uint128(100 * USDC), uint128(100 * USDC), uint128(100 * USDC)), false);
    }

    function _deliverAt(uint256 orderId, uint8 index) internal {
        vm.prank(payee);
        escrow.deliverMilestone(orderId, index, keccak256(abi.encode("evidence", index)));
    }

    function _msRelease(uint256 orderId, uint8 index, uint256 amount, uint8 rating)
        internal
        view
        returns (MilestoneRelease memory release, bytes memory signature)
    {
        release = MilestoneRelease({
            orderId: orderId,
            index: index,
            amount: uint128(amount),
            rating: rating,
            evidenceHash: EVIDENCE,
            expiry: uint40(block.timestamp + 10 minutes)
        });
        signature = _sign(payerKey, EscrowHashes.hash(release));
    }

    function _payMilestone(uint256 orderId, uint8 index, uint256 amount, uint8 rating) internal {
        (MilestoneRelease memory release, bytes memory signature) = _msRelease(orderId, index, amount, rating);
        vm.prank(payee);
        escrow.releaseMilestone(release, signature);
    }

    function _plan(uint256 orderId) internal view returns (MilestonePlan memory) {
        return escrow.getPlan(orderId);
    }

    function _list(uint256 orderId) internal view returns (Milestone[] memory) {
        return escrow.getMilestones(orderId);
    }

    function _giveStanding(address provider, uint256 closed) internal {
        for (uint256 i = 0; i < closed; i++) {
            reputation.recordSettled(address(uint160(0xA000 + i)), provider, 5, false, false, true);
        }
    }

    function _feeAuthFor(address who, uint256 amount) internal returns (DepositAuth memory) {
        usdc.mint(who, amount);
        uint256 key = who == payer ? payerKey : payeeKey;
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
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return
            DepositAuth({
                method: DepositMethod.Permit, nonce: 0, deadline: deadline, signature: abi.encodePacked(r, s, v)
            });
    }
}
