// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {IEscrowEvents} from "../src/interfaces/IEscrowEvents.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {Order, OrderStatus, PaymentMode, CreateParams} from "../src/libraries/OrderTypes.sol";

contract EscrowCancelTest is EscrowBase {
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

    function test_cancelReservationInsideGraceIsFree() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _reserve(orderId);
        vm.warp(block.timestamp + 12 hours);

        assertEq(escrow.reservationCompensation(orderId), 0);
        vm.prank(payer);
        escrow.cancel(orderId);
        assertEq(usdc.balanceOf(payee), 0);
    }

    function test_cancelReservationRampsUpLinearly() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _reserve(orderId);
        vm.warp(block.timestamp + 12 hours + 36 hours);

        uint256 expected = (100 * USDC * 200 / 10_000) / 2;
        assertEq(escrow.reservationCompensation(orderId), expected);

        uint256 payerBefore = usdc.balanceOf(payer);
        vm.prank(payer);
        escrow.cancel(orderId);
        assertEq(usdc.balanceOf(payee), expected);
        assertEq(usdc.balanceOf(payer) - payerBefore, 100 * USDC - expected);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_cancelReservationReachesMaximumAfterRamp() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _reserve(orderId);
        vm.warp(block.timestamp + 365 days);

        uint256 maximum = 100 * USDC * 200 / 10_000;
        assertEq(escrow.reservationCompensation(orderId), maximum);
        vm.prank(payer);
        escrow.cancel(orderId);
        assertEq(usdc.balanceOf(payee), maximum);
    }

    function test_cancelReservationCompensationRespectsTokenCap() public {
        uint256 orderId = _createUsdc(5_000 * USDC);
        _reserve(orderId);
        vm.warp(block.timestamp + 365 days);

        assertEq(escrow.reservationCompensation(orderId), 10 * USDC);
        vm.prank(payer);
        escrow.cancel(orderId);
        assertEq(usdc.balanceOf(payee), 10 * USDC);
    }

    function test_withdrawnReservationLeavesCancellationFree() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _reserve(orderId);
        vm.warp(block.timestamp + 10 days);
        vm.prank(payee);
        escrow.withdrawReservation(orderId);

        assertEq(escrow.reservationCompensation(orderId), 0);
        uint256 before = usdc.balanceOf(payer);
        vm.prank(payer);
        escrow.cancel(orderId);
        assertEq(usdc.balanceOf(payer) - before, 100 * USDC);
    }

    function test_cancelCashOrderKeepsPublicationFee() public {
        CreateParams memory p = _params(address(usdt), 200 * USDC);
        p.mode = PaymentMode.Cash;
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(p, _noAuth());
        uint256 feePaid = usdt.balanceOf(address(treasury));
        uint256 payerBefore = usdt.balanceOf(payer);

        vm.prank(payer);
        escrow.cancel(orderId);

        assertEq(usdt.balanceOf(address(treasury)), feePaid);
        assertEq(usdt.balanceOf(payer), payerBefore);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Cancelled));
    }

    function testFuzz_reservationCompensationNeverExceedsBounds(uint32 elapsed, uint96 amountSeed) public {
        uint256 amount = bound(amountSeed, 1, 9_000 * USDC);
        uint256 orderId = _createUsdc(amount);
        _reserve(orderId);
        vm.warp(block.timestamp + elapsed);

        uint256 compensation = escrow.reservationCompensation(orderId);
        assertLe(compensation, amount * 200 / 10_000);
        assertLe(compensation, 10 * USDC);

        uint256 payerBefore = usdc.balanceOf(payer);
        vm.prank(payer);
        escrow.cancel(orderId);
        assertEq(usdc.balanceOf(payee) + (usdc.balanceOf(payer) - payerBefore), amount);
    }
}
