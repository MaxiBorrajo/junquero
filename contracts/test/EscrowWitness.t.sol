// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {WitnessBase} from "./WitnessBase.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {IEscrowEvents} from "../src/interfaces/IEscrowEvents.sol";
import {EscrowHashes} from "../src/libraries/EscrowHashes.sol";
import {
    Order,
    OrderStatus,
    PaymentMode,
    Modality,
    CreateParams,
    DepositAuth,
    WitnessAssignment,
    Attestation,
    AttestationRecord,
    Release,
    TokenConfig
} from "../src/libraries/OrderTypes.sol";

contract EscrowWitnessTest is WitnessBase {
    function _expectAssignRevert(WitnessAssignment memory a, bytes memory reason) internal {
        bytes32 structHash = EscrowHashes.hash(a);
        bytes memory payerSig = _sign(payerKey, structHash);
        bytes memory payeeSig = _sign(payeeKey, structHash);
        vm.expectRevert(reason);
        escrow.assignWitness(a, payerSig, payeeSig);
    }

    function _release100(uint256 orderId) internal {
        (Release memory r, bytes memory sig) = _release(orderId, 100 * USDC, 5);
        vm.prank(payee);
        escrow.release(r, sig);
    }

    function test_theWitnessIsAssignedByBothParties() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);
        WitnessAssignment memory a = _assignment(orderId);
        bytes32 structHash = EscrowHashes.hash(a);
        bytes memory payerSig = _sign(payerKey, structHash);
        bytes memory payeeSig = _sign(payeeKey, structHash);

        vm.expectEmit(true, true, false, false);
        emit IEscrowEvents.WitnessAssigned(orderId, witness);
        escrow.assignWitness(a, payerSig, payeeSig);

        assertEq(escrow.witnessOf(orderId), witness);
    }

    function test_bothSignaturesAreRequired() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);
        WitnessAssignment memory a = _assignment(orderId);
        bytes32 structHash = EscrowHashes.hash(a);
        bytes memory good = _sign(payerKey, structHash);
        bytes memory forged = _sign(otherKey, structHash);

        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidSignature.selector, payee));
        escrow.assignWitness(a, good, forged);

        bytes memory goodPayee = _sign(payeeKey, structHash);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidSignature.selector, payer));
        escrow.assignWitness(a, forged, goodPayee);
    }

    function test_theAssignmentExpires() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);
        WitnessAssignment memory a = _assignment(orderId);
        vm.warp(a.expiry + 1);

        _expectAssignRevert(a, abi.encodeWithSelector(IEscrowEvents.SignatureExpired.selector, a.expiry));
    }

    function test_invalidWitnessesAreRejected() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);
        WitnessAssignment memory a = _assignment(orderId);

        a.witness = address(0);
        _expectAssignRevert(a, abi.encodeWithSelector(IEscrowEvents.InvalidWitness.selector, address(0)));
        a.witness = payer;
        _expectAssignRevert(a, abi.encodeWithSelector(IEscrowEvents.InvalidWitness.selector, payer));
        a.witness = payee;
        _expectAssignRevert(a, abi.encodeWithSelector(IEscrowEvents.InvalidWitness.selector, payee));
    }

    function test_aGroupContributorCannotBeTheWitness() public {
        uint256 orderId = _openGroup();
        _proposeProvider(orderId);
        vm.warp(block.timestamp + 24 hours);
        _agree(orderId, 100 * USDC);
        WitnessAssignment memory a = _assignment(orderId);
        a.witness = members[0];

        _expectAssignRevert(a, abi.encodeWithSelector(IEscrowEvents.InvalidWitness.selector, members[0]));
    }

    function test_aWitnessCanOnlyBeAssignedOnce() public {
        uint256 orderId = _requiredPlain();
        WitnessAssignment memory a = _assignment(orderId);

        _expectAssignRevert(a, abi.encodeWithSelector(IEscrowEvents.WitnessAlreadyAssigned.selector, witness));
    }

    function test_theWitnessNeedsAnAgreedOrder() public {
        uint256 orderId = _createUsdc(100 * USDC);
        WitnessAssignment memory a = _assignment(orderId);

        _expectAssignRevert(a, abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Open));
    }

    function test_cashOrdersCannotHaveAWitness() public {
        CreateParams memory params = _params(address(usdc), 100 * USDC);
        params.mode = PaymentMode.Cash;
        DepositAuth memory auth = _permitAuth(7 * USDC);
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(params, auth);
        _agree(orderId, 100 * USDC);
        WitnessAssignment memory a = _assignment(orderId);

        _expectAssignRevert(a, abi.encodeWithSelector(IEscrowEvents.UnsupportedForMode.selector));
    }

    function test_aRequiredOrderCannotBeDeliveredWithoutAWitness() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);

        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.WitnessRequired.selector);
        escrow.deliver(orderId, EVIDENCE);
    }

    function test_aSmallOrderDoesNotNeedAWitness() public {
        uint256 orderId = _createUsdc(50 * USDC);
        _agree(orderId, 50 * USDC);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
        _release(orderId, 50 * USDC, 5);
        (Release memory r, bytes memory sig) = _release(orderId, 50 * USDC, 5);
        vm.prank(payee);
        escrow.release(r, sig);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
    }

    function test_theWitnessThresholdIsExclusive() public {
        uint256 atLimit = _createUsdc(50 * USDC);
        _agree(atLimit, 50 * USDC);
        vm.prank(payee);
        escrow.deliver(atLimit, EVIDENCE);

        uint256 above = _createUsdc(50 * USDC + 1);
        _agree(above, 50 * USDC + 1);
        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.WitnessRequired.selector);
        escrow.deliver(above, EVIDENCE);
    }

    function test_aRequiredOrderCannotBeReleasedWithoutTheAttestation() public {
        uint256 orderId = _deliveredPlain();
        (Release memory r, bytes memory sig) = _release(orderId, 100 * USDC, 5);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.WitnessAttestationMissing.selector, 0));
        escrow.release(r, sig);
    }

    function test_anApprovedAttestationUnlocksTheRelease() public {
        uint256 orderId = _deliveredPlain();
        _attest(orderId, 0, EVIDENCE, true);
        _release100(orderId);

        assertEq(usdc.balanceOf(payee), 100 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
    }

    function test_aRejectedAttestationDoesNotUnlockTheRelease() public {
        uint256 orderId = _deliveredPlain();

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.Attested(orderId, witness, 0, EVIDENCE, false);
        _attest(orderId, 0, EVIDENCE, false);

        (Release memory r, bytes memory sig) = _release(orderId, 100 * USDC, 5);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.WitnessAttestationMissing.selector, 0));
        escrow.release(r, sig);
        assertFalse(escrow.attestationOf(orderId, 0).approved);
    }

    function test_theAutomaticReleaseAlsoNeedsTheAttestation() public {
        uint256 orderId = _deliveredPlain();
        vm.warp(block.timestamp + 30 days);

        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.WitnessAttestationMissing.selector, 0));
        escrow.autoRelease(orderId);

        _attest(orderId, 0, EVIDENCE, true);
        escrow.autoRelease(orderId);
        assertEq(usdc.balanceOf(payee), 100 * USDC);
    }

    function test_aRejectionLetsThePayerDisputeInstead() public {
        uint256 orderId = _deliveredPlain();
        _attest(orderId, 0, EVIDENCE, false);
        DepositAuth memory auth = _feeAuthFor(payer, 3 * USDC);
        vm.prank(payer);
        escrow.openDispute(orderId, keccak256("witness says no"), auth);

        court.resolve(orderId, 0);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
        assertEq(usdc.balanceOf(payee), 0);
    }

    function test_theJuryCanResolveWithoutAnyAttestation() public {
        uint256 orderId = _deliveredPlain();
        DepositAuth memory auth = _feeAuthFor(payee, 3 * USDC);
        vm.prank(payee);
        escrow.openDispute(orderId, keccak256("payer unresponsive"), auth);

        court.resolve(orderId, 10_000);

        assertEq(usdc.balanceOf(payee), 100 * USDC);
    }

    function test_attestationsAreBoundToTheCurrentEvidence() public {
        uint256 orderId = _deliveredPlain();
        Attestation memory a = _attestation(orderId, 0, keccak256("other evidence"), true);
        bytes memory sig = _sign(witnessKey, EscrowHashes.hash(a));

        vm.expectRevert(IEscrowEvents.EvidenceMismatch.selector);
        escrow.attest(a, sig);
    }

    function test_nothingCanBeAttestedBeforeTheDelivery() public {
        uint256 orderId = _requiredPlain();
        Attestation memory a = _attestation(orderId, 0, EVIDENCE, true);
        bytes memory sig = _sign(witnessKey, EscrowHashes.hash(a));

        vm.expectRevert(IEscrowEvents.EvidenceMismatch.selector);
        escrow.attest(a, sig);
    }

    function test_onlyTheAssignedWitnessSignatureCounts() public {
        uint256 orderId = _deliveredPlain();
        Attestation memory a = _attestation(orderId, 0, EVIDENCE, true);
        bytes memory forged = _sign(otherKey, EscrowHashes.hash(a));

        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidSignature.selector, witness));
        escrow.attest(a, forged);
    }

    function test_anyoneCanSubmitTheWitnessSignature() public {
        uint256 orderId = _deliveredPlain();
        Attestation memory a = _attestation(orderId, 0, EVIDENCE, true);
        bytes memory sig = _sign(witnessKey, EscrowHashes.hash(a));

        vm.prank(other);
        escrow.attest(a, sig);

        assertTrue(escrow.attestationOf(orderId, 0).approved);
    }

    function test_attestationsExpire() public {
        uint256 orderId = _deliveredPlain();
        Attestation memory a = _attestation(orderId, 0, EVIDENCE, true);
        bytes memory sig = _sign(witnessKey, EscrowHashes.hash(a));
        vm.warp(a.expiry + 1);

        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.SignatureExpired.selector, a.expiry));
        escrow.attest(a, sig);
    }

    function test_theSameEvidenceCannotBeAttestedTwice() public {
        uint256 orderId = _deliveredPlain();
        _attest(orderId, 0, EVIDENCE, true);
        Attestation memory a = _attestation(orderId, 0, EVIDENCE, true);
        bytes memory sig = _sign(witnessKey, EscrowHashes.hash(a));

        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.AlreadyAttested.selector, 0));
        escrow.attest(a, sig);
    }

    function test_attestationsNeedAnAssignedWitness() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);
        Attestation memory a = _attestation(orderId, 0, EVIDENCE, true);

        vm.expectRevert(IEscrowEvents.WitnessNotAssigned.selector);
        escrow.attest(a, "");
    }

    function test_attestationsNeedALiveOrder() public {
        uint256 orderId = _deliveredPlain();
        _attest(orderId, 0, EVIDENCE, true);
        _release100(orderId);
        Attestation memory a = _attestation(orderId, 0, keccak256("late"), true);

        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Settled));
        escrow.attest(a, "");

        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.UnknownOrder.selector, 99));
        escrow.attest(_attestation(99, 0, EVIDENCE, true), "");
    }

    function test_theAttestationThroughTheForwarder() public {
        uint256 orderId = _deliveredPlain();
        Attestation memory a = _attestation(orderId, 0, EVIDENCE, true);
        bytes memory sig = _sign(witnessKey, EscrowHashes.hash(a));
        _forward(payerKey, payer, address(escrow), abi.encodeCall(IEscrow.attest, (a, sig)));

        assertTrue(escrow.attestationOf(orderId, 0).approved);
    }

    function test_anAttestationPaysTheFeeFromTheTreasury() public {
        uint256 orderId = _deliveredPlain();
        uint256 treasuryBefore = usdc.balanceOf(address(treasury));

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.WitnessPaid(orderId, witness, uint128(USDC));
        _attest(orderId, 0, EVIDENCE, true);

        assertEq(usdc.balanceOf(witness), USDC);
        assertEq(treasuryBefore - usdc.balanceOf(address(treasury)), USDC);
        assertEq(usdc.balanceOf(address(escrow)), 100 * USDC);
    }

    function test_rejectionsAreAlsoPaid() public {
        uint256 orderId = _deliveredPlain();
        _attest(orderId, 0, EVIDENCE, false);

        assertEq(usdc.balanceOf(witness), USDC);
    }

    function test_noFeeIsPaidOnOrdersThatDidNotRequireAWitness() public {
        uint256 orderId = _createUsdc(50 * USDC);
        _agree(orderId, 50 * USDC);
        _assignWitness(orderId);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
        _attest(orderId, 0, EVIDENCE, true);

        assertEq(usdc.balanceOf(witness), 0);
    }

    function test_aZeroFeeConfigurationPaysNothing() public {
        TokenConfig memory config = escrow.tokenConfig(address(usdc));
        config.witnessFee = 0;
        vm.prank(admin);
        escrow.configureToken(address(usdc), config);
        uint256 orderId = _deliveredPlain();
        _attest(orderId, 0, EVIDENCE, true);

        assertEq(usdc.balanceOf(witness), 0);
        assertEq(escrow.witnessOwed(address(usdc), witness), 0);
    }

    function test_anEmptyTreasuryLeavesTheFeeOwed() public {
        uint256 drain = usdc.balanceOf(address(treasury));
        vm.prank(admin);
        treasury.withdraw(usdc, other, drain);
        uint256 orderId = _deliveredPlain();

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.WitnessFeeOwed(orderId, witness, uint128(USDC));
        _attest(orderId, 0, EVIDENCE, true);

        assertEq(escrow.witnessOwed(address(usdc), witness), USDC);
        assertTrue(escrow.attestationOf(orderId, 0).approved);
    }

    function test_theOwedFeeCanBeClaimedOnceTheTreasuryIsFunded() public {
        uint256 drain = usdc.balanceOf(address(treasury));
        vm.prank(admin);
        treasury.withdraw(usdc, other, drain);
        uint256 orderId = _deliveredPlain();
        _attest(orderId, 0, EVIDENCE, true);

        vm.expectRevert();
        escrow.claimWitnessFee(address(usdc), witness);
        assertEq(escrow.witnessOwed(address(usdc), witness), USDC);

        usdc.mint(address(treasury), 10 * USDC);
        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.WitnessFeeClaimed(address(usdc), witness, USDC);
        vm.prank(other);
        escrow.claimWitnessFee(address(usdc), witness);

        assertEq(usdc.balanceOf(witness), USDC);
        assertEq(escrow.witnessOwed(address(usdc), witness), 0);
    }

    function test_claimingWithNothingOwedReverts() public {
        vm.expectRevert(IEscrowEvents.NothingOwed.selector);
        escrow.claimWitnessFee(address(usdc), witness);
    }

    function test_aRedeliveryNeedsANewAttestation() public {
        CreateParams memory params = _params(address(usdc), 100 * USDC);
        params.modality = Modality.Remote;
        DepositAuth memory auth = _permitAuth(100 * USDC);
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(params, auth);
        _agree(orderId, 100 * USDC);
        _assignWitness(orderId);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
        _attest(orderId, 0, EVIDENCE, true);

        vm.prank(payer);
        escrow.requestChanges(orderId, keccak256("fix"));
        bytes32 second = keccak256("second delivery");
        vm.prank(payee);
        escrow.deliver(orderId, second);

        (Release memory r, bytes memory sig) = _release(orderId, 100 * USDC, 5);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.WitnessAttestationMissing.selector, 0));
        escrow.release(r, sig);

        _attest(orderId, 0, second, true);
        (r, sig) = _release(orderId, 100 * USDC, 5);
        vm.prank(payee);
        escrow.release(r, sig);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
    }

    function test_theWitnessFeeNeverTouchesTheOrderFunds() public {
        uint256 orderId = _deliveredPlain();
        _attest(orderId, 0, EVIDENCE, true);
        _release100(orderId);

        assertEq(usdc.balanceOf(payee), 100 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }
}
