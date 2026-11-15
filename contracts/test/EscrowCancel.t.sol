// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {IEscrowEvents} from "../src/interfaces/IEscrowEvents.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {Order, OrderStatus, PaymentMode, CreateParams, DepositAuth} from "../src/libraries/OrderTypes.sol";

contract EscrowCancelTest is EscrowBase {
    // ---- Antes de acordar: gratis si nadie se postuló, 2% al tesoro si hubo postulaciones ----

    function test_cancelOpenRefundsEverything() public {
        uint256 orderId = _createUsdc(100 * USDC);
        uint256 before = usdc.balanceOf(payer);

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.OrderCancelled(orderId, payer, 0, 0, 0, uint128(100 * USDC));
        vm.prank(payer);
        escrow.cancel(orderId);

        assertEq(usdc.balanceOf(payer) - before, 100 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Cancelled));
    }

    function test_cancelOnlyByPayer() public {
        uint256 orderId = _createUsdc(100 * USDC);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotPayer.selector, other));
        escrow.cancel(orderId);
    }

    function test_cancelCannotRepeat() public {
        uint256 orderId = _createUsdc(100 * USDC);
        vm.startPrank(payer);
        escrow.cancel(orderId);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Cancelled));
        escrow.cancel(orderId);
        vm.stopPrank();
    }

    function test_cancelAfterAnApplicationChargesTwoPercentToTheTreasury() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _markApplicant(orderId);
        uint256 payerBefore = usdc.balanceOf(payer);
        uint256 treasuryBefore = usdc.balanceOf(address(treasury));

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.OrderCancelled(orderId, payer, 0, 0, uint128(2 * USDC), uint128(98 * USDC));
        vm.prank(payer);
        escrow.cancel(orderId);

        assertEq(usdc.balanceOf(address(treasury)) - treasuryBefore, 2 * USDC);
        assertEq(usdc.balanceOf(payer) - payerBefore, 98 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_cancelFeeHasAMinimum() public {
        uint256 orderId = _createUsdc(10 * USDC);
        _markApplicant(orderId);
        uint256 treasuryBefore = usdc.balanceOf(address(treasury));
        vm.prank(payer);
        escrow.cancel(orderId);
        // 2% de 10 son 0,20; el mínimo es 0,50
        assertEq(usdc.balanceOf(address(treasury)) - treasuryBefore, USDC / 2);
    }

    function test_cancelFeeRespectsTheTokenCap() public {
        uint256 orderId = _createUsdc(5_000 * USDC);
        _markApplicant(orderId);
        uint256 treasuryBefore = usdc.balanceOf(address(treasury));
        vm.prank(payer);
        escrow.cancel(orderId);
        assertEq(usdc.balanceOf(address(treasury)) - treasuryBefore, 10 * USDC);
    }

    function test_cancelFeeNeverExceedsTheDeposit() public {
        uint256 orderId = _createUsdc(USDC / 4);
        _markApplicant(orderId);
        uint256 payerBefore = usdc.balanceOf(payer);
        vm.prank(payer);
        escrow.cancel(orderId);
        assertEq(usdc.balanceOf(payer), payerBefore);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_applicantFeeCanBeSwitchedOffByVote() public {
        _setParameter(ParameterKeys.CANCEL_APPLICANT_BPS, 0);
        uint256 orderId = _createUsdc(100 * USDC);
        _markApplicant(orderId);
        uint256 payerBefore = usdc.balanceOf(payer);
        vm.prank(payer);
        escrow.cancel(orderId);
        assertEq(usdc.balanceOf(payer) - payerBefore, 100 * USDC);
    }

    function test_reservedOrderWithApplicantsPaysTheSameFeeToTheTreasury() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _markApplicant(orderId);
        _reserve(orderId);
        vm.warp(block.timestamp + 30 days);
        uint256 treasuryBefore = usdc.balanceOf(address(treasury));
        vm.prank(payer);
        escrow.cancel(orderId);
        assertEq(usdc.balanceOf(address(treasury)) - treasuryBefore, 2 * USDC);
        assertEq(usdc.balanceOf(payee), 0);
    }

    function test_withdrawnReservationStillCountsAsAnApplication() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _markApplicant(orderId);
        _reserve(orderId);
        vm.prank(payee);
        escrow.withdrawReservation(orderId);
        uint256 treasuryBefore = usdc.balanceOf(address(treasury));
        vm.prank(payer);
        escrow.cancel(orderId);
        assertEq(usdc.balanceOf(address(treasury)) - treasuryBefore, 2 * USDC);
    }

    function test_cancelCashOrderKeepsPublicationFeeAndNeverChargesTheApplicantFee() public {
        CreateParams memory p = _params(address(usdt), 200 * USDC);
        p.mode = PaymentMode.Cash;
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(p, _noAuth());
        _markApplicant(orderId);
        uint256 feePaid = usdt.balanceOf(address(treasury));
        uint256 payerBefore = usdt.balanceOf(payer);

        vm.prank(payer);
        escrow.cancel(orderId);

        assertEq(usdt.balanceOf(address(treasury)), feePaid);
        assertEq(usdt.balanceOf(payer), payerBefore);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Cancelled));
    }

    // ---- Marcar la orden ----

    function test_onlyTheMarkerCanMarkAnOrder() public {
        uint256 orderId = _createUsdc(100 * USDC);
        vm.prank(payer);
        vm.expectRevert();
        escrow.markApplicant(orderId);
        assertFalse(escrow.hadApplicants(orderId));
    }

    function test_markingEmitsOnceAndIsIdempotent() public {
        uint256 orderId = _createUsdc(100 * USDC);
        vm.expectEmit(true, false, false, false);
        emit IEscrowEvents.ApplicantsMarked(orderId);
        _markApplicant(orderId);
        _markApplicant(orderId);
        assertTrue(escrow.hadApplicants(orderId));
    }

    function test_cannotMarkAnUnknownOrderOrOneAlreadyAgreed() public {
        vm.prank(marker);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.UnknownOrder.selector, 99));
        escrow.markApplicant(99);

        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);
        vm.prank(marker);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Agreed));
        escrow.markApplicant(orderId);
    }

    // ---- Después de acordar ----

    function _createStarting(uint256 amount, uint40 startsAt) internal returns (uint256 orderId) {
        CreateParams memory p = _params(address(usdc), amount);
        p.startsAt = startsAt;
        DepositAuth memory auth = _permitAuth(amount);
        vm.prank(payer);
        orderId = escrow.createOrder(p, auth);
    }

    function test_agreedCancelWithEnoughNoticeCostsTwoPercentToTheTreasuryNotThePayee() public {
        uint256 orderId = _createStarting(100 * USDC, uint40(block.timestamp + 3 days));
        _agree(orderId, 100 * USDC);
        uint256 payerBefore = usdc.balanceOf(payer);
        uint256 treasuryBefore = usdc.balanceOf(address(treasury));

        vm.prank(payer);
        escrow.cancel(orderId);

        assertEq(usdc.balanceOf(address(treasury)) - treasuryBefore, 2 * USDC);
        assertEq(usdc.balanceOf(payer) - payerBefore, 98 * USDC);
        assertEq(usdc.balanceOf(payee), 0);
    }

    function test_agreedCancelCloseToTheStartPaysTheProviderTenPercent() public {
        uint256 orderId = _createStarting(100 * USDC, uint40(block.timestamp + 2 days));
        _agree(orderId, 100 * USDC);
        vm.warp(block.timestamp + 2 days - 23 hours);
        uint256 payerBefore = usdc.balanceOf(payer);
        uint256 treasuryBefore = usdc.balanceOf(address(treasury));

        vm.prank(payer);
        escrow.cancel(orderId);

        assertEq(usdc.balanceOf(payee), 8 * USDC);
        assertEq(usdc.balanceOf(address(treasury)) - treasuryBefore, 2 * USDC);
        assertEq(usdc.balanceOf(payer) - payerBefore, 90 * USDC);
    }

    function test_agreedCancelWithoutAStartDateIsCheapOnlyDuringTheFirstDay() public {
        uint256 first = _createUsdc(100 * USDC);
        _agree(first, 100 * USDC);
        vm.warp(block.timestamp + 23 hours);
        uint256 treasuryBefore = usdc.balanceOf(address(treasury));
        vm.prank(payer);
        escrow.cancel(first);
        assertEq(usdc.balanceOf(address(treasury)) - treasuryBefore, 2 * USDC);
        assertEq(usdc.balanceOf(payee), 0);

        uint256 second = _createUsdc(100 * USDC);
        _agree(second, 100 * USDC);
        vm.warp(block.timestamp + 25 hours);
        vm.prank(payer);
        escrow.cancel(second);
        assertEq(usdc.balanceOf(payee), 8 * USDC);
    }

    function test_agreedCashCancelIsFree() public {
        CreateParams memory p = _params(address(usdt), 200 * USDC);
        p.mode = PaymentMode.Cash;
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(p, _noAuth());
        _agree(orderId, 200 * USDC);
        vm.prank(payer);
        escrow.cancel(orderId);
        assertEq(usdt.balanceOf(payee), 0);
    }

    function test_theProviderCancellingStillRefundsEverythingAndOnlyCostsReputation() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);
        uint256 payerBefore = usdc.balanceOf(payer);
        vm.prank(payee);
        escrow.cancel(orderId);
        assertEq(usdc.balanceOf(payer) - payerBefore, 100 * USDC);
        assertEq(usdc.balanceOf(payee), 0);
    }

    function testFuzz_cancelNeverTakesMoreThanTheDepositAndAddsUp(uint96 amountSeed, bool applicants) public {
        uint256 amount = bound(amountSeed, 1, 9_000 * USDC);
        uint256 orderId = _createUsdc(amount);
        if (applicants) _markApplicant(orderId);
        uint256 payerBefore = usdc.balanceOf(payer);
        uint256 treasuryBefore = usdc.balanceOf(address(treasury));
        vm.prank(payer);
        escrow.cancel(orderId);
        uint256 charged = usdc.balanceOf(address(treasury)) - treasuryBefore;
        assertLe(charged, 10 * USDC);
        assertLe(charged, amount);
        assertEq((usdc.balanceOf(payer) - payerBefore) + charged, amount);
        if (!applicants) assertEq(charged, 0);
    }
}
