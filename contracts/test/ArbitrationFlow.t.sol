// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ArbitrationBase} from "./ArbitrationBase.sol";
import {Arbitration} from "../src/Arbitration.sol";
import {IArbitrationEvents} from "../src/interfaces/IArbitrationEvents.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {OrderStatus} from "../src/libraries/OrderTypes.sol";

contract ArbitrationFlowTest is ArbitrationBase {
    function _expectWrongPhase(uint256 caseId, Arbitration.Phase phase) internal {
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.WrongPhase.selector, caseId, uint8(phase)));
    }

    function test_openCaseOnlyByTheEscrow() public {
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotEscrow.selector, other));
        court.openCase(1, payer, payee, payer, 0, address(usdc), 3, REASON);
    }

    function test_disputeOpensACaseWaitingForTheResponse() public {
        (uint256 orderId, uint256 caseId) = _openMedium();

        Arbitration.Case memory c = court.getCase(caseId);
        assertEq(caseId, 1);
        assertEq(c.orderId, orderId);
        assertEq(c.claimant, payer);
        assertEq(c.jurors, 3);
        assertEq(c.fee, 3 * FEE_PER_JUROR);
        assertEq(uint8(c.phase), uint8(Arbitration.Phase.Response));
        assertEq(c.commitEnd, block.timestamp + 72 hours);
    }

    function test_unknownCaseReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.UnknownCase.selector, 99));
        court.draw(99);
    }

    function test_respondentRespondsAndTheSeedRoundStarts() public {
        (, uint256 caseId) = _openMedium();

        vm.expectEmit(true, true, false, true);
        emit IArbitrationEvents.Responded(caseId, payee, RESPONSE);
        _respond(caseId);

        Arbitration.Case memory c = court.getCase(caseId);
        assertEq(uint8(c.phase), uint8(Arbitration.Phase.Seed));
        assertEq(c.commitEnd, block.timestamp + 24 hours);
        assertEq(c.revealEnd, block.timestamp + 24 hours + 6 hours);
    }

    function test_onlyTheRespondentCanRespond() public {
        (, uint256 caseId) = _openMedium();

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotRespondent.selector, payer));
        court.respond(caseId, RESPONSE);

        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotRespondent.selector, other));
        court.respond(caseId, RESPONSE);
    }

    function test_respondentIsThePayerWhenTheProviderClaims() public {
        (, uint256 caseId) = _openCase(payee, 100 * USDC, 3);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotRespondent.selector, payee));
        court.respond(caseId, RESPONSE);

        vm.prank(payer);
        court.respond(caseId, RESPONSE);
        assertEq(uint8(court.getCase(caseId).phase), uint8(Arbitration.Phase.Seed));
    }

    function test_respondAfterTheWindowReverts() public {
        (, uint256 caseId) = _openMedium();
        uint40 endsAt = court.getCase(caseId).commitEnd;
        vm.warp(endsAt + 1);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.WindowClosed.selector, endsAt));
        court.respond(caseId, RESPONSE);
    }

    function test_respondRightAtTheEndOfTheWindowStillWorks() public {
        (, uint256 caseId) = _openMedium();
        vm.warp(court.getCase(caseId).commitEnd);
        _respond(caseId);

        assertEq(uint8(court.getCase(caseId).phase), uint8(Arbitration.Phase.Seed));
    }

    function test_respondTwiceReverts() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);

        _expectWrongPhase(caseId, Arbitration.Phase.Seed);
        vm.prank(payee);
        court.respond(caseId, RESPONSE);
    }

    function test_defaultBeforeTheWindowEndsReverts() public {
        (, uint256 caseId) = _openMedium();
        uint40 endsAt = court.getCase(caseId).commitEnd;
        vm.warp(endsAt);

        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.ResponseWindowOpen.selector, endsAt));
        court.resolveByDefault(caseId);
    }

    function test_defaultGivesTheClaimantTheCaseAndRefundsTheFee() public {
        (uint256 orderId, uint256 caseId) = _openMedium();
        uint256 payerBefore = usdc.balanceOf(payer);
        vm.warp(court.getCase(caseId).commitEnd + 1);

        vm.expectEmit(true, true, false, true);
        emit IArbitrationEvents.ResolvedByDefault(caseId, payer);
        court.resolveByDefault(caseId);

        assertEq(usdc.balanceOf(payer) - payerBefore, 100 * USDC + 3 * FEE_PER_JUROR);
        assertEq(usdc.balanceOf(payee), 0);
        assertEq(usdc.balanceOf(address(court)), JUROR_DEPOSIT * 7);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
        assertEq(uint8(court.getCase(caseId).phase), uint8(Arbitration.Phase.Resolved));
    }

    function test_defaultWhenTheProviderClaimedPaysTheProvider() public {
        (, uint256 caseId) = _openCase(payee, 100 * USDC, 3);
        uint256 payeeBefore = usdc.balanceOf(payee);
        vm.warp(court.getCase(caseId).commitEnd + 1);

        court.resolveByDefault(caseId);

        assertEq(usdc.balanceOf(payee) - payeeBefore, 100 * USDC + 3 * FEE_PER_JUROR);
    }

    function test_defaultIsNotPossibleAfterAResponse() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        vm.warp(block.timestamp + 10 days);

        _expectWrongPhase(caseId, Arbitration.Phase.Seed);
        court.resolveByDefault(caseId);
    }

    function test_defaultCannotRepeat() public {
        (, uint256 caseId) = _openMedium();
        vm.warp(court.getCase(caseId).commitEnd + 1);
        court.resolveByDefault(caseId);

        _expectWrongPhase(caseId, Arbitration.Phase.Resolved);
        court.resolveByDefault(caseId);
    }

    function test_eligibleJurorCommitsASeed() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        bytes32 commitment = court.seedHash(caseId, jurors[0], _secretOf(jurors[0], 0));

        vm.expectEmit(true, true, false, false);
        emit IArbitrationEvents.SeedCommitted(caseId, jurors[0]);
        vm.prank(jurors[0]);
        court.commitSeed(caseId, commitment);

        assertEq(court.committersOf(caseId, 0).length, 1);
    }

    function test_jurorWithoutStakeCannotCommit() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        address poor = makeAddr("poor");
        vm.prank(admin);
        credentials.issue(poor, 0);
        vm.prank(admin);
        court.setSeedJuror(poor, true);

        vm.prank(poor);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotEligible.selector, poor));
        court.commitSeed(caseId, bytes32(uint256(1)));
    }

    function test_jurorWithoutCredentialCannotCommit() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        address anon = makeAddr("anon");
        usdc.mint(anon, JUROR_DEPOSIT);
        vm.startPrank(anon);
        usdc.approve(address(court), type(uint256).max);
        court.stake(uint128(JUROR_DEPOSIT));
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotEligible.selector, anon));
        court.commitSeed(caseId, bytes32(uint256(1)));
        vm.stopPrank();
    }

    function test_jurorWithoutHistoryOrSeedFlagCannotCommit() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        _setParameter(ParameterKeys.JUROR_MIN_CLOSED, 1);
        vm.prank(admin);
        court.setSeedJuror(jurors[1], false);

        vm.prank(jurors[1]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotEligible.selector, jurors[1]));
        court.commitSeed(caseId, bytes32(uint256(1)));

        vm.prank(jurors[0]);
        court.commitSeed(caseId, bytes32(uint256(1)));
    }

    function test_jurorBelowTheMinimumLevelCannotCommit() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        _setParameter(ParameterKeys.JUROR_MIN_LEVEL, 1);

        vm.prank(jurors[0]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotEligible.selector, jurors[0]));
        court.commitSeed(caseId, bytes32(uint256(1)));

        vm.prank(admin);
        credentials.issue(jurors[0], 1);
        vm.prank(jurors[0]);
        court.commitSeed(caseId, bytes32(uint256(1)));
    }

    function test_partiesCannotBeJurors() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        _registerJuror(payer, JUROR_DEPOSIT);
        _registerJuror(payee, JUROR_DEPOSIT);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotEligible.selector, payer));
        court.commitSeed(caseId, bytes32(uint256(1)));

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotEligible.selector, payee));
        court.commitSeed(caseId, bytes32(uint256(1)));
    }

    function test_commitTwiceReverts() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        vm.startPrank(jurors[0]);
        court.commitSeed(caseId, bytes32(uint256(1)));
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.AlreadyCommitted.selector, jurors[0]));
        court.commitSeed(caseId, bytes32(uint256(2)));
        vm.stopPrank();
    }

    function test_commitAfterTheWindowReverts() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        uint40 endsAt = court.getCase(caseId).commitEnd;
        vm.warp(endsAt + 1);

        vm.prank(jurors[0]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.WindowClosed.selector, endsAt));
        court.commitSeed(caseId, bytes32(uint256(1)));
    }

    function test_commitBeforeTheResponseReverts() public {
        (, uint256 caseId) = _openMedium();

        _expectWrongPhase(caseId, Arbitration.Phase.Response);
        vm.prank(jurors[0]);
        court.commitSeed(caseId, bytes32(uint256(1)));
    }

    function test_seedParticipantsAreBounded() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        for (uint256 i = 0; i < 40; i++) {
            address juror = makeAddr(string.concat("crowd", vm.toString(i)));
            _registerJuror(juror, JUROR_DEPOSIT);
            vm.prank(juror);
            court.commitSeed(caseId, bytes32(uint256(i + 1)));
        }
        vm.prank(jurors[0]);
        vm.expectRevert(IArbitrationEvents.TooManyParticipants.selector);
        court.commitSeed(caseId, bytes32(uint256(99)));
    }

    function test_revealBeforeTheCommitWindowEndsReverts() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        bytes32 commitment = court.seedHash(caseId, jurors[0], _secretOf(jurors[0], 0));
        vm.prank(jurors[0]);
        court.commitSeed(caseId, commitment);
        uint40 endsAt = court.getCase(caseId).commitEnd;

        vm.prank(jurors[0]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.WindowOpen.selector, endsAt));
        court.revealSeed(caseId, _secretOf(jurors[0], 0));
    }

    function test_revealWithAWrongSecretReverts() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        bytes32 commitment = court.seedHash(caseId, jurors[0], _secretOf(jurors[0], 0));
        vm.prank(jurors[0]);
        court.commitSeed(caseId, commitment);
        vm.warp(court.getCase(caseId).commitEnd + 1);

        vm.prank(jurors[0]);
        vm.expectRevert(IArbitrationEvents.HashMismatch.selector);
        court.revealSeed(caseId, bytes32(uint256(1234)));
    }

    function test_revealWithoutACommitmentReverts() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        vm.warp(court.getCase(caseId).commitEnd + 1);

        vm.prank(jurors[3]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NothingCommitted.selector, jurors[3]));
        court.revealSeed(caseId, bytes32(uint256(1)));
    }

    function test_revealTwiceReverts() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        bytes32 commitment = court.seedHash(caseId, jurors[0], _secretOf(jurors[0], 0));
        vm.prank(jurors[0]);
        court.commitSeed(caseId, commitment);
        vm.warp(court.getCase(caseId).commitEnd + 1);

        vm.startPrank(jurors[0]);
        court.revealSeed(caseId, _secretOf(jurors[0], 0));
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.AlreadyRevealed.selector, jurors[0]));
        court.revealSeed(caseId, _secretOf(jurors[0], 0));
        vm.stopPrank();
    }

    function test_revealAfterTheWindowReverts() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        bytes32 commitment = court.seedHash(caseId, jurors[0], _secretOf(jurors[0], 0));
        vm.prank(jurors[0]);
        court.commitSeed(caseId, commitment);
        uint40 endsAt = court.getCase(caseId).revealEnd;
        vm.warp(endsAt + 1);

        vm.prank(jurors[0]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.WindowClosed.selector, endsAt));
        court.revealSeed(caseId, _secretOf(jurors[0], 0));
    }

    function test_recusalRemovesAJurorFromThePool() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);

        vm.expectEmit(true, true, true, false);
        emit IArbitrationEvents.Recused(caseId, payer, jurors[0]);
        vm.prank(payer);
        court.recuse(caseId, jurors[0]);

        assertTrue(court.isRecused(caseId, jurors[0]));
        vm.prank(jurors[0]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotEligible.selector, jurors[0]));
        court.commitSeed(caseId, bytes32(uint256(1)));
    }

    function test_recusalLimitIsPerParty() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        vm.startPrank(payer);
        court.recuse(caseId, jurors[0]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.RecusalLimitReached.selector, 1));
        court.recuse(caseId, jurors[1]);
        vm.stopPrank();

        vm.prank(payee);
        court.recuse(caseId, jurors[1]);
        assertTrue(court.isRecused(caseId, jurors[1]));
    }

    function test_onlyPartiesCanRecuse() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);

        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotParty.selector, other));
        court.recuse(caseId, jurors[0]);
    }

    function test_recusalAfterTheRevealStillKeepsTheJurorOut() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        address[] memory who = _slice(4);
        _commitSeeds(caseId, who);
        vm.warp(court.getCase(caseId).commitEnd + 1);
        _revealSeeds(caseId, who);

        vm.prank(payee);
        court.recuse(caseId, jurors[0]);
        vm.warp(court.getCase(caseId).revealEnd + 1);
        court.draw(caseId);

        address[] memory selected = court.jurorsOf(caseId);
        for (uint256 i = 0; i < selected.length; i++) {
            assertTrue(selected[i] != jurors[0]);
        }
    }

    function test_drawBeforeTheRevealWindowEndsReverts() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        uint40 endsAt = court.getCase(caseId).revealEnd;
        vm.warp(endsAt);

        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.WindowOpen.selector, endsAt));
        court.draw(caseId);
    }

    function test_drawPicksDistinctRevealersAndLocksTheirStake() public {
        (, uint256 caseId) = _openMedium();
        address[] memory selected = _drawJury(caseId, 6);

        assertEq(selected.length, 3);
        assertTrue(selected[0] != selected[1] && selected[1] != selected[2] && selected[0] != selected[2]);
        for (uint256 i = 0; i < selected.length; i++) {
            assertTrue(court.jurorCase(caseId, selected[i]).selected);
            assertEq(court.account(selected[i]).locked, STAKE);
            assertEq(court.account(selected[i]).active, 1);
        }
        Arbitration.Case memory c = court.getCase(caseId);
        assertEq(uint8(c.phase), uint8(Arbitration.Phase.Vote));
        assertEq(c.commitEnd, block.timestamp + 24 hours);
        assertEq(c.revealEnd, block.timestamp + 48 hours);
    }

    function test_drawOnlyPicksJurorsWhoRevealed() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        address[] memory committed = _slice(6);
        _commitSeeds(caseId, committed);
        vm.warp(court.getCase(caseId).commitEnd + 1);
        address[] memory revealing = new address[](4);
        for (uint256 i = 0; i < 4; i++) {
            revealing[i] = committed[i + 2];
        }
        _revealSeeds(caseId, revealing);
        vm.warp(court.getCase(caseId).revealEnd + 1);
        court.draw(caseId);

        address[] memory selected = court.jurorsOf(caseId);
        for (uint256 i = 0; i < selected.length; i++) {
            assertTrue(selected[i] != jurors[0] && selected[i] != jurors[1]);
        }
    }

    function test_drawUsesFiveJurorsForLargeOrders() public {
        (, uint256 caseId) = _openCase(payer, 500 * USDC, 5);
        address[] memory selected = _drawJury(caseId, 7);

        assertEq(selected.length, 5);
    }

    function test_drawWithTooFewRevealersStartsAReplacementRound() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        _runSeedRound(caseId, _slice(2));

        Arbitration.Case memory c = court.getCase(caseId);
        assertEq(c.round, 1);
        assertEq(uint8(c.phase), uint8(Arbitration.Phase.Seed));
        assertEq(c.commitEnd, block.timestamp + 24 hours);
    }

    function test_replacementRoundCanSucceed() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        _runSeedRound(caseId, _slice(2));
        _runSeedRound(caseId, _slice(5));

        assertEq(court.jurorsOf(caseId).length, 3);
        assertEq(uint8(court.getCase(caseId).phase), uint8(Arbitration.Phase.Vote));
    }

    function test_exhaustedRoundsNeedAnEmergencyResolution() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        for (uint256 i = 0; i < 4; i++) {
            vm.warp(court.getCase(caseId).revealEnd + 1);
            court.draw(caseId);
        }

        assertEq(uint8(court.getCase(caseId).phase), uint8(Arbitration.Phase.NeedsEmergency));
    }

    function test_emergencyResolutionAfterNoJuryRefundsTheClaimantFee() public {
        (uint256 orderId, uint256 caseId) = _openMedium();
        _respond(caseId);
        for (uint256 i = 0; i < 4; i++) {
            vm.warp(court.getCase(caseId).revealEnd + 1);
            court.draw(caseId);
        }
        uint256 payeeBefore = usdc.balanceOf(payee);

        vm.expectEmit(true, false, false, true);
        emit IArbitrationEvents.EmergencyResolved(caseId, true, REASON);
        vm.prank(admin);
        court.resolveEmergency(caseId, true, REASON);

        assertEq(usdc.balanceOf(payee) - payeeBefore, 100 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
        assertEq(usdc.balanceOf(address(court)), JUROR_DEPOSIT * 7);
    }

    function test_drawSkipsRevealersWhoBecameIneligibleMeanwhile() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        address[] memory who = _slice(4);
        _commitSeeds(caseId, who);
        vm.warp(court.getCase(caseId).commitEnd + 1);
        _revealSeeds(caseId, who);

        vm.prank(jurors[0]);
        court.unstake(uint128(JUROR_DEPOSIT));
        vm.warp(court.getCase(caseId).revealEnd + 1);
        court.draw(caseId);

        address[] memory selected = court.jurorsOf(caseId);
        for (uint256 i = 0; i < selected.length; i++) {
            assertTrue(selected[i] != jurors[0]);
        }
    }

    function test_jurorsAreCappedAtTheActiveCaseLimit() public {
        (, uint256 first) = _openMedium();
        _drawJury(first, 3);
        (, uint256 second) = _openMedium();
        _drawJury(second, 3);

        (, uint256 third) = _openMedium();
        _respond(third);
        vm.prank(jurors[0]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotEligible.selector, jurors[0]));
        court.commitSeed(third, bytes32(uint256(1)));
        assertFalse(court.isEligible(jurors[0], third));
        assertTrue(court.isEligible(jurors[3], third));
    }

    function test_seedActionsThroughTheForwarderAttributeTheSigner() public {
        (, uint256 caseId) = _openMedium();
        _respond(caseId);
        bytes32 commitment = court.seedHash(caseId, jurors[0], _secretOf(jurors[0], 0));

        _forward(jurorKey, jurors[0], address(court), abi.encodeCall(Arbitration.commitSeed, (caseId, commitment)));

        assertEq(court.committersOf(caseId, 0)[0], jurors[0]);
    }
}
