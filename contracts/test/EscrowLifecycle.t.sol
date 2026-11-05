// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {IEscrowEvents} from "../src/interfaces/IEscrowEvents.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {Order, OrderStatus, PaymentMode, Modality, CreateParams, Agreement} from "../src/libraries/OrderTypes.sol";

contract EscrowLifecycleTest is EscrowBase {
    uint256 internal constant PRICE = 100 * USDC;

    function _scheduled(uint256 startsIn, uint256 deadlineIn, Modality modality, PaymentMode mode)
        internal
        returns (uint256 orderId)
    {
        CreateParams memory p = _params(address(usdt), PRICE);
        p.startsAt = startsIn == 0 ? 0 : uint40(block.timestamp + startsIn);
        p.deadline = deadlineIn == 0 ? 0 : uint40(block.timestamp + deadlineIn);
        p.modality = modality;
        p.mode = mode;
        vm.prank(payer);
        orderId = escrow.createOrder(p, _noAuth());
    }

    function _agreedScheduled(uint256 startsIn, uint256 deadlineIn) internal returns (uint256 orderId) {
        orderId = _scheduled(startsIn, deadlineIn, Modality.OnSite, PaymentMode.Escrowed);
        _agree(orderId, PRICE);
    }

    function _agreeWith(uint256 orderId, address who, uint256 whoKey) internal {
        Agreement memory a = _agreement(orderId, PRICE);
        a.payee = who;
        bytes32 structHash = _agreementHash(a);
        vm.prank(relayer);
        escrow.agree(a, _sign(payerKey, structHash), _sign(whoKey, structHash));
    }

    function test_payerCancelAfterAgreementPaysPenaltySplit() public {
        uint256 orderId = _agreedScheduled(0, 0);
        uint256 payerBefore = usdt.balanceOf(payer);

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.OrderCancelled(orderId, payer, 0, uint128(8 * USDC), uint128(2 * USDC), uint128(90 * USDC));
        vm.prank(payer);
        escrow.cancel(orderId);

        assertEq(usdt.balanceOf(payee), 8 * USDC);
        assertEq(usdt.balanceOf(address(treasury)), 2 * USDC);
        assertEq(usdt.balanceOf(payer) - payerBefore, 90 * USDC);
        assertEq(usdt.balanceOf(address(escrow)), 0);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Cancelled));
    }

    function test_payeeCancelAfterAgreementRefundsEverything() public {
        uint256 orderId = _agreedScheduled(0, 0);
        uint256 payerBefore = usdt.balanceOf(payer);
        vm.prank(payee);
        escrow.cancel(orderId);
        assertEq(usdt.balanceOf(payer) - payerBefore, PRICE);
        assertEq(usdt.balanceOf(payee), 0);
        assertEq(usdt.balanceOf(address(treasury)), 0);
    }

    function test_cancelAfterAgreementRevertsForStrangers() public {
        uint256 orderId = _agreedScheduled(0, 0);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotParty.selector, other));
        escrow.cancel(orderId);
    }

    function test_cancelCashOrderAfterAgreementCostsNothing() public {
        uint256 orderId = _scheduled(2 days, 0, Modality.OnSite, PaymentMode.Cash);
        _agree(orderId, PRICE);
        uint256 treasuryBefore = usdt.balanceOf(address(treasury));
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(payer);
        escrow.cancel(orderId);
        assertEq(usdt.balanceOf(address(treasury)), treasuryBefore);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Cancelled));
    }

    function test_freeCancelWithEnoughNotice() public {
        uint256 orderId = _agreedScheduled(3 days, 0);
        uint256 payerBefore = usdt.balanceOf(payer);
        vm.warp(block.timestamp + 1 days);
        vm.prank(payer);
        escrow.cancel(orderId);

        assertEq(usdt.balanceOf(payer) - payerBefore, PRICE);
        assertEq(usdt.balanceOf(payee), 0);
        (uint8 account, uint8 pair) = escrow.freeCancelsUsed(payer, payee);
        assertEq(account, 1);
        assertEq(pair, 1);
    }

    function test_cancelInsideNoticeWindowPaysPenalty() public {
        uint256 orderId = _agreedScheduled(3 days, 0);
        vm.warp(block.timestamp + 2 days + 1);
        vm.prank(payer);
        escrow.cancel(orderId);
        assertEq(usdt.balanceOf(payee), 8 * USDC);
        (uint8 account,) = escrow.freeCancelsUsed(payer, payee);
        assertEq(account, 0);
    }

    function test_pairLimitMakesSecondFreeCancelCost() public {
        uint256 first = _agreedScheduled(3 days, 0);
        vm.prank(payer);
        escrow.cancel(first);
        assertEq(usdt.balanceOf(payee), 0);

        uint256 second = _agreedScheduled(3 days, 0);
        vm.prank(payer);
        escrow.cancel(second);
        assertEq(usdt.balanceOf(payee), 8 * USDC);
    }

    function test_accountLimitMakesThirdFreeCancelCost() public {
        (address payee2, uint256 payee2Key) = makeAddrAndKey("payee2");
        (address payee3, uint256 payee3Key) = makeAddrAndKey("payee3");

        uint256 a = _scheduled(3 days, 0, Modality.OnSite, PaymentMode.Escrowed);
        _agreeWith(a, payee, payeeKey);
        vm.prank(payer);
        escrow.cancel(a);

        uint256 b = _scheduled(3 days, 0, Modality.OnSite, PaymentMode.Escrowed);
        _agreeWith(b, payee2, payee2Key);
        vm.prank(payer);
        escrow.cancel(b);

        uint256 c = _scheduled(3 days, 0, Modality.OnSite, PaymentMode.Escrowed);
        _agreeWith(c, payee3, payee3Key);
        vm.prank(payer);
        escrow.cancel(c);

        assertEq(usdt.balanceOf(payee), 0);
        assertEq(usdt.balanceOf(payee2), 0);
        assertEq(usdt.balanceOf(payee3), 8 * USDC);
    }

    function test_freeCancelLimitsResetNextMonth() public {
        uint256 first = _agreedScheduled(3 days, 0);
        vm.prank(payer);
        escrow.cancel(first);

        vm.warp(block.timestamp + 31 days);
        uint256 second = _agreedScheduled(3 days, 0);
        vm.prank(payer);
        escrow.cancel(second);
        assertEq(usdt.balanceOf(payee), 0);
    }

    function test_reclaimAfterDeadlineRefundsPayer() public {
        uint256 orderId = _agreedScheduled(0, 2 days);
        uint256 payerBefore = usdt.balanceOf(payer);
        vm.warp(block.timestamp + 2 days + 1);
        vm.prank(other);
        escrow.reclaim(orderId);
        assertEq(usdt.balanceOf(payer) - payerBefore, PRICE);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Cancelled));
    }

    function test_reclaimRevertsBeforeDeadline() public {
        uint256 orderId = _agreedScheduled(0, 2 days);
        vm.expectRevert(
            abi.encodeWithSelector(IEscrowEvents.DeadlineNotReached.selector, uint40(block.timestamp + 2 days))
        );
        escrow.reclaim(orderId);
    }

    function test_reclaimRevertsWithoutDeadline() public {
        uint256 orderId = _agreedScheduled(0, 0);
        vm.warp(block.timestamp + 365 days);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.DeadlineNotReached.selector, uint40(0)));
        escrow.reclaim(orderId);
    }

    function test_reclaimRevertsAfterDelivery() public {
        uint256 orderId = _agreedScheduled(0, 2 days);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Delivered));
        escrow.reclaim(orderId);
    }

    function test_noShowPaysCompensationAndReturnsRest() public {
        uint256 orderId = _agreedScheduled(1 days, 0);
        vm.warp(block.timestamp + 1 days);
        vm.prank(payee);
        escrow.checkIn(orderId);
        vm.warp(block.timestamp + 20 minutes);

        uint256 payerBefore = usdt.balanceOf(payer);
        vm.prank(payee);
        escrow.claimNoShow(orderId);

        assertEq(usdt.balanceOf(payee), 8 * USDC);
        assertEq(usdt.balanceOf(address(treasury)), 2 * USDC);
        assertEq(usdt.balanceOf(payer) - payerBefore, 90 * USDC);
        assertEq(usdt.balanceOf(address(escrow)), 0);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Cancelled));
    }

    function test_noShowRevertsBeforeWait() public {
        uint256 orderId = _agreedScheduled(1 days, 0);
        vm.warp(block.timestamp + 1 days);
        vm.prank(payee);
        escrow.checkIn(orderId);
        vm.warp(block.timestamp + 19 minutes);
        vm.prank(payee);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEscrowEvents.NoShowNotReady.selector, uint40(block.timestamp - 19 minutes + 20 minutes)
            )
        );
        escrow.claimNoShow(orderId);
    }

    function test_noShowBlockedByArrivalConfirmation() public {
        uint256 orderId = _agreedScheduled(1 days, 0);
        vm.warp(block.timestamp + 1 days);
        vm.prank(payee);
        escrow.checkIn(orderId);
        vm.prank(payer);
        escrow.confirmArrival(orderId);
        vm.warp(block.timestamp + 1 hours);
        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.ArrivalAlreadyConfirmed.selector);
        escrow.claimNoShow(orderId);
    }

    function test_noShowRequiresCheckIn() public {
        uint256 orderId = _agreedScheduled(1 days, 0);
        vm.warp(block.timestamp + 2 days);
        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.NotCheckedIn.selector);
        escrow.claimNoShow(orderId);
    }

    function test_checkInRevertsBeforeStart() public {
        uint256 orderId = _agreedScheduled(1 days, 0);
        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.CheckInNotAllowed.selector);
        escrow.checkIn(orderId);
    }

    function test_checkInRevertsWithoutSchedule() public {
        uint256 orderId = _agreedScheduled(0, 0);
        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.CheckInNotAllowed.selector);
        escrow.checkIn(orderId);
    }

    function test_checkInRevertsOnRemoteOrder() public {
        uint256 orderId = _scheduled(1 days, 0, Modality.Remote, PaymentMode.Escrowed);
        _agree(orderId, PRICE);
        vm.warp(block.timestamp + 1 days);
        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.CheckInNotAllowed.selector);
        escrow.checkIn(orderId);
    }

    function test_checkInOnlyByPayeeAndOnlyOnce() public {
        uint256 orderId = _agreedScheduled(1 days, 0);
        vm.warp(block.timestamp + 1 days);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotPayee.selector, payer));
        escrow.checkIn(orderId);

        vm.startPrank(payee);
        escrow.checkIn(orderId);
        vm.expectRevert(IEscrowEvents.AlreadyCheckedIn.selector);
        escrow.checkIn(orderId);
        vm.stopPrank();
    }

    function test_confirmArrivalRequiresCheckInAndPayer() public {
        uint256 orderId = _agreedScheduled(1 days, 0);
        vm.prank(payer);
        vm.expectRevert(IEscrowEvents.NotCheckedIn.selector);
        escrow.confirmArrival(orderId);

        vm.warp(block.timestamp + 1 days);
        vm.prank(payee);
        escrow.checkIn(orderId);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotPayer.selector, payee));
        escrow.confirmArrival(orderId);
    }

    function test_extendReviewDelaysAutoReleaseOnce() public {
        uint256 orderId = _agreedScheduled(0, 0);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
        vm.warp(block.timestamp + 23 hours);
        vm.prank(payer);
        escrow.extendReview(orderId);

        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert();
        escrow.autoRelease(orderId);

        vm.warp(block.timestamp + 24 hours);
        escrow.autoRelease(orderId);
        assertEq(usdt.balanceOf(payee), PRICE);
    }

    function test_extendReviewCannotRepeat() public {
        uint256 orderId = _agreedScheduled(0, 0);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
        vm.startPrank(payer);
        escrow.extendReview(orderId);
        vm.expectRevert(IEscrowEvents.AlreadyExtended.selector);
        escrow.extendReview(orderId);
        vm.stopPrank();
    }

    function test_extendReviewRevertsAfterWindow() public {
        uint256 orderId = _agreedScheduled(0, 0);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
        vm.warp(block.timestamp + 24 hours);
        vm.prank(payer);
        vm.expectRevert();
        escrow.extendReview(orderId);
    }

    function test_extendReviewOnlyByPayer() public {
        uint256 orderId = _agreedScheduled(0, 0);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotPayer.selector, payee));
        escrow.extendReview(orderId);
    }

    function testFuzz_lateCancelConservesFunds(uint96 priceSeed, uint16 feeBps, uint16 shareBps) public {
        uint256 price = bound(priceSeed, 1, 9_000 * USDC);
        _setParameter(ParameterKeys.CANCEL_FEE_AGREED_BPS, uint64(bound(feeBps, 0, 2000)));
        _setParameter(ParameterKeys.CANCEL_PAYEE_SHARE_BPS, uint64(bound(shareBps, 5000, 10_000)));

        CreateParams memory p = _params(address(usdt), price);
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(p, _noAuth());
        _agree(orderId, price);

        uint256 payerBefore = usdt.balanceOf(payer);
        vm.prank(payer);
        escrow.cancel(orderId);

        uint256 distributed =
            usdt.balanceOf(payee) + usdt.balanceOf(address(treasury)) + (usdt.balanceOf(payer) - payerBefore);
        assertEq(distributed, price);
        assertEq(usdt.balanceOf(address(escrow)), 0);
    }
}
