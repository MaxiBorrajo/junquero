// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {IEscrowEvents} from "../src/interfaces/IEscrowEvents.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {Order, OrderStatus, PaymentMode, CreateParams, Release} from "../src/libraries/OrderTypes.sol";

contract EscrowSettleTest is EscrowBase {
    function _agreedOrder(uint256 amount) internal returns (uint256 orderId) {
        orderId = _createUsdc(amount);
        _agree(orderId, amount);
    }

    function test_releasePaysPayeeWithZeroFee() public {
        uint256 orderId = _agreedOrder(100 * USDC);
        (Release memory r, bytes memory sig) = _release(orderId, 100 * USDC, 5);

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.OrderSettled(orderId, payee, uint128(100 * USDC), 0, 0, 5, false);
        vm.prank(payee);
        escrow.release(r, sig);

        assertEq(usdc.balanceOf(payee), 100 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
    }

    function test_releaseChargesFeeWithinFloorAndCap() public {
        _setParameter(ParameterKeys.FEE_BPS, 100);

        uint256 tiny = _agreedOrder(10 * USDC);
        (Release memory rt, bytes memory st) = _release(tiny, 10 * USDC, 4);
        vm.prank(payee);
        escrow.release(rt, st);
        assertEq(usdc.balanceOf(address(treasury)), USDC / 4);

        uint256 huge = _agreedOrder(9_000 * USDC);
        (Release memory rh, bytes memory sh) = _release(huge, 9_000 * USDC, 4);
        vm.prank(payee);
        escrow.release(rh, sh);
        assertEq(usdc.balanceOf(address(treasury)), USDC / 4 + 5 * USDC);

        uint256 normal = _agreedOrder(100 * USDC);
        (Release memory rn, bytes memory sn) = _release(normal, 100 * USDC, 4);
        vm.prank(payee);
        escrow.release(rn, sn);
        assertEq(usdc.balanceOf(address(treasury)), USDC / 4 + 5 * USDC + USDC);
    }

    function test_releasePartialAmountReturnsRemainderToPayer() public {
        uint256 orderId = _agreedOrder(100 * USDC);
        uint256 payerBefore = usdc.balanceOf(payer);
        (Release memory r, bytes memory sig) = _release(orderId, 60 * USDC, 3);
        vm.prank(payee);
        escrow.release(r, sig);

        assertEq(usdc.balanceOf(payee), 60 * USDC);
        assertEq(usdc.balanceOf(payer) - payerBefore, 40 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_releaseCannotBeUsedByAnotherAccount() public {
        uint256 orderId = _agreedOrder(100 * USDC);
        (Release memory r, bytes memory sig) = _release(orderId, 100 * USDC, 5);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotPayee.selector, other));
        escrow.release(r, sig);
    }

    function test_releaseCannotBeReplayed() public {
        uint256 orderId = _agreedOrder(100 * USDC);
        (Release memory r, bytes memory sig) = _release(orderId, 100 * USDC, 5);
        vm.startPrank(payee);
        escrow.release(r, sig);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Settled));
        escrow.release(r, sig);
        vm.stopPrank();
    }

    function test_releaseRevertsWhenExpired() public {
        uint256 orderId = _agreedOrder(100 * USDC);
        (Release memory r, bytes memory sig) = _release(orderId, 100 * USDC, 5);
        vm.warp(r.expiry + 1);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.SignatureExpired.selector, r.expiry));
        escrow.release(r, sig);
    }

    function test_releaseRevertsOnForgedSignature() public {
        uint256 orderId = _agreedOrder(100 * USDC);
        (Release memory r,) = _release(orderId, 100 * USDC, 5);
        bytes memory forged = _sign(payeeKey, _releaseHash(r));
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidSignature.selector, payer));
        escrow.release(r, forged);
    }

    function test_releaseRevertsWhenAmountIsAlteredAfterSigning() public {
        uint256 orderId = _agreedOrder(100 * USDC);
        (Release memory r, bytes memory sig) = _release(orderId, 50 * USDC, 5);
        r.amount = uint128(100 * USDC);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidSignature.selector, payer));
        escrow.release(r, sig);
    }

    function test_releaseRevertsOnAmountAbovePrice() public {
        uint256 orderId = _agreedOrder(100 * USDC);
        (Release memory r, bytes memory sig) = _release(orderId, 101 * USDC, 5);
        vm.prank(payee);
        vm.expectRevert(
            abi.encodeWithSelector(IEscrowEvents.ReleaseAmountExceedsPrice.selector, 101 * USDC, 100 * USDC)
        );
        escrow.release(r, sig);
    }

    function test_releaseRevertsOnInvalidRating() public {
        uint256 orderId = _agreedOrder(100 * USDC);
        (Release memory zero, bytes memory zeroSig) = _release(orderId, 100 * USDC, 0);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidRating.selector, 0));
        escrow.release(zero, zeroSig);

        (Release memory six, bytes memory sixSig) = _release(orderId, 100 * USDC, 6);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidRating.selector, 6));
        escrow.release(six, sixSig);
    }

    function test_releaseRevertsBeforeAgreement() public {
        uint256 orderId = _createUsdc(100 * USDC);
        (Release memory r, bytes memory sig) = _release(orderId, 100 * USDC, 5);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Open));
        escrow.release(r, sig);
    }

    function test_releaseWorksAfterDelivery() public {
        uint256 orderId = _agreedOrder(100 * USDC);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
        (Release memory r, bytes memory sig) = _release(orderId, 100 * USDC, 5);
        vm.prank(payee);
        escrow.release(r, sig);
        assertEq(usdc.balanceOf(payee), 100 * USDC);
    }

    function test_releaseClosesCashOrderWithoutMovingFunds() public {
        CreateParams memory p = _params(address(usdt), 200 * USDC);
        p.mode = PaymentMode.Cash;
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(p, _noAuth());
        _agree(orderId, 200 * USDC);
        uint256 treasuryBefore = usdt.balanceOf(address(treasury));
        (Release memory r, bytes memory sig) = _release(orderId, 200 * USDC, 5);

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.OrderSettled(orderId, payee, 0, 0, 0, 5, false);
        vm.prank(payee);
        escrow.release(r, sig);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
        assertEq(usdt.balanceOf(address(treasury)), treasuryBefore);
        assertEq(usdt.balanceOf(payee), 0);
    }

    function test_deliverRevertsOnCashOrder() public {
        CreateParams memory p = _params(address(usdt), 200 * USDC);
        p.mode = PaymentMode.Cash;
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(p, _noAuth());
        _agree(orderId, 200 * USDC);
        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.UnsupportedForMode.selector);
        escrow.deliver(orderId, EVIDENCE);
    }

    function test_deliverStoresEvidenceAndStartsClock() public {
        uint256 orderId = _agreedOrder(100 * USDC);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
        Order memory order = _order(orderId);
        assertEq(uint8(order.status), uint8(OrderStatus.Delivered));
        assertEq(order.evidenceHash, EVIDENCE);
        assertEq(order.deliveredAt, block.timestamp);
    }

    function test_deliverOnlyByPayee() public {
        uint256 orderId = _agreedOrder(100 * USDC);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotPayee.selector, payer));
        escrow.deliver(orderId, EVIDENCE);
    }

    function test_deliverRequiresEvidence() public {
        uint256 orderId = _agreedOrder(100 * USDC);
        vm.prank(payee);
        vm.expectRevert(IEscrowEvents.EvidenceRequired.selector);
        escrow.deliver(orderId, bytes32(0));
    }

    function test_deliverCannotRepeat() public {
        uint256 orderId = _agreedOrder(100 * USDC);
        vm.startPrank(payee);
        escrow.deliver(orderId, EVIDENCE);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Delivered));
        escrow.deliver(orderId, EVIDENCE);
        vm.stopPrank();
    }

    function test_autoReleaseAfterWindowPaysWithNeutralRating() public {
        uint256 orderId = _agreedOrder(100 * USDC);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);

        vm.warp(block.timestamp + 24 hours);
        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.OrderSettled(orderId, payee, uint128(100 * USDC), 0, 0, 0, true);
        vm.prank(relayer);
        escrow.autoRelease(orderId);

        assertEq(usdc.balanceOf(payee), 100 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
    }

    function test_autoReleaseRevertsBeforeWindow() public {
        uint256 orderId = _agreedOrder(100 * USDC);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
        uint40 readyAt = uint40(block.timestamp + 24 hours);

        vm.warp(block.timestamp + 24 hours - 1);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.AutoReleaseNotReady.selector, readyAt));
        escrow.autoRelease(orderId);
    }

    function test_autoReleaseRevertsWithoutDelivery() public {
        uint256 orderId = _agreedOrder(100 * USDC);
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Agreed));
        escrow.autoRelease(orderId);
    }

    function test_autoReleaseUsesWindowFromRegistry() public {
        _setParameter(ParameterKeys.AUTO_RELEASE_SHORT, 2 hours);
        uint256 orderId = _agreedOrder(100 * USDC);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
        vm.warp(block.timestamp + 2 hours);
        escrow.autoRelease(orderId);
        assertEq(usdc.balanceOf(payee), 100 * USDC);
    }

    function testFuzz_releaseConservesFunds(uint96 priceSeed, uint96 amountSeed, uint16 feeBps) public {
        uint256 price = bound(priceSeed, 1, 5_000 * USDC);
        uint256 amount = bound(amountSeed, 0, price);
        _setParameter(ParameterKeys.FEE_BPS, uint64(bound(feeBps, 0, 200)));

        uint256 orderId = _agreedOrder(price);
        uint256 payerBefore = usdc.balanceOf(payer);
        (Release memory r, bytes memory sig) = _release(orderId, amount, 5);
        vm.prank(payee);
        escrow.release(r, sig);

        uint256 paid = usdc.balanceOf(payee);
        uint256 fee = usdc.balanceOf(address(treasury));
        uint256 refunded = usdc.balanceOf(payer) - payerBefore;
        assertEq(paid + fee + refunded, price);
        assertEq(paid + fee, amount);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }
}
