// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {IEscrowEvents} from "../src/interfaces/IEscrowEvents.sol";
import {Order, OrderStatus, PaymentMode, CreateParams, DepositAuth, Agreement} from "../src/libraries/OrderTypes.sol";

contract EscrowModerateTest is EscrowBase {
    bytes32 internal constant REASON = keccak256("prohibited");

    function test_moderateOpenOrderRefundsEverything() public {
        uint256 orderId = _createUsdc(100 * USDC);
        uint256 before = usdc.balanceOf(payer);

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.OrderModerated(orderId, moderator, REASON);
        vm.prank(moderator);
        escrow.moderate(orderId, REASON);

        assertEq(usdc.balanceOf(payer) - before, 100 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Cancelled));
    }

    function test_moderateEmitsCancellationWithModeratedReason() public {
        uint256 orderId = _createUsdc(100 * USDC);

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.OrderCancelled(orderId, moderator, 3 + 1, 0, 0, uint128(100 * USDC));
        vm.prank(moderator);
        escrow.moderate(orderId, REASON);
    }

    function test_moderateReservedOrderPaysNoCompensation() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _reserve(orderId);
        vm.warp(block.timestamp + 30 days);
        assertGt(escrow.reservationCompensation(orderId), 0);

        vm.prank(moderator);
        escrow.moderate(orderId, REASON);

        assertEq(usdc.balanceOf(payee), 0);
        assertEq(usdc.balanceOf(payer), 10_000 * USDC);
    }

    function test_moderateRevertsAfterAgreement() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);

        vm.prank(moderator);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Agreed));
        escrow.moderate(orderId, REASON);
    }

    function test_moderateRevertsAfterDelivery() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);

        vm.prank(moderator);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Delivered));
        escrow.moderate(orderId, REASON);
    }

    function test_moderateRevertsOnUnknownOrder() public {
        vm.prank(moderator);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.UnknownOrder.selector, 99));
        escrow.moderate(99, REASON);
    }

    function test_moderateRequiresTheModeratorRole() public {
        uint256 orderId = _createUsdc(100 * USDC);
        bytes32 role = escrow.MODERATOR_ROLE();

        vm.prank(payer);
        vm.expectRevert();
        escrow.moderate(orderId, REASON);

        vm.prank(other);
        vm.expectRevert();
        escrow.moderate(orderId, REASON);

        assertFalse(escrow.hasRole(role, other));
        assertTrue(escrow.hasRole(role, admin));
    }

    function test_moderateCannotRepeat() public {
        uint256 orderId = _createUsdc(100 * USDC);
        vm.startPrank(moderator);
        escrow.moderate(orderId, REASON);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Cancelled));
        escrow.moderate(orderId, REASON);
        vm.stopPrank();
    }

    function test_moderatedOrderCannotBeAgreed() public {
        uint256 orderId = _createUsdc(100 * USDC);
        vm.prank(moderator);
        escrow.moderate(orderId, REASON);

        Agreement memory a = _agreement(orderId, 100 * USDC);
        bytes32 structHash = _agreementHash(a);
        bytes memory payerSig = _sign(payerKey, structHash);
        bytes memory payeeSig = _sign(payeeKey, structHash);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Cancelled));
        escrow.agree(a, payerSig, payeeSig);
    }

    function test_moderateCashOrderKeepsThePublicationFee() public {
        CreateParams memory params = _params(address(usdc), 100 * USDC);
        params.mode = PaymentMode.Cash;
        DepositAuth memory auth = _permitAuth(7 * USDC);
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(params, auth);
        uint256 treasuryBefore = usdc.balanceOf(address(treasury));
        assertGt(treasuryBefore, 0);

        vm.prank(moderator);
        escrow.moderate(orderId, REASON);

        assertEq(usdc.balanceOf(address(treasury)), treasuryBefore);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Cancelled));
    }
}
