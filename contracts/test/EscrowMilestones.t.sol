// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MilestoneBase} from "./MilestoneBase.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {IEscrowEvents} from "../src/interfaces/IEscrowEvents.sol";
import {Role, Stats} from "../src/interfaces/IReputation.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {
    Order,
    OrderStatus,
    PaymentMode,
    CreateParams,
    DepositAuth,
    Agreement,
    MilestoneTerms,
    MilestoneRelease,
    MilestoneStatus,
    Milestone,
    MilestonePlan,
    Release
} from "../src/libraries/OrderTypes.sol";

contract EscrowMilestonesTest is MilestoneBase {
    function _signedAgreement(uint256 orderId, MilestoneTerms memory terms, Agreement memory a)
        internal
        view
        returns (bytes memory payerSig, bytes memory payeeSig)
    {
        bytes32 structHash = _agreementHash(a);
        payerSig = _sign(payerKey, structHash);
        payeeSig = _sign(payeeKey, structHash);
        orderId;
        terms;
    }

    function _expectAgreeMilestonesRevert(
        uint256 orderId,
        MilestoneTerms memory terms,
        Agreement memory a,
        bytes memory reason
    ) internal {
        (bytes memory payerSig, bytes memory payeeSig) = _signedAgreement(orderId, terms, a);
        vm.expectRevert(reason);
        vm.prank(relayer);
        escrow.agreeWithMilestones(a, terms, payerSig, payeeSig);
    }

    function test_plainAgreementIsAllowedForABigPrice() public {
        uint256 orderId = _createUsdc(5000 * USDC);
        _agree(orderId, 5000 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Agreed));
    }

    function test_plainAgreementIsAllowedForALongDeadline() public {
        CreateParams memory params = _params(address(usdc), 50 * USDC);
        params.deadline = uint40(block.timestamp + 120 days);
        DepositAuth memory auth = _permitAuth(50 * USDC);
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(params, auth);
        _agree(orderId, 50 * USDC);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Agreed));
    }

    function test_milestoneAgreementStoresThePlan() public {
        uint256 orderId = _createUsdc(300 * USDC);
        MilestoneTerms memory terms =
            _terms(_amounts(uint128(100 * USDC), uint128(100 * USDC), uint128(100 * USDC)), false);
        Agreement memory a = _milestoneAgreement(orderId, terms);
        (bytes memory payerSig, bytes memory payeeSig) = _signedAgreement(orderId, terms, a);

        vm.expectEmit(true, false, false, true);
        emit IEscrowEvents.MilestonesAgreed(orderId, 3, false);
        vm.prank(relayer);
        escrow.agreeWithMilestones(a, terms, payerSig, payeeSig);

        Order memory order = _order(orderId);
        assertEq(uint8(order.status), uint8(OrderStatus.Agreed));
        assertTrue(order.hasMilestones);
        assertEq(order.price, 300 * USDC);
        assertEq(order.deposited, 300 * USDC);
        MilestonePlan memory plan = _plan(orderId);
        assertEq(plan.count, 3);
        assertEq(plan.next, 0);
        assertFalse(plan.firstIsAdvance);
        Milestone[] memory list = _list(orderId);
        assertEq(list.length, 3);
        assertEq(list[1].amount, 100 * USDC);
        assertEq(uint8(list[1].status), uint8(MilestoneStatus.Pending));
    }

    function test_milestonesAreOptionalForSmallOrders() public {
        uint256 orderId = _newMilestoneOrder(_amounts2(uint128(30 * USDC), uint128(20 * USDC)), false);
        assertTrue(_order(orderId).hasMilestones);
    }

    function test_milestoneAgreementRefundsTheDepositExcess() public {
        uint256 orderId = _createUsdc(400 * USDC);
        uint256 before = usdc.balanceOf(payer);
        _agreeMilestones(
            orderId, _terms(_amounts(uint128(100 * USDC), uint128(100 * USDC), uint128(100 * USDC)), false)
        );

        assertEq(usdc.balanceOf(payer) - before, 100 * USDC);
        assertEq(_order(orderId).deposited, 300 * USDC);
    }

    function test_atLeastTwoMilestonesAreRequired() public {
        uint256 orderId = _createUsdc(200 * USDC);
        uint128[] memory single = new uint128[](1);
        single[0] = uint128(200 * USDC);
        MilestoneTerms memory terms = _terms(single, false);
        _expectAgreeMilestonesRevert(
            orderId,
            terms,
            _milestoneAgreement(orderId, terms),
            abi.encodeWithSelector(IEscrowEvents.InvalidMilestones.selector)
        );
    }

    function test_atMostTwentyMilestonesAreAllowed() public {
        uint256 orderId = _createUsdc(210 * USDC);
        uint128[] memory many = new uint128[](21);
        for (uint256 i = 0; i < 21; i++) {
            many[i] = uint128(10 * USDC);
        }
        MilestoneTerms memory terms = _terms(many, false);
        _expectAgreeMilestonesRevert(
            orderId,
            terms,
            _milestoneAgreement(orderId, terms),
            abi.encodeWithSelector(IEscrowEvents.InvalidMilestones.selector)
        );
    }

    function test_twentyMilestonesAreAccepted() public {
        uint128[] memory many = new uint128[](20);
        for (uint256 i = 0; i < 20; i++) {
            many[i] = uint128(10 * USDC);
        }
        uint256 orderId = _newMilestoneOrder(many, false);
        assertEq(_plan(orderId).count, 20);
    }

    function test_zeroAmountMilestonesAreRejected() public {
        uint256 orderId = _createUsdc(200 * USDC);
        MilestoneTerms memory terms = _terms(_amounts(uint128(100 * USDC), 0, uint128(100 * USDC)), false);
        _expectAgreeMilestonesRevert(
            orderId,
            terms,
            _milestoneAgreement(orderId, terms),
            abi.encodeWithSelector(IEscrowEvents.InvalidMilestones.selector)
        );
    }

    function test_milestonesMustAddUpToThePrice() public {
        uint256 orderId = _createUsdc(300 * USDC);
        MilestoneTerms memory terms = _terms(_amounts2(uint128(100 * USDC), uint128(100 * USDC)), false);
        Agreement memory a = _milestoneAgreement(orderId, terms);
        a.price = uint128(250 * USDC);
        _expectAgreeMilestonesRevert(
            orderId, terms, a, abi.encodeWithSelector(IEscrowEvents.InvalidMilestones.selector)
        );
    }

    function test_criteriaMustMatchTheAmounts() public {
        uint256 orderId = _createUsdc(200 * USDC);
        MilestoneTerms memory terms = _terms(_amounts2(uint128(100 * USDC), uint128(100 * USDC)), false);
        bytes32[] memory short = new bytes32[](1);
        short[0] = terms.criteria[0];
        terms.criteria = short;
        _expectAgreeMilestonesRevert(
            orderId,
            terms,
            _milestoneAgreement(orderId, terms),
            abi.encodeWithSelector(IEscrowEvents.InvalidMilestones.selector)
        );
    }

    function test_theSignedTermsHashMustCommitToThePlan() public {
        uint256 orderId = _createUsdc(200 * USDC);
        MilestoneTerms memory terms = _terms(_amounts2(uint128(100 * USDC), uint128(100 * USDC)), false);
        Agreement memory a = _milestoneAgreement(orderId, terms);
        a.termsHash = keccak256("something else");
        _expectAgreeMilestonesRevert(
            orderId, terms, a, abi.encodeWithSelector(IEscrowEvents.AgreementMismatch.selector)
        );
    }

    function test_changingTheAmountsBreaksTheSignedHash() public {
        uint256 orderId = _createUsdc(200 * USDC);
        MilestoneTerms memory terms = _terms(_amounts2(uint128(100 * USDC), uint128(100 * USDC)), false);
        Agreement memory a = _milestoneAgreement(orderId, terms);
        terms.amounts = _amounts2(uint128(150 * USDC), uint128(50 * USDC));
        _expectAgreeMilestonesRevert(
            orderId, terms, a, abi.encodeWithSelector(IEscrowEvents.AgreementMismatch.selector)
        );
    }

    function test_cashOrdersCannotUseMilestones() public {
        CreateParams memory params = _params(address(usdc), 200 * USDC);
        params.mode = PaymentMode.Cash;
        DepositAuth memory auth = _permitAuth(12 * USDC);
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(params, auth);
        MilestoneTerms memory terms = _terms(_amounts2(uint128(100 * USDC), uint128(100 * USDC)), false);
        _expectAgreeMilestonesRevert(
            orderId,
            terms,
            _milestoneAgreement(orderId, terms),
            abi.encodeWithSelector(IEscrowEvents.UnsupportedForMode.selector)
        );
    }

    function test_milestoneAgreementOnAnUnknownOrderReverts() public {
        MilestoneTerms memory terms = _terms(_amounts2(uint128(100 * USDC), uint128(100 * USDC)), false);
        _expectAgreeMilestonesRevert(
            77, terms, _milestoneAgreement(77, terms), abi.encodeWithSelector(IEscrowEvents.UnknownOrder.selector, 77)
        );
    }

    function test_milestoneAgreementCannotBeRepeated() public {
        uint256 orderId = _standard();
        MilestoneTerms memory terms =
            _terms(_amounts(uint128(100 * USDC), uint128(100 * USDC), uint128(100 * USDC)), false);
        _expectAgreeMilestonesRevert(
            orderId,
            terms,
            _milestoneAgreement(orderId, terms),
            abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Agreed)
        );
    }

    function test_plainDeliverAndReleaseAreBlockedOnMilestonedOrders() public {
        uint256 orderId = _standard();

        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.UseMilestones.selector);
        escrow.deliver(orderId, EVIDENCE);

        (Release memory r, bytes memory sig) = _release(orderId, 300 * USDC, 5);
        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.UseMilestones.selector);
        escrow.release(r, sig);

        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Agreed));
        escrow.autoRelease(orderId);
    }

    function test_deliveringMarksTheMilestone() public {
        uint256 orderId = _standard();

        vm.expectEmit(true, false, false, true);
        emit IEscrowEvents.MilestoneDelivered(orderId, 0, keccak256(abi.encode("evidence", uint8(0))));
        _deliverAt(orderId, 0);

        Milestone memory first = _list(orderId)[0];
        assertEq(uint8(first.status), uint8(MilestoneStatus.Delivered));
        assertEq(first.deliveredAt, block.timestamp);
        assertTrue(_plan(orderId).started);
    }

    function test_deliveryFollowsTheOrderOfTheMilestones() public {
        uint256 orderId = _standard();

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.WrongMilestone.selector, 1, 0));
        escrow.deliverMilestone(orderId, 1, EVIDENCE);
    }

    function test_onlyTheProviderDelivers() public {
        uint256 orderId = _standard();

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotPayee.selector, payer));
        escrow.deliverMilestone(orderId, 0, EVIDENCE);
    }

    function test_deliveryNeedsEvidence() public {
        uint256 orderId = _standard();

        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.EvidenceRequired.selector);
        escrow.deliverMilestone(orderId, 0, bytes32(0));
    }

    function test_deliveringTwiceReverts() public {
        uint256 orderId = _standard();
        _deliverAt(orderId, 0);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.MilestoneNotPending.selector, 0));
        escrow.deliverMilestone(orderId, 0, EVIDENCE);
    }

    function test_deliveryOnAPlainOrderReverts() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);

        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.InvalidMilestones.selector);
        escrow.deliverMilestone(orderId, 0, EVIDENCE);
    }

    function test_releasePaysOneMilestoneAndKeepsTheOrderOpen() public {
        uint256 orderId = _standard();
        _deliverAt(orderId, 0);

        vm.expectEmit(true, false, false, true);
        emit IEscrowEvents.MilestonePaid(orderId, 0, uint128(100 * USDC), 0, 0, 5, false);
        _payMilestone(orderId, 0, 100 * USDC, 5);

        Order memory order = _order(orderId);
        assertEq(usdc.balanceOf(payee), 100 * USDC);
        assertEq(order.deposited, 200 * USDC);
        assertEq(uint8(order.status), uint8(OrderStatus.Agreed));
        assertEq(_plan(orderId).next, 1);
        assertEq(uint8(_list(orderId)[0].status), uint8(MilestoneStatus.Paid));
    }

    function test_releaseWorksWithoutPriorDelivery() public {
        uint256 orderId = _standard();
        _payMilestone(orderId, 0, 100 * USDC, 4);

        assertEq(usdc.balanceOf(payee), 100 * USDC);
    }

    function test_partialReleaseReturnsTheRestOfTheMilestoneToThePayer() public {
        uint256 orderId = _standard();
        uint256 payerBefore = usdc.balanceOf(payer);
        _payMilestone(orderId, 0, 60 * USDC, 3);

        assertEq(usdc.balanceOf(payee), 60 * USDC);
        assertEq(usdc.balanceOf(payer) - payerBefore, 40 * USDC);
        assertEq(_order(orderId).deposited, 200 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 200 * USDC);
    }

    function test_releaseChargesTheProtocolFeePerMilestone() public {
        _setParameter(ParameterKeys.FEE_BPS, 200);
        uint256 orderId = _standard();
        _payMilestone(orderId, 0, 100 * USDC, 5);

        assertEq(usdc.balanceOf(address(treasury)), 2 * USDC);
        assertEq(usdc.balanceOf(payee), 98 * USDC);
    }

    function test_theLastMilestoneClosesTheOrder() public {
        uint256 orderId = _standard();
        _payMilestone(orderId, 0, 100 * USDC, 5);
        _payMilestone(orderId, 1, 100 * USDC, 5);

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.OrderSettled(orderId, payee, uint128(300 * USDC), 0, 0, 5, false);
        _payMilestone(orderId, 2, 100 * USDC, 5);

        Order memory order = _order(orderId);
        assertEq(uint8(order.status), uint8(OrderStatus.Settled));
        assertTrue(order.paidOut);
        assertEq(order.settledAt, block.timestamp);
        assertEq(order.deposited, 0);
        assertEq(usdc.balanceOf(payee), 300 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_theClosingRatingIsTheAverageOfTheRatedMilestones() public {
        uint256 orderId = _standard();
        _payMilestone(orderId, 0, 100 * USDC, 5);
        _payMilestone(orderId, 1, 100 * USDC, 3);
        _payMilestone(orderId, 2, 100 * USDC, 4);

        Stats memory provider = reputation.stats(payee, Role.Provider);
        assertEq(provider.closed, 1);
        assertEq(provider.ratingSum, 4);
        assertEq(provider.ratingCount, 1);
    }

    function test_onlyOneReputationCloseIsRecordedForTheWholeOrder() public {
        uint256 orderId = _standard();
        _payMilestone(orderId, 0, 100 * USDC, 5);
        assertEq(reputation.stats(payee, Role.Provider).closed, 0);
        _payMilestone(orderId, 1, 100 * USDC, 5);
        _payMilestone(orderId, 2, 100 * USDC, 5);

        assertEq(reputation.stats(payee, Role.Provider).closed, 1);
    }

    function test_releaseMustFollowTheOrder() public {
        uint256 orderId = _standard();
        (MilestoneRelease memory release, bytes memory sig) = _msRelease(orderId, 1, 100 * USDC, 5);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.WrongMilestone.selector, 1, 0));
        escrow.releaseMilestone(release, sig);
    }

    function test_aPaidMilestoneCannotBePaidTwice() public {
        uint256 orderId = _standard();
        (MilestoneRelease memory release, bytes memory sig) = _msRelease(orderId, 0, 100 * USDC, 5);
        vm.prank(payee);
        escrow.releaseMilestone(release, sig);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.WrongMilestone.selector, 0, 1));
        escrow.releaseMilestone(release, sig);
    }

    function test_releaseRequiresThePayersSignature() public {
        uint256 orderId = _standard();
        (MilestoneRelease memory release,) = _msRelease(orderId, 0, 100 * USDC, 5);
        bytes memory forged = _sign(otherKey, EscrowHashesHelper.hash(release));

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidSignature.selector, payer));
        escrow.releaseMilestone(release, forged);
    }

    function test_alteringTheAmountAfterSigningInvalidatesTheRelease() public {
        uint256 orderId = _standard();
        (MilestoneRelease memory release, bytes memory sig) = _msRelease(orderId, 0, 50 * USDC, 5);
        release.amount = uint128(100 * USDC);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidSignature.selector, payer));
        escrow.releaseMilestone(release, sig);
    }

    function test_releaseExpires() public {
        uint256 orderId = _standard();
        (MilestoneRelease memory release, bytes memory sig) = _msRelease(orderId, 0, 100 * USDC, 5);
        vm.warp(release.expiry + 1);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.SignatureExpired.selector, release.expiry));
        escrow.releaseMilestone(release, sig);
    }

    function test_releaseRejectsInvalidRatingsAndOversizedAmounts() public {
        uint256 orderId = _standard();
        (MilestoneRelease memory release, bytes memory sig) = _msRelease(orderId, 0, 100 * USDC, 0);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidRating.selector, 0));
        escrow.releaseMilestone(release, sig);

        (release, sig) = _msRelease(orderId, 0, 101 * USDC, 5);
        vm.prank(payee);
        vm.expectRevert(
            abi.encodeWithSelector(IEscrowEvents.ReleaseAmountExceedsPrice.selector, 101 * USDC, 100 * USDC)
        );
        escrow.releaseMilestone(release, sig);
    }

    function test_onlyTheProviderCanCollect() public {
        uint256 orderId = _standard();
        (MilestoneRelease memory release, bytes memory sig) = _msRelease(orderId, 0, 100 * USDC, 5);

        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotPayee.selector, other));
        escrow.releaseMilestone(release, sig);
    }

    function test_autoReleaseNeedsADeliveredMilestone() public {
        uint256 orderId = _standard();

        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.MilestoneNotDelivered.selector, 0));
        escrow.autoReleaseMilestone(orderId);
    }

    function test_autoReleaseWaitsSeventyTwoHours() public {
        uint256 orderId = _standard();
        _deliverAt(orderId, 0);
        uint40 readyAt = _list(orderId)[0].deliveredAt + 72 hours;

        vm.warp(readyAt - 1);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.AutoReleaseNotReady.selector, readyAt));
        escrow.autoReleaseMilestone(orderId);

        vm.warp(readyAt);
        escrow.autoReleaseMilestone(orderId);
        assertEq(usdc.balanceOf(payee), 100 * USDC);
        assertEq(_plan(orderId).next, 1);
    }

    function test_autoReleaseIsNeutralInReputation() public {
        uint256 orderId = _newMilestoneOrder(_amounts2(uint128(100 * USDC), uint128(100 * USDC)), false);
        _deliverAt(orderId, 0);
        vm.warp(block.timestamp + 72 hours);
        escrow.autoReleaseMilestone(orderId);
        _deliverAt(orderId, 1);
        vm.warp(block.timestamp + 72 hours);
        escrow.autoReleaseMilestone(orderId);

        Stats memory provider = reputation.stats(payee, Role.Provider);
        assertEq(provider.closed, 1);
        assertEq(provider.ratingCount, 0);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
    }

    function test_advanceNeedsTheFlagAndTheStanding() public {
        uint256 orderId = _standard();

        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.AdvanceNotAllowed.selector);
        escrow.claimAdvance(orderId);
    }

    function test_advanceAgreementNeedsAProviderWithHistory() public {
        uint256 orderId = _createUsdc(300 * USDC);
        MilestoneTerms memory terms =
            _terms(_amounts(uint128(60 * USDC), uint128(120 * USDC), uint128(120 * USDC)), true);
        _expectAgreeMilestonesRevert(
            orderId,
            terms,
            _milestoneAgreement(orderId, terms),
            abi.encodeWithSelector(IEscrowEvents.AdvanceNotAllowed.selector)
        );
    }

    function test_advanceCannotExceedTheCap() public {
        _giveStanding(payee, 5);
        uint256 orderId = _createUsdc(300 * USDC);
        MilestoneTerms memory terms =
            _terms(_amounts(uint128(91 * USDC), uint128(100 * USDC), uint128(109 * USDC)), true);
        _expectAgreeMilestonesRevert(
            orderId,
            terms,
            _milestoneAgreement(orderId, terms),
            abi.encodeWithSelector(IEscrowEvents.AdvanceNotAllowed.selector)
        );
    }

    function test_advanceAtExactlyTheCapIsAccepted() public {
        _giveStanding(payee, 5);
        uint256 orderId =
            _newMilestoneOrder(_amounts(uint128(90 * USDC), uint128(100 * USDC), uint128(110 * USDC)), true);

        vm.prank(payee);
        escrow.claimAdvance(orderId);
        assertEq(usdc.balanceOf(payee), 90 * USDC);
        assertEq(_plan(orderId).next, 1);
    }

    function test_advanceCanOnlyBeClaimedOnceAndFirst() public {
        _giveStanding(payee, 5);
        uint256 orderId =
            _newMilestoneOrder(_amounts(uint128(60 * USDC), uint128(120 * USDC), uint128(120 * USDC)), true);
        vm.startPrank(payee);
        escrow.claimAdvance(orderId);
        vm.expectRevert(IEscrowEvents.AdvanceNotAllowed.selector);
        escrow.claimAdvance(orderId);
        vm.stopPrank();
    }

    function test_advanceIsNotAvailableAfterTheFirstMilestoneMoved() public {
        _giveStanding(payee, 5);
        uint256 orderId =
            _newMilestoneOrder(_amounts(uint128(60 * USDC), uint128(120 * USDC), uint128(120 * USDC)), true);
        _payMilestone(orderId, 0, 60 * USDC, 5);

        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.AdvanceNotAllowed.selector);
        escrow.claimAdvance(orderId);
    }

    function test_onlyTheProviderClaimsTheAdvance() public {
        _giveStanding(payee, 5);
        uint256 orderId =
            _newMilestoneOrder(_amounts(uint128(60 * USDC), uint128(120 * USDC), uint128(120 * USDC)), true);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotPayee.selector, payer));
        escrow.claimAdvance(orderId);
    }

    function test_theLowerStandingIsCheckedAgainAtClaimTime() public {
        _giveStanding(payee, 5);
        uint256 orderId =
            _newMilestoneOrder(_amounts(uint128(60 * USDC), uint128(120 * USDC), uint128(120 * USDC)), true);
        _setParameter(ParameterKeys.ADVANCE_MIN_CLOSED_ORDERS, 6);

        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.AdvanceNotAllowed.selector);
        escrow.claimAdvance(orderId);
    }

    function test_progressIsRecordedForTheCurrentMilestone() public {
        uint256 orderId = _standard();

        vm.expectEmit(true, false, false, true);
        emit IEscrowEvents.ProgressReported(orderId, 0, 4000, PROGRESS);
        vm.prank(payee);
        escrow.reportProgress(orderId, 4000, PROGRESS);

        assertEq(_plan(orderId).progressBps, 4000);
        assertEq(_plan(orderId).progressEvidence, PROGRESS);
    }

    function test_progressRules() public {
        uint256 orderId = _standard();

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotPayee.selector, payer));
        escrow.reportProgress(orderId, 1000, PROGRESS);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidProgress.selector, 10_001));
        escrow.reportProgress(orderId, 10_001, PROGRESS);

        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.EvidenceRequired.selector);
        escrow.reportProgress(orderId, 1000, bytes32(0));
    }

    function test_progressResetsWhenTheMilestoneIsPaid() public {
        uint256 orderId = _standard();
        vm.prank(payee);
        escrow.reportProgress(orderId, 7000, PROGRESS);
        _payMilestone(orderId, 0, 100 * USDC, 5);

        assertEq(_plan(orderId).progressBps, 0);
        assertEq(_plan(orderId).progressEvidence, bytes32(0));
    }

    function test_milestoneActionsThroughTheForwarderAttributeTheSigner() public {
        uint256 orderId = _standard();
        _forward(
            payeeKey,
            payee,
            address(escrow),
            abi.encodeCall(IEscrow.deliverMilestone, (orderId, 0, keccak256("relayed")))
        );

        assertEq(uint8(_list(orderId)[0].status), uint8(MilestoneStatus.Delivered));
    }

    function test_theWholeOrderConservesTheMoney() public {
        uint256 total = usdc.balanceOf(payer) + usdc.balanceOf(payee) + usdc.balanceOf(address(treasury))
            + usdc.balanceOf(address(escrow));
        uint256 orderId = _standard();
        _payMilestone(orderId, 0, 70 * USDC, 5);
        _payMilestone(orderId, 1, 100 * USDC, 4);
        _deliverAt(orderId, 2);
        vm.warp(block.timestamp + 72 hours);
        escrow.autoReleaseMilestone(orderId);

        uint256 after_ = usdc.balanceOf(payer) + usdc.balanceOf(payee) + usdc.balanceOf(address(treasury))
            + usdc.balanceOf(address(escrow));
        assertEq(after_, total);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testFuzz_anySequenceOfPartialReleasesConservesTheMoney(uint96 a, uint96 b, uint96 c, uint16 pctSeed)
        public
    {
        uint128 first = uint128(bound(a, 1, 200 * USDC));
        uint128 second = uint128(bound(b, 1, 200 * USDC));
        uint128 third = uint128(bound(c, 1, 200 * USDC));
        uint256 total = usdc.balanceOf(payer) + usdc.balanceOf(payee) + usdc.balanceOf(address(treasury))
            + usdc.balanceOf(address(escrow));
        uint256 orderId = _newMilestoneOrder(_amounts(first, second, third), false);
        uint256 pct = bound(pctSeed, 0, 10_000);
        uint128[3] memory amounts = [first, second, third];
        for (uint8 i = 0; i < 3; i++) {
            _payMilestone(orderId, i, (uint256(amounts[i]) * pct) / 10_000, 4);
        }

        uint256 after_ = usdc.balanceOf(payer) + usdc.balanceOf(payee) + usdc.balanceOf(address(treasury))
            + usdc.balanceOf(address(escrow));
        assertEq(after_, total);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
    }
}

library EscrowHashesHelper {
    function hash(MilestoneRelease memory r) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(
                    "MilestoneRelease(uint256 orderId,uint8 index,uint128 amount,uint8 rating,bytes32 evidenceHash,uint40 expiry)"
                ),
                r.orderId,
                r.index,
                r.amount,
                r.rating,
                r.evidenceHash,
                r.expiry
            )
        );
    }
}
