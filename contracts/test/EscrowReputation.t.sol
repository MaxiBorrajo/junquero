// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {Reputation} from "../src/Reputation.sol";
import {IParameterRegistry} from "../src/interfaces/IParameterRegistry.sol";
import {IReputation, Role, Stats} from "../src/interfaces/IReputation.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {OrderStatus, PaymentMode, CreateParams, DepositAuth, Release} from "../src/libraries/OrderTypes.sol";

contract EscrowReputationTest is EscrowBase {
    Reputation internal reputation;

    function setUp() public override {
        super.setUp();
        vm.prank(admin);
        registry.defineParameter(ParameterKeys.REPUTATION_PAIR_CAP, 1, 10, 2);
        reputation = new Reputation(admin, IParameterRegistry(address(registry)));
        bytes32 recorderRole = reputation.RECORDER_ROLE();
        vm.startPrank(admin);
        reputation.grantRole(recorderRole, address(escrow));
        escrow.setReputation(reputation);
        vm.stopPrank();
    }

    function _deliver(uint256 orderId) internal {
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
    }

    function test_setReputationRequiresTheAdminRole() public {
        vm.prank(other);
        vm.expectRevert();
        escrow.setReputation(reputation);
    }

    function test_setReputationEmitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit IEscrow.ReputationUpdated(address(0));
        vm.prank(admin);
        escrow.setReputation(IReputation(address(0)));
        assertEq(address(escrow.reputation()), address(0));
    }

    function test_settlementIsRecordedForBothSides() public {
        _settleFlow(100 * USDC);

        assertEq(reputation.stats(payee, Role.Provider).closed, 1);
        assertEq(reputation.stats(payee, Role.Provider).ratingSum, 5);
        assertEq(reputation.stats(payer, Role.Requester).closed, 1);
        assertEq(reputation.closedWithoutDispute(payee), 1);
    }

    function test_settlementAtTheMinimumDoesNotQualify() public {
        _settleFlow(5 * USDC);

        assertEq(reputation.stats(payee, Role.Provider).closed, 0);
        assertEq(reputation.pairCount(payer, payee), 0);
    }

    function test_settlementJustAboveTheMinimumQualifies() public {
        _settleFlow(5 * USDC + 1);

        assertEq(reputation.stats(payee, Role.Provider).closed, 1);
    }

    function test_automaticReleaseIsRecordedAsNeutral() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);
        _deliver(orderId);
        vm.warp(block.timestamp + 24 hours);
        escrow.autoRelease(orderId);

        Stats memory provider = reputation.stats(payee, Role.Provider);
        assertEq(provider.closed, 1);
        assertEq(provider.ratingCount, 0);
    }

    function test_thirdSettlementWithTheSameCounterpartDoesNotCount() public {
        _settleFlow(100 * USDC);
        _settleFlow(100 * USDC);
        _settleFlow(100 * USDC);

        assertEq(reputation.stats(payee, Role.Provider).closed, 2);
        assertEq(reputation.pairCount(payer, payee), 2);
    }

    function test_cashSettlementIsRecordedApart() public {
        CreateParams memory params = _params(address(usdc), 100 * USDC);
        params.mode = PaymentMode.Cash;
        DepositAuth memory auth = _permitAuth(7 * USDC);
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(params, auth);
        _agree(orderId, 100 * USDC);
        (Release memory r, bytes memory sig) = _release(orderId, 100 * USDC, 4);
        vm.prank(payee);
        escrow.release(r, sig);

        Stats memory provider = reputation.stats(payee, Role.Provider);
        assertEq(provider.cashClosed, 1);
        assertEq(provider.closed, 0);
    }

    function test_providerCancellationCountsAsAFailure() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);
        vm.prank(payee);
        escrow.cancel(orderId);

        assertEq(reputation.stats(payee, Role.Provider).failures, 1);
        assertEq(reputation.stats(payer, Role.Requester).failures, 0);
    }

    function test_expiredDeadlineCountsAsAProviderFailure() public {
        CreateParams memory params = _params(address(usdc), 100 * USDC);
        params.deadline = uint40(block.timestamp + 2 days);
        DepositAuth memory auth = _permitAuth(100 * USDC);
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(params, auth);
        _agree(orderId, 100 * USDC);
        vm.warp(block.timestamp + 3 days);
        vm.prank(payer);
        escrow.reclaim(orderId);

        assertEq(reputation.stats(payee, Role.Provider).failures, 1);
    }

    function test_noShowCountsAsARequesterFailure() public {
        CreateParams memory params = _params(address(usdc), 100 * USDC);
        params.startsAt = uint40(block.timestamp + 1 days);
        DepositAuth memory auth = _permitAuth(100 * USDC);
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(params, auth);
        _agree(orderId, 100 * USDC);
        vm.warp(block.timestamp + 1 days);
        vm.prank(payee);
        escrow.checkIn(orderId);
        vm.warp(block.timestamp + 20 minutes);
        vm.prank(payee);
        escrow.claimNoShow(orderId);

        assertEq(reputation.stats(payer, Role.Requester).failures, 1);
        assertEq(reputation.stats(payee, Role.Provider).failures, 0);
    }

    function test_requesterCancellationIsNotAFailureRecord() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);
        vm.prank(payer);
        escrow.cancel(orderId);

        assertEq(reputation.stats(payer, Role.Requester).failures, 0);
        assertEq(reputation.stats(payee, Role.Provider).failures, 0);
    }

    function test_cancelBeforeAgreementRecordsNothing() public {
        uint256 orderId = _createUsdc(100 * USDC);
        vm.prank(payer);
        escrow.cancel(orderId);

        assertEq(reputation.stats(payer, Role.Requester).failures, 0);
    }

    function test_failingReputationNeverBlocksThePayment() public {
        bytes32 recorderRole = reputation.RECORDER_ROLE();
        vm.prank(admin);
        reputation.revokeRole(recorderRole, address(escrow));

        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);
        _deliver(orderId);
        (Release memory r, bytes memory sig) = _release(orderId, 100 * USDC, 5);

        vm.expectEmit(true, false, false, true);
        emit IEscrow.HookFailed(orderId, IReputation.recordSettled.selector);
        vm.prank(payee);
        escrow.release(r, sig);

        assertEq(usdc.balanceOf(payee), 100 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
    }

    function test_failingReputationNeverBlocksACancellation() public {
        bytes32 recorderRole = reputation.RECORDER_ROLE();
        vm.prank(admin);
        reputation.revokeRole(recorderRole, address(escrow));

        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);

        vm.expectEmit(true, false, false, true);
        emit IEscrow.HookFailed(orderId, IReputation.recordFailure.selector);
        vm.prank(payee);
        escrow.cancel(orderId);

        assertEq(usdc.balanceOf(payer), 10_000 * USDC);
    }

    function test_withoutReputationEverythingStillWorks() public {
        vm.prank(admin);
        escrow.setReputation(IReputation(address(0)));

        uint256 orderId = _settleFlow(100 * USDC);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
        assertEq(reputation.stats(payee, Role.Provider).closed, 0);
    }

    function test_settlementRecordsTheSettledTimestampAndPayout() public {
        uint256 orderId = _settleFlow(100 * USDC);

        assertEq(_order(orderId).settledAt, block.timestamp);
        assertTrue(_order(orderId).paidOut);
    }
}
