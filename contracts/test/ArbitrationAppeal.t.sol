// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ArbitrationBase} from "./ArbitrationBase.sol";
import {Arbitration} from "../src/Arbitration.sol";
import {IArbitrationEvents} from "../src/interfaces/IArbitrationEvents.sol";
import {Role, Stats} from "../src/interfaces/IReputation.sol";
import {OrderStatus, Order} from "../src/libraries/OrderTypes.sol";

contract ArbitrationAppealTest is ArbitrationBase {
    uint256 internal orderId;
    uint256 internal caseId;
    address[] internal firstPanel;

    function setUp() public override {
        super.setUp();
        for (uint256 i = 7; i < 13; i++) {
            address juror = makeAddr(string.concat("juror", vm.toString(i)));
            jurors.push(juror);
            _registerJuror(juror, JUROR_DEPOSIT);
        }
    }

    function _firstRound(uint8 a, uint8 b, uint8 c) internal {
        (orderId, caseId) = _openMedium();
        firstPanel = _drawJury(caseId, 3);
        _castVotes(caseId, _votes3(a, b, c), _allReveal(3));
        court.finalize(caseId);
    }

    function _appealAs(address who) internal {
        usdc.mint(who, 7 * USDC);
        vm.startPrank(who);
        usdc.approve(address(court), type(uint256).max);
        court.appeal(caseId);
        vm.stopPrank();
    }

    function _secondPanelCandidates() internal view returns (address[] memory who) {
        who = new address[](9);
        for (uint256 i = 0; i < 9; i++) {
            who[i] = jurors[3 + i];
        }
    }

    function _secondRoundJury() internal returns (address[] memory panel) {
        _runSeedRound(caseId, _secondPanelCandidates());
        address[] memory all = court.jurorsOf(caseId);
        uint256 start = court.getCase(caseId).roundStart;
        panel = new address[](all.length - start);
        for (uint256 i = 0; i < panel.length; i++) {
            panel[i] = all[start + i];
        }
    }

    function _castRound(address[] memory panel, uint8[] memory votes, bool[] memory reveal) internal {
        for (uint256 i = 0; i < panel.length; i++) {
            if (votes[i] == 0) continue;
            bytes32 commitment = court.voteHash(caseId, panel[i], votes[i], bytes32(uint256(500 + i)));
            vm.prank(panel[i]);
            court.commitVote(caseId, commitment);
        }
        vm.warp(court.getCase(caseId).commitEnd + 1);
        for (uint256 i = 0; i < panel.length; i++) {
            if (votes[i] == 0 || !reveal[i]) continue;
            vm.prank(panel[i]);
            court.revealVote(caseId, votes[i], bytes32(uint256(500 + i)));
        }
    }

    function _votes7(uint8 payeeVotes, uint8 payerVotes) internal pure returns (uint8[] memory votes) {
        votes = new uint8[](7);
        for (uint256 i = 0; i < 7; i++) {
            votes[i] = i < payeeVotes ? PAYEE : (i < payeeVotes + payerVotes ? PAYER : 0);
        }
    }

    function test_theFirstVerdictOpensTheAppealWindowWithoutMovingTheMoney() public {
        (orderId, caseId) = _openMedium();
        firstPanel = _drawJury(caseId, 3);
        _castVotes(caseId, _votes3(PAYEE, PAYEE, PAYEE), _allReveal(3));

        vm.expectEmit(true, false, false, true);
        emit IArbitrationEvents.VerdictReached(caseId, true, uint40(block.timestamp + 24 hours));
        court.finalize(caseId);

        Arbitration.Case memory c = court.getCase(caseId);
        assertEq(uint8(c.phase), uint8(Arbitration.Phase.Decided));
        assertTrue(c.verdictPayee);
        assertTrue(c.round1Paid);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Disputed));
        assertEq(usdc.balanceOf(payee), 0);
        assertEq(usdc.balanceOf(address(escrow)), 100 * USDC);
    }

    function test_theFirstRoundJurorsAreSettledAtTheVerdict() public {
        _firstRound(PAYEE, PAYEE, PAYER);

        assertEq(court.rewards(address(usdc), firstPanel[0]), 1_500_000);
        assertEq(court.rewards(address(usdc), firstPanel[1]), 1_500_000);
        for (uint256 i = 0; i < 3; i++) {
            assertEq(court.account(firstPanel[i]).locked, 0);
            assertEq(court.account(firstPanel[i]).active, 0);
        }
        assertEq(court.account(firstPanel[2]).staked, JUROR_DEPOSIT - STAKE * 2500 / 10_000);
    }

    function test_withoutAnAppealTheVerdictIsExecutedAfterTheWindow() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        uint40 appealEnd = court.getCase(caseId).appealEnd;

        vm.warp(appealEnd);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.WindowOpen.selector, appealEnd));
        court.execute(caseId);

        vm.warp(appealEnd + 1);
        court.execute(caseId);

        assertEq(usdc.balanceOf(payee), 100 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
        assertEq(uint8(court.getCase(caseId).phase), uint8(Arbitration.Phase.Resolved));
    }

    function test_executingTwiceReverts() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        _execute(caseId);

        vm.expectRevert(
            abi.encodeWithSelector(IArbitrationEvents.WrongPhase.selector, caseId, uint8(Arbitration.Phase.Resolved))
        );
        court.execute(caseId);
    }

    function test_executingBeforeTheVerdictReverts() public {
        (, caseId) = _openMedium();
        vm.expectRevert(
            abi.encodeWithSelector(IArbitrationEvents.WrongPhase.selector, caseId, uint8(Arbitration.Phase.Response))
        );
        court.execute(caseId);
    }

    function test_onlyTheLosingPartyCanAppeal() public {
        _firstRound(PAYEE, PAYEE, PAYEE);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotLoser.selector, payee));
        court.appeal(caseId);

        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotLoser.selector, other));
        court.appeal(caseId);
    }

    function test_theProviderCanAppealWhenItLoses() public {
        _firstRound(PAYER, PAYER, PAYER);
        _appealAs(payee);

        assertEq(court.getCase(caseId).appellant, payee);
    }

    function test_appealsAreClosedAfterTheWindow() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        uint40 appealEnd = court.getCase(caseId).appealEnd;
        vm.warp(appealEnd + 1);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.WindowClosed.selector, appealEnd));
        court.appeal(caseId);
    }

    function test_anAppealAtTheEndOfTheWindowStillWorks() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        vm.warp(court.getCase(caseId).appealEnd);
        _appealAs(payer);

        assertTrue(court.getCase(caseId).appealed);
    }

    function test_onlyOneAppealIsAllowed() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        _appealAs(payer);

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(IArbitrationEvents.WrongPhase.selector, caseId, uint8(Arbitration.Phase.Seed))
        );
        court.appeal(caseId);
    }

    function test_anAppealChargesTheFeeAndOpensALargerJury() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        usdc.mint(payer, 7 * USDC);
        uint256 payerBefore = usdc.balanceOf(payer);
        vm.startPrank(payer);
        usdc.approve(address(court), type(uint256).max);

        vm.expectEmit(true, true, false, true);
        emit IArbitrationEvents.Appealed(caseId, payer, uint128(7 * USDC), 7);
        court.appeal(caseId);
        vm.stopPrank();

        Arbitration.Case memory c = court.getCase(caseId);
        assertEq(payerBefore - usdc.balanceOf(payer), 7 * USDC);
        assertEq(c.appealFee, 7 * USDC);
        assertEq(c.jurors, 7);
        assertEq(uint8(c.phase), uint8(Arbitration.Phase.Seed));
        assertEq(c.round, 1);
        assertEq(c.roundBase, 1);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Disputed));
    }

    function test_anAppealWithoutAllowanceReverts() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        vm.prank(payer);
        vm.expectRevert();
        court.appeal(caseId);
    }

    function test_anAppealCanBePaidWithAPermit() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        usdc.mint(payer, 7 * USDC);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                payer,
                address(court),
                7 * USDC,
                usdc.nonces(payer),
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(payerKey, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash)));

        vm.prank(payer);
        court.appealWithPermit(caseId, deadline, v, r, s);

        assertTrue(court.getCase(caseId).appealed);
    }

    function test_theFirstRoundJurorsCannotSitOnTheAppeal() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        _appealAs(payer);

        for (uint256 i = 0; i < 3; i++) {
            assertFalse(court.isEligible(firstPanel[i], caseId));
            assertTrue(court.isRecused(caseId, firstPanel[i]));
        }
        assertTrue(court.isEligible(jurors[3], caseId));
    }

    function test_theSecondRoundDrawsSevenJurors() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        _appealAs(payer);
        address[] memory panel = _secondRoundJury();

        assertEq(panel.length, 7);
        assertEq(court.jurorsOf(caseId).length, 10);
        assertEq(uint8(court.getCase(caseId).phase), uint8(Arbitration.Phase.Vote));
    }

    function test_theSecondRoundCanOverturnTheVerdict() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        _appealAs(payer);
        address[] memory panel = _secondRoundJury();
        _castRound(panel, _votes7(2, 5), _allReveal(7));
        uint256 payerBefore = usdc.balanceOf(payer);

        court.finalize(caseId);

        assertEq(uint8(court.getCase(caseId).phase), uint8(Arbitration.Phase.Resolved));
        assertEq(usdc.balanceOf(payer) - payerBefore, 100 * USDC);
        assertEq(usdc.balanceOf(payee), 0);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
    }

    function test_theSecondRoundCanConfirmTheVerdict() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        _appealAs(payer);
        address[] memory panel = _secondRoundJury();
        _castRound(panel, _votes7(6, 1), _allReveal(7));
        court.finalize(caseId);

        assertEq(usdc.balanceOf(payee), 100 * USDC);
    }

    function test_theAppealFeePaysTheSecondRoundMajority() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        _appealAs(payer);
        address[] memory panel = _secondRoundJury();
        _castRound(panel, _votes7(2, 5), _allReveal(7));
        court.finalize(caseId);

        uint256 total;
        for (uint256 i = 0; i < 7; i++) {
            uint256 reward = court.rewards(address(usdc), panel[i]);
            if (i < 2) assertEq(reward, 0);
            total += reward;
        }
        assertEq(total, 7 * USDC);
        assertEq(court.rewards(address(usdc), panel[2]), 1_400_000);
    }

    function test_theSecondRoundMinorityIsSlashedAndEveryStakeIsFreed() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        _appealAs(payer);
        address[] memory panel = _secondRoundJury();
        _castRound(panel, _votes7(2, 5), _allReveal(7));
        court.finalize(caseId);

        assertEq(court.account(panel[0]).staked, JUROR_DEPOSIT - STAKE * 2500 / 10_000);
        for (uint256 i = 0; i < jurors.length; i++) {
            assertEq(court.account(jurors[i]).locked, 0);
            assertEq(court.account(jurors[i]).active, 0);
        }
    }

    function test_theFirstRoundRewardsSurviveAnOverturn() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        _appealAs(payer);
        address[] memory panel = _secondRoundJury();
        _castRound(panel, _votes7(0, 7), _allReveal(7));
        court.finalize(caseId);

        for (uint256 i = 0; i < 3; i++) {
            assertEq(court.rewards(address(usdc), firstPanel[i]), FEE_PER_JUROR);
        }
    }

    function test_aTieInTheSecondRoundNeedsAnEmergencyAndTheAppellantIsRefunded() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        _appealAs(payer);
        address[] memory panel = _secondRoundJury();
        _castRound(panel, _votes7(3, 3), _allReveal(7));
        vm.warp(court.getCase(caseId).revealEnd + 1);
        court.finalize(caseId);
        assertEq(uint8(court.getCase(caseId).phase), uint8(Arbitration.Phase.NeedsEmergency));
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(admin);
        court.resolveEmergency(caseId, false, REASON);

        assertEq(usdc.balanceOf(payer) - payerBefore, 100 * USDC + 7 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
    }

    function test_theClaimantFeeIsNotRefundedOnceTheFirstRoundWasPaid() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        _appealAs(payer);
        address[] memory panel = _secondRoundJury();
        _castRound(panel, _votes7(0, 0), _allReveal(7));
        vm.warp(court.getCase(caseId).revealEnd + 1);
        court.finalize(caseId);
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(admin);
        court.resolveEmergency(caseId, false, REASON);

        assertEq(usdc.balanceOf(payer) - payerBefore, 100 * USDC + 7 * USDC);
    }

    function test_replacementRoundsInTheAppealStartFromTheAppealRound() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        _appealAs(payer);

        for (uint256 i = 0; i < 3; i++) {
            vm.warp(court.getCase(caseId).revealEnd + 1);
            court.draw(caseId);
            assertEq(uint8(court.getCase(caseId).phase), uint8(Arbitration.Phase.Seed));
        }
        vm.warp(court.getCase(caseId).revealEnd + 1);
        court.draw(caseId);

        assertEq(uint8(court.getCase(caseId).phase), uint8(Arbitration.Phase.NeedsEmergency));
    }

    function test_theWholeAppealedCaseConservesTheMoney() public {
        uint256 before = _totalMoney(jurors);
        _firstRound(PAYEE, PAYEE, PAYER);
        uint256 afterOpen = _totalMoney(jurors);
        _appealAs(payer);
        address[] memory panel = _secondRoundJury();
        _castRound(panel, _votes7(1, 6), _allReveal(7));
        court.finalize(caseId);

        assertEq(_totalMoney(jurors), afterOpen + 7 * USDC);
        assertEq(afterOpen, before + 3 * USDC + 100 * USDC * 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_theSecondRoundVotesFollowTheSameCommitRevealRules() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        _appealAs(payer);
        address[] memory panel = _secondRoundJury();

        vm.prank(firstPanel[0]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotSelected.selector, firstPanel[0]));
        court.commitVote(caseId, bytes32(uint256(1)));

        vm.prank(panel[0]);
        court.commitVote(caseId, bytes32(uint256(1)));
        vm.prank(panel[0]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.AlreadyCommitted.selector, panel[0]));
        court.commitVote(caseId, bytes32(uint256(2)));
    }

    function test_aFirstRoundJurorWhoNeverVotedCannotVoteInTheAppeal() public {
        (orderId, caseId) = _openMedium();
        firstPanel = _drawJury(caseId, 3);
        _castVotes(caseId, _votes3(PAYEE, PAYEE, 0), _allReveal(3));
        vm.warp(court.getCase(caseId).revealEnd + 1);
        court.finalize(caseId);
        _appealAs(payer);
        _secondRoundJury();

        vm.prank(firstPanel[2]);
        vm.expectRevert(abi.encodeWithSelector(IArbitrationEvents.NotSelected.selector, firstPanel[2]));
        court.commitVote(caseId, bytes32(uint256(7)));
    }

    function test_executeIsNotAvailableOnceAnAppealStarted() public {
        _firstRound(PAYEE, PAYEE, PAYEE);
        _appealAs(payer);
        vm.warp(block.timestamp + 10 days);

        vm.expectRevert(
            abi.encodeWithSelector(IArbitrationEvents.WrongPhase.selector, caseId, uint8(Arbitration.Phase.Seed))
        );
        court.execute(caseId);
    }

    function test_aProviderClaimantThatLosesCanAppeal() public {
        (orderId, caseId) = _openCase(payee, 100 * USDC, 3);
        firstPanel = _drawJury(caseId, 3);
        _castVotes(caseId, _votes3(PAYER, PAYER, PAYER), _allReveal(3));
        court.finalize(caseId);

        _appealAs(payee);
        address[] memory panel = _secondRoundJury();
        _castRound(panel, _votes7(6, 1), _allReveal(7));
        court.finalize(caseId);

        assertEq(usdc.balanceOf(payee), 100 * USDC);
        assertEq(court.getCase(caseId).appellant, payee);
    }
}
