// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";
import {Receipt as JunqueroReceipt, ReceiptInfo} from "../src/Receipt.sol";
import {IERC5192} from "../src/interfaces/IERC5192.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {OrderStatus, PaymentMode, CreateParams, DepositAuth, Release} from "../src/libraries/OrderTypes.sol";

contract ReceiptTest is EscrowBase {
    JunqueroReceipt internal receipt;

    function setUp() public override {
        super.setUp();
        receipt = new JunqueroReceipt(IEscrow(address(escrow)), address(forwarder));
    }

    function test_constructorRejectsZeroEscrow() public {
        vm.expectRevert(JunqueroReceipt.ZeroAddress.selector);
        new JunqueroReceipt(IEscrow(address(0)), address(forwarder));
    }

    function test_payeeClaimsAnIntransferableReceipt() public {
        CreateParams memory params = _params(address(usdc), 100 * USDC);
        params.category = 4;
        DepositAuth memory auth = _permitAuth(100 * USDC);
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(params, auth);
        _agree(orderId, 100 * USDC);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
        (Release memory r, bytes memory sig) = _release(orderId, 100 * USDC, 5);
        vm.prank(payee);
        escrow.release(r, sig);

        uint32 month = receipt.monthOf(block.timestamp);
        vm.expectEmit(true, true, false, true);
        emit JunqueroReceipt.ReceiptClaimed(orderId, payee, 4, month);
        vm.prank(payee);
        receipt.claim(orderId);

        assertEq(receipt.ownerOf(orderId), payee);
        assertTrue(receipt.locked(orderId));
        ReceiptInfo memory info = receipt.info(orderId);
        assertEq(info.category, 4);
        assertEq(info.month, month);
    }

    function test_claimThroughTheForwarderAttributesThePayee() public {
        uint256 orderId = _settleFlow(100 * USDC);

        _forward(payeeKey, payee, address(receipt), abi.encodeCall(JunqueroReceipt.claim, (orderId)));

        assertEq(receipt.ownerOf(orderId), payee);
    }

    function test_claimRevertsBeforeSettlement() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(JunqueroReceipt.NotClaimable.selector, orderId));
        receipt.claim(orderId);
    }

    function test_claimRevertsOnUnknownOrder() public {
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(JunqueroReceipt.NotClaimable.selector, 42));
        receipt.claim(42);
    }

    function test_claimRevertsForCancelledOrders() public {
        uint256 orderId = _createUsdc(100 * USDC);
        vm.prank(payer);
        escrow.cancel(orderId);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(JunqueroReceipt.NotClaimable.selector, orderId));
        receipt.claim(orderId);
    }

    function test_claimRevertsForCashOrders() public {
        CreateParams memory params = _params(address(usdc), 100 * USDC);
        params.mode = PaymentMode.Cash;
        DepositAuth memory auth = _permitAuth(7 * USDC);
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(params, auth);
        _agree(orderId, 100 * USDC);
        (Release memory r, bytes memory sig) = _release(orderId, 100 * USDC, 5);
        vm.prank(payee);
        escrow.release(r, sig);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(JunqueroReceipt.NotClaimable.selector, orderId));
        receipt.claim(orderId);
    }

    function test_claimRevertsWhenNothingWasPaid() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
        (Release memory r, bytes memory sig) = _release(orderId, 0, 3);
        vm.prank(payee);
        escrow.release(r, sig);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(JunqueroReceipt.NotClaimable.selector, orderId));
        receipt.claim(orderId);
    }

    function test_onlyThePayeeCanClaim() public {
        uint256 orderId = _settleFlow(100 * USDC);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(JunqueroReceipt.NotPayee.selector, payer));
        receipt.claim(orderId);

        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(JunqueroReceipt.NotPayee.selector, other));
        receipt.claim(orderId);
    }

    function test_claimCannotBeRepeated() public {
        uint256 orderId = _settleFlow(100 * USDC);
        vm.startPrank(payee);
        receipt.claim(orderId);
        vm.expectRevert(abi.encodeWithSelector(JunqueroReceipt.AlreadyClaimed.selector, orderId));
        receipt.claim(orderId);
        vm.stopPrank();
    }

    function test_receiptCannotBeTransferred() public {
        uint256 orderId = _settleFlow(100 * USDC);
        vm.startPrank(payee);
        receipt.claim(orderId);
        vm.expectRevert(JunqueroReceipt.Soulbound.selector);
        receipt.transferFrom(payee, other, orderId);
        vm.expectRevert(JunqueroReceipt.Soulbound.selector);
        receipt.safeTransferFrom(payee, other, orderId);
        vm.stopPrank();
    }

    function test_infoRevertsForUnclaimedReceipt() public {
        vm.expectRevert();
        receipt.info(1);
    }

    function test_supportsErc5192() public view {
        assertTrue(receipt.supportsInterface(type(IERC5192).interfaceId));
        assertTrue(receipt.supportsInterface(0x80ac58cd));
    }

    function test_monthOfKnownDates() public view {
        assertEq(receipt.monthOf(0), 197_001);
        assertEq(receipt.monthOf(946_684_799), 199_912);
        assertEq(receipt.monthOf(951_782_400), 200_002);
        assertEq(receipt.monthOf(951_868_800), 200_003);
        assertEq(receipt.monthOf(1_709_164_800), 202_402);
        assertEq(receipt.monthOf(1_709_251_200), 202_403);
        assertEq(receipt.monthOf(1_793_750_400), 202_611);
        assertEq(receipt.monthOf(1_798_761_599), 202_612);
        assertEq(receipt.monthOf(1_798_761_600), 202_701);
    }

    function testFuzz_monthIsAlwaysAValidYearMonth(uint40 timestamp) public view {
        uint32 value = receipt.monthOf(timestamp);
        uint32 month = value % 100;
        assertGe(month, 1);
        assertLe(month, 12);
        assertGe(value / 100, 1970);
    }
}
