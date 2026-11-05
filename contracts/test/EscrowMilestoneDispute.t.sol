// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MilestoneBase} from "./MilestoneBase.sol";
import {IEscrowEvents} from "../src/interfaces/IEscrowEvents.sol";
import {IArbitration} from "../src/interfaces/IArbitration.sol";
import {Role, Stats} from "../src/interfaces/IReputation.sol";
import {MockArbitration} from "./mocks/MockArbitration.sol";
import {Order, OrderStatus, DepositAuth, MilestoneStatus, Milestone} from "../src/libraries/OrderTypes.sol";

contract EscrowMilestoneDisputeTest is MilestoneBase {
    MockArbitration internal court;
    bytes32 internal constant REASON = keccak256("hito not accepted");

    function setUp() public override {
        super.setUp();
        court = new MockArbitration(escrow);
        vm.prank(admin);
        escrow.setArbitration(IArbitration(address(court)));
    }

    function _openAs(address who, uint256 orderId, uint256 fee) internal {
        DepositAuth memory auth = fee == 0 ? _noAuth() : _feeAuthFor(who, fee);
        vm.prank(who);
        escrow.openDispute(orderId, REASON, auth);
    }

    function _money() internal view returns (uint256) {
        return usdc.balanceOf(payer) + usdc.balanceOf(payee) + usdc.balanceOf(address(treasury))
            + usdc.balanceOf(address(escrow)) + usdc.balanceOf(address(court));
    }

    function test_aSmallMilestoneIsSplitFiftyFiftyAtOnce() public {
        uint256 orderId =
            _newMilestoneOrder(_amounts(uint128(10 * USDC), uint128(40 * USDC), uint128(50 * USDC)), false);
        _deliverAt(orderId, 0);
        uint256 payerBefore = usdc.balanceOf(payer);

        _openAs(payer, orderId, 0);

        assertEq(usdc.balanceOf(payee), 5 * USDC);
        assertEq(usdc.balanceOf(payer) - payerBefore, 5 * USDC);
        Order memory order = _order(orderId);
        assertEq(uint8(order.status), uint8(OrderStatus.Agreed));
        assertEq(order.deposited, 90 * USDC);
        assertEq(_plan(orderId).next, 1);
        assertFalse(_plan(orderId).disputing);
        assertEq(uint8(_list(orderId)[0].status), uint8(MilestoneStatus.Paid));
    }

    function test_theOrderCanContinueAfterADisputedMilestone() public {
        uint256 orderId =
            _newMilestoneOrder(_amounts(uint128(10 * USDC), uint128(40 * USDC), uint128(50 * USDC)), false);
        _deliverAt(orderId, 0);
        _openAs(payer, orderId, 0);
        _payMilestone(orderId, 1, 40 * USDC, 5);
        _payMilestone(orderId, 2, 50 * USDC, 5);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
        assertEq(usdc.balanceOf(payee), 5 * USDC + 90 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_aMediumMilestoneGoesToTheJuryAndFreezesTheOrder() public {
        uint256 orderId = _standard();
        _deliverAt(orderId, 0);

        _openAs(payer, orderId, 3 * USDC);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Disputed));
        assertTrue(_plan(orderId).disputing);
        (,,,,, address token, uint8 jurors,) = court.caseOf(1);
        assertEq(token, address(usdc));
        assertEq(jurors, 3);
        assertEq(usdc.balanceOf(address(escrow)), 300 * USDC + 3 * USDC);
    }

    function test_juryDecisionPaysTheMilestoneAndReturnsToAgreed() public {
        uint256 orderId = _standard();
        _deliverAt(orderId, 0);
        _openAs(payer, orderId, 3 * USDC);

        court.resolve(orderId, 10_000);

        assertEq(usdc.balanceOf(payee), 100 * USDC);
        Order memory order = _order(orderId);
        assertEq(uint8(order.status), uint8(OrderStatus.Agreed));
        assertEq(order.deposited, 200 * USDC);
        assertEq(_plan(orderId).next, 1);
        assertEq(usdc.balanceOf(address(court)), 3 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 200 * USDC);
    }

    function test_juryDecisionForTheRequesterRefundsOnlyThatMilestone() public {
        uint256 orderId = _standard();
        _deliverAt(orderId, 0);
        _openAs(payer, orderId, 3 * USDC);
        uint256 payerBefore = usdc.balanceOf(payer);

        court.resolve(orderId, 0);

        assertEq(usdc.balanceOf(payer) - payerBefore, 100 * USDC);
        assertEq(usdc.balanceOf(payee), 0);
        assertEq(_order(orderId).deposited, 200 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Agreed));
    }

    function test_waivedResolutionKeepsTheOrderGoingAndRefundsTheFee() public {
        uint256 orderId = _standard();
        _deliverAt(orderId, 0);
        _openAs(payer, orderId, 3 * USDC);
        uint256 payerBefore = usdc.balanceOf(payer);

        court.resolveWaived(orderId, 0);

        assertEq(usdc.balanceOf(payer) - payerBefore, 100 * USDC + 3 * USDC);
        assertEq(usdc.balanceOf(address(court)), 0);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Agreed));
    }

    function test_disputingTheLastMilestoneClosesTheOrder() public {
        uint256 orderId = _newMilestoneOrder(_amounts2(uint128(100 * USDC), uint128(100 * USDC)), false);
        _payMilestone(orderId, 0, 100 * USDC, 5);
        _deliverAt(orderId, 1);
        _openAs(payer, orderId, 3 * USDC);

        court.resolve(orderId, 10_000);

        Order memory order = _order(orderId);
        assertEq(uint8(order.status), uint8(OrderStatus.Settled));
        assertTrue(order.paidOut);
        assertEq(usdc.balanceOf(payee), 200 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_theClosingDisputeIsNotCleanInReputation() public {
        uint256 orderId = _newMilestoneOrder(_amounts2(uint128(100 * USDC), uint128(100 * USDC)), false);
        _payMilestone(orderId, 0, 100 * USDC, 5);
        _deliverAt(orderId, 1);
        _openAs(payer, orderId, 3 * USDC);
        court.resolve(orderId, 10_000);

        Stats memory provider = reputation.stats(payee, Role.Provider);
        assertEq(provider.closed, 1);
        assertEq(provider.closedClean, 0);
        assertEq(reputation.stats(payer, Role.Requester).disputesLost, 1);
    }

    function test_aProviderThatLosesTheLastMilestoneStillClosesWithWhatWasPaid() public {
        uint256 orderId = _newMilestoneOrder(_amounts2(uint128(100 * USDC), uint128(100 * USDC)), false);
        _payMilestone(orderId, 0, 100 * USDC, 5);
        _deliverAt(orderId, 1);
        _openAs(payer, orderId, 3 * USDC);
        court.resolve(orderId, 0);

        Order memory order = _order(orderId);
        assertEq(uint8(order.status), uint8(OrderStatus.Settled));
        assertTrue(order.paidOut);
        assertEq(usdc.balanceOf(payee), 100 * USDC);
    }

    function test_aLargeMilestoneUsesFiveJurors() public {
        uint256 orderId = _newMilestoneOrder(_amounts2(uint128(400 * USDC), uint128(100 * USDC)), false);
        _deliverAt(orderId, 0);

        _openAs(payer, orderId, 5 * USDC);

        (,,,,,, uint8 jurors,) = court.caseOf(1);
        assertEq(jurors, 5);
    }

    function test_theMilestoneNeedsToBeDeliveredToBeDisputed() public {
        uint256 orderId = _standard();

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.MilestoneNotDelivered.selector, 0));
        escrow.openDispute(orderId, REASON, _noAuth());
    }

    function test_theReviewWindowOfTheMilestoneBoundsTheDispute() public {
        uint256 orderId = _standard();
        _deliverAt(orderId, 0);
        uint40 readyAt = _list(orderId)[0].deliveredAt + 72 hours;

        vm.warp(readyAt - 1);
        _openAs(payer, orderId, 3 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Disputed));
    }

    function test_disputesAfterTheReviewWindowRevert() public {
        uint256 orderId = _standard();
        _deliverAt(orderId, 0);
        uint40 readyAt = _list(orderId)[0].deliveredAt + 72 hours;
        vm.warp(readyAt);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.ReviewWindowClosed.selector, readyAt));
        escrow.openDispute(orderId, REASON, _noAuth());
    }

    function test_onlyThePartiesCanDisputeAMilestone() public {
        uint256 orderId = _standard();
        _deliverAt(orderId, 0);

        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotParty.selector, other));
        escrow.openDispute(orderId, REASON, _noAuth());
    }

    function test_theProviderCanOpenTheMilestoneDisputeToo() public {
        uint256 orderId = _standard();
        _deliverAt(orderId, 0);
        _openAs(payee, orderId, 3 * USDC);

        assertEq(escrow.getDispute(orderId).claimant, payee);
    }

    function test_aDisputedOrderBlocksTheOtherMilestoneActions() public {
        uint256 orderId = _standard();
        _deliverAt(orderId, 0);
        _openAs(payer, orderId, 3 * USDC);
        bytes memory disputed =
            abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Disputed);

        vm.prank(payee);
        vm.expectRevert(disputed);
        escrow.deliverMilestone(orderId, 1, EVIDENCE);

        vm.warp(block.timestamp + 10 days);
        vm.expectRevert(disputed);
        escrow.autoReleaseMilestone(orderId);

        vm.prank(payer);
        vm.expectRevert(disputed);
        escrow.terminateEarly(orderId);

        vm.prank(payee);
        vm.expectRevert(disputed);
        escrow.abandon(orderId);
    }

    function test_theNextMilestoneCanBeDisputedAfterTheFirstWasResolved() public {
        uint256 orderId = _standard();
        _deliverAt(orderId, 0);
        _openAs(payer, orderId, 3 * USDC);
        court.resolve(orderId, 10_000);

        _deliverAt(orderId, 1);
        _openAs(payer, orderId, 3 * USDC);
        court.resolve(orderId, 0);

        assertEq(_plan(orderId).next, 2);
        assertEq(usdc.balanceOf(payee), 100 * USDC);
        assertEq(_order(orderId).deposited, 100 * USDC);
    }

    function test_theWholeFlowWithADisputeConservesTheMoney() public {
        uint256 total = _money();
        uint256 orderId = _standard();
        _payMilestone(orderId, 0, 80 * USDC, 4);
        _deliverAt(orderId, 1);
        _openAs(payer, orderId, 3 * USDC);
        total += 3 * USDC;
        court.resolve(orderId, 6000);
        _payMilestone(orderId, 2, 100 * USDC, 5);

        assertEq(_money(), total);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
    }

    function testFuzz_aDisputedMilestoneAlwaysConservesTheMoney(uint16 shareSeed, bool providerClaims, bool waive)
        public
    {
        uint16 share = uint16(bound(shareSeed, 0, 10_000));
        uint256 total = _money();
        uint256 orderId = _standard();
        _deliverAt(orderId, 0);
        _openAs(providerClaims ? payee : payer, orderId, 3 * USDC);
        total += 3 * USDC;

        if (waive) court.resolveWaived(orderId, share);
        else court.resolve(orderId, share);

        assertEq(_money(), total);
        assertEq(_order(orderId).deposited, 200 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Agreed));
    }
}
