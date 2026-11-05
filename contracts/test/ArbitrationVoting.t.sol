// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ArbitrationBase} from "./ArbitrationBase.sol";
import {Arbitration} from "../src/Arbitration.sol";
import {IArbitrationEvents} from "../src/interfaces/IArbitrationEvents.sol";
import {Role, Stats} from "../src/interfaces/IReputation.sol";
import {OrderStatus} from "../src/libraries/OrderTypes.sol";

contract ArbitrationVotingTest is ArbitrationBase {
    uint256 internal orderId;
    uint256 internal caseId;
    address[] internal panel;

    function _jury3() internal {
        (orderId, caseId) = _openMedium();
        panel = _drawJury(caseId, 3);
    }

    function _commitAs(address juror, uint8 vote, uint256 index) internal {
        bytes32 commitment = court.voteHash(caseId, juror, vote, _salt(caseId, index));
        vm.prank(juror);
        court.commitVote(caseId, commitment);
    }

    function _toRevealWindow() internal {
        vm.warp(court.getCase(caseId).commitEnd + 1);
    }

    function _totalLocked() internal view returns (uint256 locked) {
        for (uint256 i = 0; i < jurors.length; i++) {
            locked += court.account(jurors[i]).locked;
        }
    }

    function _totalStaked() internal view returns (uint256 staked) {
        for (uint256 i = 0; i < jurors.length; i++) {
            staked += court.account(jurors[i]).staked;
        }
    }

    function _totalRewards() internal view returns (uint256 owed) {
        for (uint256 i = 0; i < jurors.length; i++) {
            owed += court.rewards(address(usdc), jurors[i]);
        }
    }

    function test_onlySelectedJurorsCanCommitAVote() public {
        _jury3();
        address outsider = jurors[5];

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotSelected.selector, outsider));
        court.commitVote(caseId, bytes32(uint256(1)));
    }

    function test_commitVoteEmitsEventAndStoresTheCommitment() public {
        _jury3();
        bytes32 commitment = court.voteHash(caseId, panel[0], PAYEE, _salt(caseId, 0));

        vm.expectEmit(true, true, false, false);
        emit IArbitrationEvents.VoteCommitted(caseId, panel[0]);
        vm.prank(panel[0]);
        court.commitVote(caseId, commitment);

        assertEq(court.jurorCase(caseId, panel[0]).voteCommit, commitment);
    }

    function test_commitVoteTwiceReverts() public {
        _jury3();
        _commitAs(panel[0], PAYEE, 0);

        vm.prank(panel[0]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.AlreadyCommitted.selector, panel[0]));
        court.commitVote(caseId, bytes32(uint256(2)));
    }

    function test_commitVoteAfterTheWindowReverts() public {
        _jury3();
        uint40 endsAt = court.getCase(caseId).commitEnd;
        vm.warp(endsAt + 1);

        vm.prank(panel[0]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.WindowClosed.selector, endsAt));
        court.commitVote(caseId, bytes32(uint256(1)));
    }

    function test_commitVoteBeforeTheJuryIsDrawnReverts() public {
        (, uint256 fresh) = _openMedium();
        _respond(fresh);

        vm.expectRevert(
            abi.encodeWithSelector(IArbitrationEvents.WrongPhase.selector, fresh, uint8(Arbitration.Phase.Seed))
        );
        vm.prank(jurors[0]);
        court.commitVote(fresh, bytes32(uint256(1)));
    }

    function test_revealBeforeTheCommitWindowEndsReverts() public {
        _jury3();
        _commitAs(panel[0], PAYEE, 0);
        uint40 endsAt = court.getCase(caseId).commitEnd;

        vm.prank(panel[0]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.WindowOpen.selector, endsAt));
        court.revealVote(caseId, PAYEE, _salt(caseId, 0));
    }

    function test_revealWithAWrongVoteOrSaltReverts() public {
        _jury3();
        _commitAs(panel[0], PAYEE, 0);
        _toRevealWindow();

        vm.startPrank(panel[0]);
        vm.expectRevert(IArbitrationEvents.HashMismatch.selector);
        court.revealVote(caseId, PAYER, _salt(caseId, 0));
        vm.expectRevert(IArbitrationEvents.HashMismatch.selector);
        court.revealVote(caseId, PAYEE, bytes32(uint256(77)));
        vm.stopPrank();
    }

    function test_revealRejectsInvalidVoteValues() public {
        _jury3();
        _commitAs(panel[0], PAYEE, 0);
        _toRevealWindow();

        vm.startPrank(panel[0]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.InvalidVote.selector, 0));
        court.revealVote(caseId, 0, _salt(caseId, 0));
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.InvalidVote.selector, 3));
        court.revealVote(caseId, 3, _salt(caseId, 0));
        vm.stopPrank();
    }

    function test_revealWithoutACommitmentReverts() public {
        _jury3();
        _toRevealWindow();

        vm.prank(panel[1]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NothingCommitted.selector, panel[1]));
        court.revealVote(caseId, PAYEE, _salt(caseId, 1));
    }

    function test_revealByAnOutsiderReverts() public {
        _jury3();
        _toRevealWindow();

        vm.prank(jurors[5]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotSelected.selector, jurors[5]));
        court.revealVote(caseId, PAYEE, bytes32(0));
    }

    function test_revealTwiceReverts() public {
        _jury3();
        _commitAs(panel[0], PAYEE, 0);
        _toRevealWindow();
        vm.startPrank(panel[0]);
        court.revealVote(caseId, PAYEE, _salt(caseId, 0));
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.AlreadyRevealed.selector, panel[0]));
        court.revealVote(caseId, PAYEE, _salt(caseId, 0));
        vm.stopPrank();
    }

    function test_revealAfterTheWindowReverts() public {
        _jury3();
        _commitAs(panel[0], PAYEE, 0);
        uint40 endsAt = court.getCase(caseId).revealEnd;
        vm.warp(endsAt + 1);

        vm.prank(panel[0]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.WindowClosed.selector, endsAt));
        court.revealVote(caseId, PAYEE, _salt(caseId, 0));
    }

    function test_finalizeBeforeTheRevealWindowEndsRevertsWhileVotesAreMissing() public {
        _jury3();
        _castVotes(caseId, _votes3(PAYEE, PAYEE, 0), _allReveal(3));
        uint40 endsAt = court.getCase(caseId).revealEnd;

        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.VotingNotOver.selector, endsAt));
        court.finalize(caseId);
    }

    function test_finalizeCanRunEarlyWhenEveryoneRevealed() public {
        _jury3();
        _castVotes(caseId, _votes3(PAYEE, PAYEE, PAYER), _allReveal(3));
        assertLt(block.timestamp, court.getCase(caseId).revealEnd);

        court.finalize(caseId);

        assertEq(uint8(court.getCase(caseId).phase), uint8(Arbitration.Phase.Resolved));
    }

    function test_finalizeWithoutAJuryReverts() public {
        (, uint256 fresh) = _openMedium();

        vm.expectRevert(
            abi.encodeWithSelector(IArbitrationEvents.WrongPhase.selector, fresh, uint8(Arbitration.Phase.Response))
        );
        court.finalize(fresh);
    }

    function test_unanimousPayeeWinPaysTheProviderAndTheMajority() public {
        _jury3();
        _decide(caseId, _votes3(PAYEE, PAYEE, PAYEE));

        assertEq(usdc.balanceOf(payee), 100 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
        assertEq(uint8(court.getCase(caseId).phase), uint8(Arbitration.Phase.Resolved));
        for (uint256 i = 0; i < 3; i++) {
            assertEq(court.rewards(address(usdc), panel[i]), FEE_PER_JUROR);
            assertEq(court.account(panel[i]).locked, 0);
            assertEq(court.account(panel[i]).active, 0);
            assertEq(court.account(panel[i]).staked, JUROR_DEPOSIT);
        }
        assertEq(usdc.balanceOf(address(court)), JUROR_DEPOSIT * 7 + 3 * FEE_PER_JUROR);
    }

    function test_unanimousPayerWinReturnsTheMoneyAndTheRequesterStillPaysTheCost() public {
        _jury3();
        uint256 payerBefore = usdc.balanceOf(payer);
        _decide(caseId, _votes3(PAYER, PAYER, PAYER));

        assertEq(usdc.balanceOf(payer) - payerBefore, 100 * USDC);
        assertEq(usdc.balanceOf(payee), 0);
        assertEq(_totalRewards(), 3 * FEE_PER_JUROR);
    }

    function test_majorityWithADissenterSlashesTheMinority() public {
        _jury3();
        uint256 treasuryBefore = usdc.balanceOf(address(treasury));

        _castVotes(caseId, _votes3(PAYEE, PAYEE, PAYER), _allReveal(3));
        vm.expectEmit(true, true, false, true);
        emit IArbitrationEvents.JurorSlashed(caseId, panel[2], STAKE * 2500 / 10_000);
        court.finalize(caseId);

        assertEq(court.rewards(address(usdc), panel[0]), 1_500_000);
        assertEq(court.rewards(address(usdc), panel[1]), 1_500_000);
        assertEq(court.rewards(address(usdc), panel[2]), 0);
        assertEq(court.account(panel[2]).staked, JUROR_DEPOSIT - STAKE * 2500 / 10_000);
        assertEq(usdc.balanceOf(address(treasury)) - treasuryBefore, STAKE * 2500 / 10_000);
        assertEq(usdc.balanceOf(payee), 100 * USDC);
    }

    function test_jurorWhoNeverRevealsLosesTheWholeCaseStake() public {
        _jury3();
        uint256 treasuryBefore = usdc.balanceOf(address(treasury));
        bool[] memory reveal = _allReveal(3);
        reveal[2] = false;
        _castVotes(caseId, _votes3(PAYEE, PAYEE, PAYEE), reveal);
        vm.warp(court.getCase(caseId).revealEnd + 1);
        court.finalize(caseId);

        assertEq(court.account(panel[2]).staked, JUROR_DEPOSIT - STAKE);
        assertEq(usdc.balanceOf(address(treasury)) - treasuryBefore, STAKE);
        assertEq(court.rewards(address(usdc), panel[2]), 0);
        assertEq(court.rewards(address(usdc), panel[0]), 1_500_000);
        assertEq(usdc.balanceOf(payee), 100 * USDC);
        assertEq(_totalLocked(), 0);
    }

    function test_jurorWhoNeverCommittedLosesTheWholeCaseStake() public {
        _jury3();
        _castVotes(caseId, _votes3(PAYER, PAYER, 0), _allReveal(3));
        vm.warp(court.getCase(caseId).revealEnd + 1);
        court.finalize(caseId);

        assertEq(court.account(panel[2]).staked, JUROR_DEPOSIT - STAKE);
        assertEq(_totalLocked(), 0);
    }

    function test_dustFromAnUnevenSplitGoesToAMajorityJuror() public {
        (orderId, caseId) = _openCase(payer, 500 * USDC, 5);
        panel = _drawJury(caseId, 7);
        uint8[] memory votes = new uint8[](5);
        votes[0] = PAYEE;
        votes[1] = PAYEE;
        votes[2] = PAYEE;
        votes[3] = PAYER;
        votes[4] = PAYER;
        _decide(caseId, votes);

        assertEq(_totalRewards(), 5 * FEE_PER_JUROR);
        assertEq(court.rewards(address(usdc), panel[0]), 1_666_668);
        assertEq(court.rewards(address(usdc), panel[1]), 1_666_666);
    }

    function test_tieSendsTheCaseToEmergencyAndSlashesOnlyTheAbsent() public {
        _jury3();
        _castVotes(caseId, _votes3(PAYEE, PAYER, 0), _allReveal(3));
        vm.warp(court.getCase(caseId).revealEnd + 1);

        vm.expectEmit(true, false, false, true);
        emit IArbitrationEvents.NeedsEmergencyResolution(caseId, 2);
        court.finalize(caseId);

        assertEq(uint8(court.getCase(caseId).phase), uint8(Arbitration.Phase.NeedsEmergency));
        assertEq(court.account(panel[0]).staked, JUROR_DEPOSIT);
        assertEq(court.account(panel[1]).staked, JUROR_DEPOSIT);
        assertEq(court.account(panel[2]).staked, JUROR_DEPOSIT - STAKE);
        assertEq(_totalRewards(), 0);
        assertEq(_totalLocked(), 0);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Disputed));
    }

    function test_tieDoesNotPunishJurorsWhoVotedInReputation() public {
        _jury3();
        _castVotes(caseId, _votes3(PAYEE, PAYER, 0), _allReveal(3));
        vm.warp(court.getCase(caseId).revealEnd + 1);
        court.finalize(caseId);

        assertEq(reputation.stats(panel[0], Role.Juror).disputesLost, 0);
        assertEq(reputation.stats(panel[0], Role.Juror).closed, 0);
        assertEq(reputation.stats(panel[2], Role.Juror).disputesLost, 1);
    }

    function test_noRevealsAtAllNeedsEmergencyAndSlashesEveryone() public {
        _jury3();
        vm.warp(court.getCase(caseId).revealEnd + 1);
        court.finalize(caseId);

        assertEq(uint8(court.getCase(caseId).phase), uint8(Arbitration.Phase.NeedsEmergency));
        for (uint256 i = 0; i < 3; i++) {
            assertEq(court.account(panel[i]).staked, JUROR_DEPOSIT - STAKE);
        }
        assertEq(_totalLocked(), 0);
    }

    function test_emergencyResolutionAfterATieRefundsTheClaimantFee() public {
        _jury3();
        vm.warp(court.getCase(caseId).revealEnd + 1);
        court.finalize(caseId);
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(admin);
        court.resolveEmergency(caseId, false, REASON);

        assertEq(usdc.balanceOf(payer) - payerBefore, 100 * USDC + 3 * FEE_PER_JUROR);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
        assertEq(uint8(court.getCase(caseId).phase), uint8(Arbitration.Phase.Resolved));
    }

    function test_emergencyRequiresTheRole() public {
        _jury3();
        vm.warp(court.getCase(caseId).revealEnd + 1);
        court.finalize(caseId);

        vm.prank(other);
        vm.expectRevert();
        court.resolveEmergency(caseId, true, REASON);
    }

    function test_emergencyOnlyWhenTheCaseNeedsIt() public {
        _jury3();

        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(IArbitrationEvents.WrongPhase.selector, caseId, uint8(Arbitration.Phase.Vote))
        );
        court.resolveEmergency(caseId, true, REASON);
    }

    function test_emergencyCannotRepeat() public {
        _jury3();
        vm.warp(court.getCase(caseId).revealEnd + 1);
        court.finalize(caseId);
        vm.startPrank(admin);
        court.resolveEmergency(caseId, true, REASON);
        vm.expectRevert(
            abi.encodeWithSelector(IArbitrationEvents.WrongPhase.selector, caseId, uint8(Arbitration.Phase.Resolved))
        );
        court.resolveEmergency(caseId, true, REASON);
        vm.stopPrank();
    }

    function test_finalizeCannotRepeat() public {
        _jury3();
        _decide(caseId, _votes3(PAYEE, PAYEE, PAYEE));

        vm.expectRevert(
            abi.encodeWithSelector(IArbitrationEvents.WrongPhase.selector, caseId, uint8(Arbitration.Phase.Resolved))
        );
        court.finalize(caseId);
    }

    function test_rewardsCanBeWithdrawn() public {
        _jury3();
        _decide(caseId, _votes3(PAYEE, PAYEE, PAYEE));
        uint256 before = usdc.balanceOf(panel[0]);

        vm.expectEmit(true, true, false, true);
        emit IArbitrationEvents.RewardWithdrawn(address(usdc), panel[0], FEE_PER_JUROR);
        vm.prank(panel[0]);
        court.withdrawReward(address(usdc));

        assertEq(usdc.balanceOf(panel[0]) - before, FEE_PER_JUROR);
        assertEq(court.rewards(address(usdc), panel[0]), 0);
    }

    function test_jurorsRecordTheirOutcomeInReputation() public {
        _jury3();
        _decide(caseId, _votes3(PAYEE, PAYEE, PAYER));

        Stats memory winner = reputation.stats(panel[0], Role.Juror);
        Stats memory loser = reputation.stats(panel[2], Role.Juror);
        assertEq(winner.closed, 1);
        assertEq(winner.closedClean, 1);
        assertEq(loser.closed, 1);
        assertEq(loser.disputesLost, 1);
    }

    function test_theRequesterAndProviderAlsoRecordTheDispute() public {
        _jury3();
        _decide(caseId, _votes3(PAYEE, PAYEE, PAYEE));

        assertEq(reputation.stats(payer, Role.Requester).disputesLost, 1);
        assertEq(reputation.stats(payee, Role.Provider).disputes, 1);
        assertEq(reputation.stats(payee, Role.Provider).disputesLost, 0);
    }

    function test_jurorsCanServeAgainOnceTheirStakeIsFree() public {
        _jury3();
        _decide(caseId, _votes3(PAYEE, PAYEE, PAYEE));

        (, uint256 next) = _openMedium();
        _respond(next);
        for (uint256 i = 0; i < 3; i++) {
            assertTrue(court.isEligible(panel[i], next));
        }
    }

    function test_votingThroughTheForwarderAttributesTheSigner() public {
        _jury3();
        bytes32 commitment = court.voteHash(caseId, jurors[0], PAYEE, bytes32(uint256(5)));

        _forward(jurorKey, jurors[0], address(court), abi.encodeCall(Arbitration.commitVote, (caseId, commitment)));
        vm.warp(court.getCase(caseId).commitEnd + 1);
        _forward(
            jurorKey,
            jurors[0],
            address(court),
            abi.encodeCall(Arbitration.revealVote, (caseId, PAYEE, bytes32(uint256(5))))
        );

        assertEq(court.jurorCase(caseId, jurors[0]).vote, PAYEE);
    }

    function test_moneyIsConservedAcrossAWholeCase() public {
        uint256 before = _totalMoney(jurors);
        _jury3();
        _decide(caseId, _votes3(PAYEE, PAYER, PAYEE));

        assertEq(_totalMoney(jurors), before + 3 * FEE_PER_JUROR);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testFuzz_anyVotePatternKeepsTheAccountsConsistent(uint8 a, uint8 b, uint8 c, uint8 revealMask) public {
        _jury3();
        uint8[] memory votes = _votes3(a % 3, b % 3, c % 3);
        bool[] memory reveal = new bool[](3);
        for (uint256 i = 0; i < 3; i++) {
            reveal[i] = (revealMask >> i) & 1 == 1;
        }
        _castVotes(caseId, votes, reveal);
        vm.warp(court.getCase(caseId).revealEnd + 1);
        court.finalize(caseId);

        if (uint8(court.getCase(caseId).phase) == uint8(Arbitration.Phase.NeedsEmergency)) {
            vm.prank(admin);
            court.resolveEmergency(caseId, a % 2 == 0, REASON);
        }

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
        assertEq(_totalLocked(), 0);
        for (uint256 i = 0; i < jurors.length; i++) {
            assertEq(court.account(jurors[i]).active, 0);
        }
        assertEq(usdc.balanceOf(address(court)), _totalStaked() + _totalRewards());
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }
}
