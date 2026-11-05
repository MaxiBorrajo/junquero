// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {IEscrowEvents} from "../src/interfaces/IEscrowEvents.sol";
import {MockBlockableToken} from "./mocks/MockBlockableToken.sol";
import {
    Order,
    OrderStatus,
    DepositMethod,
    CreateParams,
    Release,
    PaymentMode,
    Modality
} from "../src/libraries/OrderTypes.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";

contract EscrowClaimableTest is EscrowBase {
    MockBlockableToken internal blk;

    function setUp() public override {
        super.setUp();
        blk = new MockBlockableToken();
        _configure(address(blk), DepositMethod.Allowance);
        blk.mint(payer, 10_000 * USDC);
        vm.prank(payer);
        blk.approve(address(escrow), type(uint256).max);
    }

    function _createBlk(uint256 amount) internal returns (uint256 orderId) {
        vm.prank(payer);
        orderId = escrow.createOrder(_params(address(blk), amount), _noAuth());
    }

    function _agreeAndDeliver(uint256 orderId, uint256 price) internal {
        _agree(orderId, price);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
    }

    function _releaseAsPayee(uint256 orderId, uint256 amount) internal {
        (Release memory r, bytes memory sig) = _release(orderId, amount, 5);
        vm.prank(payee);
        escrow.release(r, sig);
    }

    function test_blockedPayeeDoesNotBlockSettlement() public {
        uint256 orderId = _createBlk(100 * USDC);
        _agreeAndDeliver(orderId, 80 * USDC);
        blk.setBlocked(payee, true);

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.PayoutDeferred(address(blk), payee, 80 * USDC);
        _releaseAsPayee(orderId, 80 * USDC);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
        assertEq(blk.balanceOf(payee), 0);
        assertEq(escrow.claimable(address(blk), payee), 80 * USDC);
        assertEq(blk.balanceOf(address(escrow)), 80 * USDC);
    }

    function test_blockedPayeeStillLetsTheRefundThrough() public {
        uint256 orderId = _createBlk(100 * USDC);
        _agree(orderId, 60 * USDC);
        uint256 payerBefore = blk.balanceOf(payer);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
        blk.setBlocked(payee, true);
        _releaseAsPayee(orderId, 60 * USDC);

        assertEq(blk.balanceOf(payer), payerBefore);
        assertEq(escrow.claimable(address(blk), payee), 60 * USDC);
    }

    function test_claimPaysTheAccountOnceUnblocked() public {
        uint256 orderId = _createBlk(100 * USDC);
        _agreeAndDeliver(orderId, 100 * USDC);
        blk.setBlocked(payee, true);
        _releaseAsPayee(orderId, 100 * USDC);
        blk.setBlocked(payee, false);

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.Claimed(address(blk), payee, 100 * USDC);
        vm.prank(other);
        escrow.claim(address(blk), payee);

        assertEq(blk.balanceOf(payee), 100 * USDC);
        assertEq(blk.balanceOf(other), 0);
        assertEq(escrow.claimable(address(blk), payee), 0);
        assertEq(blk.balanceOf(address(escrow)), 0);
    }

    function test_claimWhileStillBlockedRevertsAndKeepsTheBalance() public {
        uint256 orderId = _createBlk(100 * USDC);
        _agreeAndDeliver(orderId, 100 * USDC);
        blk.setBlocked(payee, true);
        _releaseAsPayee(orderId, 100 * USDC);

        vm.expectRevert(abi.encodeWithSelector(MockBlockableToken.Blocked.selector, payee));
        escrow.claim(address(blk), payee);

        assertEq(escrow.claimable(address(blk), payee), 100 * USDC);
        assertEq(blk.balanceOf(address(escrow)), 100 * USDC);
    }

    function test_claimRevertsWithNothingToClaim() public {
        vm.expectRevert(IEscrowEvents.NothingToClaim.selector);
        escrow.claim(address(blk), payee);
    }

    function test_claimCannotBeRepeated() public {
        uint256 orderId = _createBlk(100 * USDC);
        _agreeAndDeliver(orderId, 100 * USDC);
        blk.setBlocked(payee, true);
        _releaseAsPayee(orderId, 100 * USDC);
        blk.setBlocked(payee, false);

        escrow.claim(address(blk), payee);
        vm.expectRevert(IEscrowEvents.NothingToClaim.selector);
        escrow.claim(address(blk), payee);
    }

    function test_silentFailureOfTheTokenIsAlsoDeferred() public {
        uint256 orderId = _createBlk(100 * USDC);
        _agreeAndDeliver(orderId, 100 * USDC);
        blk.setBlocked(payee, true);
        blk.setSilent(true);
        _releaseAsPayee(orderId, 100 * USDC);

        assertEq(escrow.claimable(address(blk), payee), 100 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
    }

    function test_blockedTreasuryDefersTheFee() public {
        _setParameter(ParameterKeys.FEE_BPS, 100);
        uint256 orderId = _createBlk(100 * USDC);
        _agreeAndDeliver(orderId, 100 * USDC);
        blk.setBlocked(address(treasury), true);
        _releaseAsPayee(orderId, 100 * USDC);

        uint256 fee = escrow.claimable(address(blk), address(treasury));
        assertEq(fee, 1 * USDC);
        assertEq(blk.balanceOf(payee), 99 * USDC);

        blk.setBlocked(address(treasury), false);
        escrow.claim(address(blk), address(treasury));
        assertEq(blk.balanceOf(address(treasury)), fee);
    }

    function test_blockedPayerStillGetsTheCancelRefundAsClaimable() public {
        uint256 orderId = _createBlk(100 * USDC);
        blk.setBlocked(payer, true);

        vm.prank(payer);
        escrow.cancel(orderId);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Cancelled));
        assertEq(escrow.claimable(address(blk), payer), 100 * USDC);
    }

    function test_blockedPayeeKeepsTheCancelCompensationClaimable() public {
        uint256 orderId = _createBlk(100 * USDC);
        _agree(orderId, 100 * USDC);
        blk.setBlocked(payee, true);

        vm.prank(payer);
        escrow.cancel(orderId);

        uint256 compensation = (100 * USDC * 1000 / 10_000) * 8000 / 10_000;
        assertEq(escrow.claimable(address(blk), payee), compensation);
    }

    function test_cashFeeToBlockedTreasuryDoesNotBlockPublishing() public {
        blk.setBlocked(address(treasury), true);
        CreateParams memory params = _params(address(blk), 100 * USDC);
        params.mode = PaymentMode.Cash;
        params.modality = Modality.OnSite;

        vm.prank(payer);
        uint256 orderId = escrow.createOrder(params, _noAuth());

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Open));
        assertGt(escrow.claimable(address(blk), address(treasury)), 0);
    }

    function test_escrowBalanceAlwaysCoversDepositsAndClaimables() public {
        uint256 first = _createBlk(100 * USDC);
        uint256 second = _createBlk(50 * USDC);
        _agreeAndDeliver(first, 100 * USDC);
        blk.setBlocked(payee, true);
        _releaseAsPayee(first, 100 * USDC);

        uint256 locked = _order(second).deposited;
        uint256 claimables = escrow.claimable(address(blk), payee);
        assertEq(blk.balanceOf(address(escrow)), locked + claimables);
    }

    function testFuzz_deferredPlusDeliveredEqualsDeposit(uint96 amountSeed, bool blockPayee) public {
        uint256 amount = bound(amountSeed, 1, 5_000 * USDC);
        uint256 orderId = _createBlk(amount);
        _agreeAndDeliver(orderId, amount);
        blk.setBlocked(payee, blockPayee);
        _releaseAsPayee(orderId, amount);

        uint256 total = blk.balanceOf(payee) + escrow.claimable(address(blk), payee);
        assertEq(total, amount);
        assertEq(blk.balanceOf(address(escrow)), escrow.claimable(address(blk), payee));
    }
}
