// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MilestoneBase} from "./MilestoneBase.sol";
import {IEscrowEvents} from "../src/interfaces/IEscrowEvents.sol";
import {Role} from "../src/interfaces/IReputation.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {
    Order,
    OrderStatus,
    CreateParams,
    DepositAuth,
    MilestonePlan,
    Milestone,
    Release
} from "../src/libraries/OrderTypes.sol";

contract EscrowMilestoneExitTest is MilestoneBase {
    function _withDeadline(uint256 daysAhead) internal returns (uint256 orderId) {
        CreateParams memory params = _params(address(usdc), 300 * USDC);
        params.deadline = uint40(block.timestamp + daysAhead * 1 days);
        DepositAuth memory auth = _permitAuth(300 * USDC);
        vm.prank(payer);
        orderId = escrow.createOrder(params, auth);
        _agreeMilestones(
            orderId, _terms(_amounts(uint128(100 * USDC), uint128(100 * USDC), uint128(100 * USDC)), false)
        );
    }

    function _money() internal view returns (uint256) {
        return usdc.balanceOf(payer) + usdc.balanceOf(payee) + usdc.balanceOf(address(treasury))
            + usdc.balanceOf(address(escrow));
    }

    function test_terminatingBeforeAnythingStartedPaysOnlyTheCompensation() public {
        uint256 orderId = _standard();
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.OrderTerminated(orderId, payer, uint128(24 * USDC), uint128(6 * USDC), uint128(270 * USDC));
        vm.prank(payer);
        escrow.terminateEarly(orderId);

        assertEq(usdc.balanceOf(payee), 24 * USDC);
        assertEq(usdc.balanceOf(address(treasury)), 6 * USDC);
        assertEq(usdc.balanceOf(payer) - payerBefore, 270 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Cancelled));
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_terminatingPaysTheReportedProgressPlusTheCompensation() public {
        uint256 orderId = _standard();
        vm.prank(payee);
        escrow.reportProgress(orderId, 5000, PROGRESS);
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payer);
        escrow.terminateEarly(orderId);

        assertEq(usdc.balanceOf(payee), 70 * USDC);
        assertEq(usdc.balanceOf(address(treasury)), 5 * USDC);
        assertEq(usdc.balanceOf(payer) - payerBefore, 225 * USDC);
    }

    function test_terminatingChargesTheProtocolFeeOnTheProgressOnly() public {
        _setParameter(ParameterKeys.FEE_BPS, 200);
        uint256 orderId = _standard();
        vm.prank(payee);
        escrow.reportProgress(orderId, 5000, PROGRESS);

        vm.prank(payer);
        escrow.terminateEarly(orderId);

        assertEq(usdc.balanceOf(payee), 70 * USDC - 1 * USDC);
        assertEq(usdc.balanceOf(address(treasury)), 5 * USDC + 1 * USDC);
    }

    function test_terminatingAfterAMilestoneWasPaidOnlyCompensatesTheRest() public {
        uint256 orderId = _standard();
        _payMilestone(orderId, 0, 100 * USDC, 5);
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payer);
        escrow.terminateEarly(orderId);

        assertEq(usdc.balanceOf(payee), 100 * USDC + 16 * USDC);
        assertEq(usdc.balanceOf(address(treasury)), 4 * USDC);
        assertEq(usdc.balanceOf(payer) - payerBefore, 180 * USDC);
    }

    function test_terminatingIsBlockedWhileAMilestoneAwaitsReview() public {
        uint256 orderId = _standard();
        _deliverAt(orderId, 0);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.MilestoneNotPending.selector, 0));
        escrow.terminateEarly(orderId);
    }

    function test_onlyThePayerTerminates() public {
        uint256 orderId = _standard();

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotPayer.selector, payee));
        escrow.terminateEarly(orderId);
    }

    function test_terminatingAFinishedOrderReverts() public {
        uint256 orderId = _newMilestoneOrder(_amounts2(uint128(100 * USDC), uint128(100 * USDC)), false);
        _payMilestone(orderId, 0, 100 * USDC, 5);
        _payMilestone(orderId, 1, 100 * USDC, 5);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Settled));
        escrow.terminateEarly(orderId);
    }

    function test_terminationConservesTheMoney() public {
        uint256 total = _money();
        uint256 orderId = _standard();
        vm.prank(payee);
        escrow.reportProgress(orderId, 3333, PROGRESS);
        vm.prank(payer);
        escrow.terminateEarly(orderId);

        assertEq(_money(), total);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testFuzz_terminationNeverCreatesOrDestroysMoney(uint16 progressSeed, uint16 compSeed, bool paidFirst)
        public
    {
        _setParameter(ParameterKeys.TERMINATION_COMP_BPS, uint64(bound(compSeed, 0, 2000)));
        uint256 total = _money();
        uint256 orderId = _standard();
        if (paidFirst) _payMilestone(orderId, 0, 100 * USDC, 5);
        vm.prank(payee);
        escrow.reportProgress(orderId, uint16(bound(progressSeed, 0, 10_000)), PROGRESS);
        vm.prank(payer);
        escrow.terminateEarly(orderId);

        assertEq(_money(), total);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_theProviderCanAbandonAndTheOrderReopensWithTheRemainingFunds() public {
        uint256 orderId = _standard();
        _payMilestone(orderId, 0, 100 * USDC, 5);

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.OrderAbandoned(orderId, payee, uint128(200 * USDC));
        vm.prank(payee);
        escrow.abandon(orderId);

        Order memory order = _order(orderId);
        assertEq(uint8(order.status), uint8(OrderStatus.Open));
        assertEq(order.payee, address(0));
        assertEq(order.price, 0);
        assertEq(order.deposited, 200 * USDC);
        assertFalse(order.hasMilestones);
        assertEq(_plan(orderId).count, 0);
        assertEq(_list(orderId).length, 0);
        assertEq(usdc.balanceOf(address(escrow)), 200 * USDC);
    }

    function test_abandoningCountsAsAProviderFailure() public {
        uint256 orderId = _standard();
        vm.prank(payee);
        escrow.abandon(orderId);

        assertEq(reputation.stats(payee, Role.Provider).failures, 1);
    }

    function test_theRequesterCanTakeTheRemainingFundsBackAfterAnAbandon() public {
        uint256 orderId = _standard();
        _payMilestone(orderId, 0, 100 * USDC, 5);
        vm.prank(payee);
        escrow.abandon(orderId);
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payer);
        escrow.cancel(orderId);

        assertEq(usdc.balanceOf(payer) - payerBefore, 200 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Cancelled));
    }

    function test_aReopenedOrderCanBeAgreedAgainWithTheRemainingFunds() public {
        uint256 orderId = _standard();
        _payMilestone(orderId, 0, 100 * USDC, 5);
        vm.prank(payee);
        escrow.abandon(orderId);

        _agreeMilestones(orderId, _terms(_amounts2(uint128(120 * USDC), uint128(80 * USDC)), false));

        Order memory order = _order(orderId);
        assertEq(uint8(order.status), uint8(OrderStatus.Agreed));
        assertEq(order.price, 200 * USDC);
        assertEq(_plan(orderId).count, 2);
        assertEq(_plan(orderId).next, 0);
    }

    function test_onlyTheProviderCanAbandon() public {
        uint256 orderId = _standard();

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotPayee.selector, payer));
        escrow.abandon(orderId);
    }

    function test_theRequesterCanDeclareAbandonmentAfterTheDeadline() public {
        uint256 orderId = _withDeadline(3);
        uint40 deadline = _order(orderId).deadline;
        vm.warp(deadline + 1);

        vm.prank(payer);
        escrow.declareAbandoned(orderId);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Open));
        assertEq(_order(orderId).deposited, 300 * USDC);
        assertEq(reputation.stats(payee, Role.Provider).failures, 1);
    }

    function test_declaringAbandonmentIsBlockedWhileADeliveredMilestoneAwaitsReview() public {
        uint256 orderId = _withDeadline(3);
        _deliverAt(orderId, 0);
        vm.warp(_order(orderId).deadline + 1);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.MilestoneNotPending.selector, 0));
        escrow.declareAbandoned(orderId);

        vm.warp(block.timestamp + 72 hours);
        escrow.autoReleaseMilestone(orderId);
        assertEq(usdc.balanceOf(payee), 100 * USDC);
    }

    function test_declaringAbandonmentBeforeTheDeadlineReverts() public {
        uint256 orderId = _withDeadline(3);
        uint40 deadline = _order(orderId).deadline;
        vm.warp(deadline);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.DeadlineNotReached.selector, deadline));
        escrow.declareAbandoned(orderId);
    }

    function test_declaringAbandonmentWithoutADeadlineReverts() public {
        uint256 orderId = _standard();
        vm.warp(block.timestamp + 365 days);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.DeadlineNotReached.selector, 0));
        escrow.declareAbandoned(orderId);
    }

    function test_onlyThePayerDeclaresAbandonment() public {
        uint256 orderId = _withDeadline(3);
        vm.warp(_order(orderId).deadline + 1);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotPayer.selector, payee));
        escrow.declareAbandoned(orderId);
    }

    function test_plainCancelIsBlockedOnceTheWorkStarted() public {
        uint256 orderId = _standard();
        _deliverAt(orderId, 0);

        vm.prank(payer);
        vm.expectRevert(IEscrowEvents.MilestonesInProgress.selector);
        escrow.cancel(orderId);

        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.MilestonesInProgress.selector);
        escrow.cancel(orderId);
    }

    function test_plainCancelIsBlockedAfterProgressWasReported() public {
        uint256 orderId = _standard();
        vm.prank(payee);
        escrow.reportProgress(orderId, 100, PROGRESS);

        vm.prank(payer);
        vm.expectRevert(IEscrowEvents.MilestonesInProgress.selector);
        escrow.cancel(orderId);
    }

    function test_plainCancelBeforeStartingStillChargesTheLateFee() public {
        uint256 orderId = _standard();
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payer);
        escrow.cancel(orderId);

        assertEq(usdc.balanceOf(payee), 24 * USDC);
        assertEq(usdc.balanceOf(address(treasury)), 6 * USDC);
        assertEq(usdc.balanceOf(payer) - payerBefore, 270 * USDC);
    }

    function test_theProviderCanStillWalkAwayBeforeStarting() public {
        uint256 orderId = _standard();
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payee);
        escrow.cancel(orderId);

        assertEq(usdc.balanceOf(payer) - payerBefore, 300 * USDC);
    }

    function test_reclaimIsBlockedOnceTheWorkStarted() public {
        uint256 orderId = _withDeadline(3);
        _deliverAt(orderId, 0);
        vm.warp(_order(orderId).deadline + 1);

        vm.prank(payer);
        vm.expectRevert(IEscrowEvents.MilestonesInProgress.selector);
        escrow.reclaim(orderId);
    }

    function test_reclaimStillWorksIfNothingStarted() public {
        uint256 orderId = _withDeadline(3);
        vm.warp(_order(orderId).deadline + 1);
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payer);
        escrow.reclaim(orderId);

        assertEq(usdc.balanceOf(payer) - payerBefore, 300 * USDC);
    }

    function test_plainReleaseOfTheWholeOrderIsNotPossible() public {
        uint256 orderId = _standard();
        (Release memory r, bytes memory sig) = _release(orderId, 300 * USDC, 5);

        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.UseMilestones.selector);
        escrow.release(r, sig);
    }
}
