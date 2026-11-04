// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {Order, OrderStatus, Modality, CreateParams, DepositAuth, Release} from "../src/libraries/OrderTypes.sol";

contract EscrowChangesTest is EscrowBase {
    bytes32 internal constant REASON = keccak256("fix the logo");

    function _createRemote(uint256 amount) internal returns (uint256 orderId) {
        CreateParams memory params = _params(address(usdc), amount);
        params.modality = Modality.Remote;
        DepositAuth memory auth = _permitAuth(amount);
        vm.prank(payer);
        orderId = escrow.createOrder(params, auth);
    }

    function _deliveredRemote() internal returns (uint256 orderId) {
        orderId = _createRemote(100 * USDC);
        _agree(orderId, 100 * USDC);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
    }

    function _requestChanges(uint256 orderId) internal {
        vm.prank(payer);
        escrow.requestChanges(orderId, REASON);
    }

    function _redeliver(uint256 orderId) internal {
        vm.prank(payee);
        escrow.deliver(orderId, keccak256(abi.encode("v", block.timestamp)));
    }

    function test_requestChangesSendsTheOrderBackToTheProvider() public {
        uint256 orderId = _deliveredRemote();

        vm.expectEmit(true, false, false, true);
        emit IEscrow.ChangesRequested(orderId, REASON, 1);
        _requestChanges(orderId);

        Order memory order = _order(orderId);
        assertEq(uint8(order.status), uint8(OrderStatus.Agreed));
        assertEq(order.changeRequests, 1);
        assertEq(order.deliveredAt, 0);
        assertEq(order.evidenceHash, bytes32(0));
        assertEq(order.deposited, 100 * USDC);
    }

    function test_providerCanDeliverAgainAfterChanges() public {
        uint256 orderId = _deliveredRemote();
        _requestChanges(orderId);
        _redeliver(orderId);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Delivered));
    }

    function test_changesAllowedUpToTheParameter() public {
        uint256 orderId = _deliveredRemote();
        _requestChanges(orderId);
        _redeliver(orderId);
        _requestChanges(orderId);
        _redeliver(orderId);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.ChangeRequestsExhausted.selector, 2));
        escrow.requestChanges(orderId, REASON);
    }

    function test_changesDisabledWhenParameterIsZero() public {
        _setParameter(ParameterKeys.REQUEST_CHANGES_MAX, 0);
        uint256 orderId = _deliveredRemote();

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.ChangeRequestsExhausted.selector, 0));
        escrow.requestChanges(orderId, REASON);
    }

    function test_raisedParameterAllowsMoreRounds() public {
        _setParameter(ParameterKeys.REQUEST_CHANGES_MAX, 4);
        uint256 orderId = _deliveredRemote();
        for (uint256 i = 0; i < 4; i++) {
            _requestChanges(orderId);
            _redeliver(orderId);
        }
        assertEq(_order(orderId).changeRequests, 4);
    }

    function test_onlyThePayerCanRequestChanges() public {
        uint256 orderId = _deliveredRemote();

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.NotPayer.selector, payee));
        escrow.requestChanges(orderId, REASON);

        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.NotPayer.selector, other));
        escrow.requestChanges(orderId, REASON);
    }

    function test_onSiteOrdersCannotRequestChanges() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);

        vm.prank(payer);
        vm.expectRevert(IEscrow.ChangesNotAllowed.selector);
        escrow.requestChanges(orderId, REASON);
    }

    function test_requestChangesNeedsADeliveredOrder() public {
        uint256 orderId = _createRemote(100 * USDC);
        _agree(orderId, 100 * USDC);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.InvalidStatus.selector, orderId, OrderStatus.Agreed));
        escrow.requestChanges(orderId, REASON);
    }

    function test_requestChangesRevertsOnUnknownOrder() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.UnknownOrder.selector, 5));
        escrow.requestChanges(5, REASON);
    }

    function test_requestChangesRevertsExactlyWhenTheWindowCloses() public {
        uint256 orderId = _deliveredRemote();
        uint40 readyAt = _order(orderId).deliveredAt + 24 hours;

        vm.warp(readyAt - 1);
        _requestChanges(orderId);
        _redeliver(orderId);

        uint40 newReadyAt = _order(orderId).deliveredAt + 24 hours;
        vm.warp(newReadyAt);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.ReviewWindowClosed.selector, newReadyAt));
        escrow.requestChanges(orderId, REASON);
    }

    function test_reviewClockRestartsOnTheNewDelivery() public {
        uint256 orderId = _deliveredRemote();
        vm.warp(block.timestamp + 23 hours);
        _requestChanges(orderId);
        vm.warp(block.timestamp + 5 days);
        _redeliver(orderId);

        uint40 readyAt = _order(orderId).deliveredAt + 24 hours;
        vm.expectRevert(abi.encodeWithSelector(IEscrow.AutoReleaseNotReady.selector, readyAt));
        escrow.autoRelease(orderId);

        vm.warp(readyAt);
        escrow.autoRelease(orderId);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
    }

    function test_autoReleaseIsBlockedWhileChangesArePending() public {
        uint256 orderId = _deliveredRemote();
        _requestChanges(orderId);
        vm.warp(block.timestamp + 30 days);

        vm.expectRevert(abi.encodeWithSelector(IEscrow.InvalidStatus.selector, orderId, OrderStatus.Agreed));
        escrow.autoRelease(orderId);
    }

    function test_extensionStillWorksAfterChanges() public {
        uint256 orderId = _deliveredRemote();
        _requestChanges(orderId);
        _redeliver(orderId);

        vm.prank(payer);
        escrow.extendReview(orderId);
        uint40 readyAt = _order(orderId).deliveredAt + 48 hours;
        vm.warp(readyAt - 1);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.AutoReleaseNotReady.selector, readyAt));
        escrow.autoRelease(orderId);
    }

    function test_releaseAfterChangesPaysTheProvider() public {
        uint256 orderId = _deliveredRemote();
        _requestChanges(orderId);
        _redeliver(orderId);

        (Release memory r, bytes memory sig) = _release(orderId, 100 * USDC, 5);
        vm.prank(payee);
        escrow.release(r, sig);

        assertEq(usdc.balanceOf(payee), 100 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_changesCannotBeRequestedTwiceInTheSameDelivery() public {
        uint256 orderId = _deliveredRemote();
        _requestChanges(orderId);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.InvalidStatus.selector, orderId, OrderStatus.Agreed));
        escrow.requestChanges(orderId, REASON);
    }
}
