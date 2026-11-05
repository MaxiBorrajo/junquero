// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {WitnessBase} from "./WitnessBase.sol";
import {IEscrowEvents} from "../src/interfaces/IEscrowEvents.sol";
import {EscrowHashes} from "../src/libraries/EscrowHashes.sol";
import {
    Order,
    OrderStatus,
    DepositAuth,
    Attestation,
    MilestoneRelease,
    MilestoneTerms
} from "../src/libraries/OrderTypes.sol";

contract EscrowWitnessMilestonesTest is WitnessBase {
    function _witnessedPlan() internal returns (uint256 orderId) {
        orderId = _standard();
        _assignWitness(orderId);
    }

    function _evidenceOf(uint8 index) internal pure returns (bytes32) {
        return keccak256(abi.encode("evidence", index));
    }

    function test_aMilestoneCannotBeDeliveredWithoutAWitness() public {
        uint256 orderId = _standard();

        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.WitnessRequired.selector);
        escrow.deliverMilestone(orderId, 0, EVIDENCE);
    }

    function test_theWitnessCanBeAssignedOnAMilestoneOrder() public {
        uint256 orderId = _witnessedPlan();

        assertEq(escrow.witnessOf(orderId), witness);
        _deliverAt(orderId, 0);
        assertEq(uint8(_list(orderId)[0].status), 1);
    }

    function test_aMilestoneReleaseNeedsItsAttestation() public {
        uint256 orderId = _witnessedPlan();
        _deliverAt(orderId, 0);
        (MilestoneRelease memory release, bytes memory sig) = _msRelease(orderId, 0, 100 * USDC, 5);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.WitnessAttestationMissing.selector, 0));
        escrow.releaseMilestone(release, sig);

        _attest(orderId, 0, _evidenceOf(0), true);
        vm.prank(payee);
        escrow.releaseMilestone(release, sig);
        assertEq(usdc.balanceOf(payee), 100 * USDC);
    }

    function test_theQrCannotPayAMilestoneThatWasNeverDelivered() public {
        uint256 orderId = _witnessedPlan();
        (MilestoneRelease memory release, bytes memory sig) = _msRelease(orderId, 0, 100 * USDC, 5);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.WitnessAttestationMissing.selector, 0));
        escrow.releaseMilestone(release, sig);
    }

    function test_onlyTheCurrentMilestoneCanBeAttested() public {
        uint256 orderId = _witnessedPlan();
        _deliverAt(orderId, 0);
        Attestation memory a = _attestation(orderId, 1, _evidenceOf(1), true);
        bytes memory sig = _sign(witnessKey, EscrowHashes.hash(a));

        vm.expectRevert(IEscrowEvents.EvidenceMismatch.selector);
        escrow.attest(a, sig);
    }

    function test_everyMilestoneNeedsItsOwnAttestationAndPaysTheFee() public {
        uint256 orderId = _witnessedPlan();
        for (uint8 i = 0; i < 3; i++) {
            _deliverAt(orderId, i);
            _attest(orderId, i, _evidenceOf(i), true);
            _payMilestone(orderId, i, 100 * USDC, 5);
        }

        assertEq(usdc.balanceOf(witness), 3 * USDC);
        assertEq(usdc.balanceOf(payee), 300 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
        assertTrue(escrow.attestationOf(orderId, 2).approved);
    }

    function test_theAutomaticMilestoneReleaseNeedsTheAttestation() public {
        uint256 orderId = _witnessedPlan();
        _deliverAt(orderId, 0);
        vm.warp(block.timestamp + 72 hours);

        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.WitnessAttestationMissing.selector, 0));
        escrow.autoReleaseMilestone(orderId);

        _attest(orderId, 0, _evidenceOf(0), true);
        escrow.autoReleaseMilestone(orderId);
        assertEq(usdc.balanceOf(payee), 100 * USDC);
    }

    function test_aMilestoneDisputeNeedsNoAttestation() public {
        uint256 orderId = _witnessedPlan();
        _deliverAt(orderId, 0);
        DepositAuth memory auth = _feeAuthFor(payer, 3 * USDC);
        vm.prank(payer);
        escrow.openDispute(orderId, keccak256("no"), auth);

        court.resolve(orderId, 10_000);

        assertEq(usdc.balanceOf(payee), 100 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Agreed));
    }

    function test_theAdvanceMilestoneIsExemptFromTheWitness() public {
        _giveStanding(payee, 5);
        uint256 orderId =
            _newMilestoneOrder(_amounts(uint128(60 * USDC), uint128(120 * USDC), uint128(120 * USDC)), true);

        vm.prank(payee);
        escrow.claimAdvance(orderId);

        assertEq(usdc.balanceOf(payee), 60 * USDC);
        assertEq(_plan(orderId).next, 1);
    }

    function test_theAdvanceCanAlsoBePaidByQrWithoutAWitness() public {
        _giveStanding(payee, 5);
        uint256 orderId =
            _newMilestoneOrder(_amounts(uint128(60 * USDC), uint128(120 * USDC), uint128(120 * USDC)), true);
        _payMilestone(orderId, 0, 60 * USDC, 5);

        assertEq(usdc.balanceOf(payee), 60 * USDC);
    }

    function test_theMilestonesAfterTheAdvanceStillNeedTheWitness() public {
        _giveStanding(payee, 5);
        uint256 orderId =
            _newMilestoneOrder(_amounts(uint128(60 * USDC), uint128(120 * USDC), uint128(120 * USDC)), true);
        _payMilestone(orderId, 0, 60 * USDC, 5);

        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.WitnessRequired.selector);
        escrow.deliverMilestone(orderId, 1, EVIDENCE);
    }

    function test_aGroupCoordinatorAssignsTheWitnessForTheWholeGroup() public {
        uint256 orderId = _createGroup(300 * USDC);
        _contribute(orderId, 0, 120 * USDC);
        _contribute(orderId, 1, 90 * USDC);
        _contribute(orderId, 2, 60 * USDC);
        _contribute(orderId, 3, 30 * USDC);
        _proposeProvider(orderId);
        vm.warp(block.timestamp + 24 hours);
        _agreeMilestones(
            orderId, _terms(_amounts(uint128(100 * USDC), uint128(100 * USDC), uint128(100 * USDC)), false)
        );
        _assignWitness(orderId);
        _deliverAt(orderId, 0);
        _attest(orderId, 0, _evidenceOf(0), true);
        _payMilestone(orderId, 0, 100 * USDC, 5);

        assertEq(usdc.balanceOf(payee), 100 * USDC);
        assertEq(usdc.balanceOf(witness), USDC);
    }

    function test_theTotalMoneyIsConservedWithAWitness() public {
        uint256 total = usdc.balanceOf(payer) + usdc.balanceOf(payee) + usdc.balanceOf(witness)
            + usdc.balanceOf(address(treasury)) + usdc.balanceOf(address(escrow));
        uint256 orderId = _witnessedPlan();
        for (uint8 i = 0; i < 3; i++) {
            _deliverAt(orderId, i);
            _attest(orderId, i, _evidenceOf(i), true);
            _payMilestone(orderId, i, 60 * USDC, 4);
        }

        uint256 afterwards = usdc.balanceOf(payer) + usdc.balanceOf(payee) + usdc.balanceOf(witness)
            + usdc.balanceOf(address(treasury)) + usdc.balanceOf(address(escrow));
        assertEq(afterwards, total);
    }
}
