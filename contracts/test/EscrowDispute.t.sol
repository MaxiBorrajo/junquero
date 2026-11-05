// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {IEscrowEvents} from "../src/interfaces/IEscrowEvents.sol";
import {IArbitration} from "../src/interfaces/IArbitration.sol";
import {IParameterRegistry} from "../src/interfaces/IParameterRegistry.sol";
import {IReputation, Role, Stats} from "../src/interfaces/IReputation.sol";
import {Reputation} from "../src/Reputation.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {MockArbitration} from "./mocks/MockArbitration.sol";
import {
    Order,
    OrderStatus,
    SizeClass,
    DepositAuth,
    DepositMethod,
    Dispute,
    Release,
    TokenConfig
} from "../src/libraries/OrderTypes.sol";

contract EscrowDisputeTest is EscrowBase {
    MockArbitration internal court;
    bytes32 internal constant REASON = keccak256("not what we agreed");
    uint256 internal constant FEE = USDC;

    function setUp() public virtual override {
        super.setUp();
        court = new MockArbitration(escrow);
        vm.prank(admin);
        escrow.setArbitration(IArbitration(address(court)));
    }

    function _delivered(uint256 price) internal returns (uint256 orderId) {
        orderId = _createUsdc(price);
        _agree(orderId, price);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
    }

    function _open(address who, uint256 orderId, uint256 feeAmount) internal {
        DepositAuth memory auth = feeAmount == 0 ? _noAuth() : _permitAuthFor(who, escrow, feeAmount);
        vm.prank(who);
        escrow.openDispute(orderId, REASON, auth);
    }

    function _permitAuthFor(address who, IEscrow target, uint256 amount) internal returns (DepositAuth memory) {
        uint256 key = who == payer ? payerKey : payeeKey;
        usdc.mint(who, amount);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                who,
                address(target),
                amount,
                usdc.nonces(who),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return
            DepositAuth({
                method: DepositMethod.Permit, nonce: 0, deadline: deadline, signature: abi.encodePacked(r, s, v)
            });
    }

    function _balanceSum() internal view returns (uint256) {
        return usdc.balanceOf(payer) + usdc.balanceOf(payee) + usdc.balanceOf(address(treasury))
            + usdc.balanceOf(address(court)) + usdc.balanceOf(address(escrow));
    }

    function test_smallDisputeSplitsFiftyFiftyAtOnce() public {
        uint256 orderId = _delivered(20 * USDC);
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.expectEmit(true, false, false, true);
        emit IEscrowEvents.DisputeResolved(orderId, 5000, uint128(10 * USDC), uint128(10 * USDC), 0, 0, true);
        _open(payer, orderId, 0);

        assertEq(usdc.balanceOf(payee), 10 * USDC);
        assertEq(usdc.balanceOf(payer) - payerBefore, 10 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
        assertTrue(_order(orderId).paidOut);
    }

    function test_smallDisputeCanBeOpenedByTheProvider() public {
        uint256 orderId = _delivered(10 * USDC);
        _open(payee, orderId, 0);

        assertEq(usdc.balanceOf(payee), 5 * USDC);
        assertEq(escrow.getDispute(orderId).claimant, payee);
    }

    function test_smallDisputeChargesTheProtocolFeeOnTheProvidersHalf() public {
        _setParameter(ParameterKeys.FEE_BPS, 200);
        uint256 orderId = _delivered(20 * USDC);
        _open(payer, orderId, 0);

        uint256 fee = escrow.tokenConfig(address(usdc)).feeFloor;
        uint256 computed = 10 * USDC * 200 / 10_000;
        uint256 expected = computed < fee ? fee : computed;
        assertEq(usdc.balanceOf(address(treasury)), expected);
        assertEq(usdc.balanceOf(payee), 10 * USDC - expected);
    }

    function test_smallDisputesAreCappedPerAccountAndMonth() public {
        _setParameter(ParameterKeys.SMALL_DISPUTES_PER_ACCOUNT_MONTH, 1);
        uint256 first = _delivered(10 * USDC);
        uint256 second = _delivered(10 * USDC);
        _open(payer, first, 0);
        assertEq(escrow.smallDisputesUsed(payer), 1);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.DisputeCapReached.selector, 1));
        escrow.openDispute(second, REASON, _noAuth());
    }

    function test_smallDisputeCapResetsNextMonth() public {
        _setParameter(ParameterKeys.SMALL_DISPUTES_PER_ACCOUNT_MONTH, 1);
        uint256 first = _delivered(10 * USDC);
        _open(payer, first, 0);
        vm.warp(block.timestamp + 31 days);
        uint256 second = _delivered(10 * USDC);
        _open(payer, second, 0);

        assertEq(uint8(_order(second).status), uint8(OrderStatus.Settled));
    }

    function test_smallDisputeCapOfZeroDisablesThem() public {
        _setParameter(ParameterKeys.SMALL_DISPUTES_PER_ACCOUNT_MONTH, 0);
        uint256 orderId = _delivered(10 * USDC);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.DisputeCapReached.selector, 0));
        escrow.openDispute(orderId, REASON, _noAuth());
    }

    function test_mediumDisputeFreezesFundsAndOpensACase() public {
        uint256 orderId = _delivered(100 * USDC);
        uint256 payerBefore = usdc.balanceOf(payer);

        DepositAuth memory auth = _permitAuthFor(payer, escrow, 3 * FEE);
        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.DisputeOpened(orderId, payer, REASON, 1, uint128(3 * FEE));
        vm.prank(payer);
        escrow.openDispute(orderId, REASON, auth);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Disputed));
        assertEq(usdc.balanceOf(address(escrow)), 100 * USDC + 3 * FEE);
        assertEq(usdc.balanceOf(payer), payerBefore);

        (
            uint256 caseOrder,
            address casePayer,
            address casePayee,
            address caseClaimant,
            uint128 caseAmount,
            address caseToken,
            uint8 jurors,
            bytes32 reason
        ) = court.caseOf(1);
        assertEq(caseOrder, orderId);
        assertEq(casePayer, payer);
        assertEq(casePayee, payee);
        assertEq(caseClaimant, payer);
        assertEq(caseAmount, 100 * USDC);
        assertEq(caseToken, address(usdc));
        assertEq(jurors, 3);
        assertEq(reason, REASON);

        Dispute memory dispute = escrow.getDispute(orderId);
        assertEq(dispute.claimant, payer);
        assertEq(dispute.fee, 3 * FEE);
        assertEq(dispute.caseId, 1);
    }

    function test_largeDisputeUsesFiveJurors() public {
        uint256 orderId = _delivered(500 * USDC);
        _open(payer, orderId, 5 * FEE);

        (,,,,,, uint8 jurors,) = court.caseOf(1);
        assertEq(jurors, 5);
        assertEq(escrow.getDispute(orderId).fee, 5 * FEE);
    }

    function test_sizeBoundariesPickTheRightPath() public {
        assertEq(uint8(_order(_delivered(20 * USDC)).sizeClass), uint8(SizeClass.Small));
        assertEq(uint8(_order(_delivered(20 * USDC + 1)).sizeClass), uint8(SizeClass.Medium));
        assertEq(uint8(_order(_delivered(300 * USDC)).sizeClass), uint8(SizeClass.Medium));
        assertEq(uint8(_order(_delivered(300 * USDC + 1)).sizeClass), uint8(SizeClass.Large));
    }

    function test_juryDisputeRevertsWithoutArbitration() public {
        vm.prank(admin);
        escrow.setArbitration(IArbitration(address(0)));
        uint256 orderId = _delivered(100 * USDC);

        vm.prank(payer);
        vm.expectRevert(IEscrowEvents.ArbitrationNotSet.selector);
        escrow.openDispute(orderId, REASON, _noAuth());
    }

    function test_openDisputeRejectsStrangers() public {
        uint256 orderId = _delivered(100 * USDC);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotParty.selector, other));
        escrow.openDispute(orderId, REASON, _noAuth());
    }

    function test_openDisputeNeedsADeliveredOrder() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Agreed));
        escrow.openDispute(orderId, REASON, _noAuth());
    }

    function test_openDisputeRevertsWhenTheReviewWindowHasClosed() public {
        uint256 orderId = _delivered(100 * USDC);
        uint40 readyAt = _order(orderId).deliveredAt + 24 hours;
        vm.warp(readyAt);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.ReviewWindowClosed.selector, readyAt));
        escrow.openDispute(orderId, REASON, _noAuth());
    }

    function test_openDisputeWorksOneSecondBeforeTheWindowCloses() public {
        uint256 orderId = _delivered(100 * USDC);
        vm.warp(_order(orderId).deliveredAt + 24 hours - 1);
        _open(payer, orderId, 3 * FEE);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Disputed));
    }

    function test_extendedReviewWindowAllowsLaterDisputes() public {
        uint256 orderId = _delivered(100 * USDC);
        vm.prank(payer);
        escrow.extendReview(orderId);
        vm.warp(_order(orderId).deliveredAt + 30 hours);
        _open(payer, orderId, 3 * FEE);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Disputed));
    }

    function test_disputedOrderBlocksEveryOtherExit() public {
        uint256 orderId = _delivered(100 * USDC);
        _open(payer, orderId, 3 * FEE);
        (Release memory r, bytes memory sig) = _release(orderId, 100 * USDC, 5);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Disputed));
        escrow.release(r, sig);

        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Disputed));
        escrow.autoRelease(orderId);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Disputed));
        escrow.cancel(orderId);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Disputed));
        escrow.extendReview(orderId);
    }

    function test_cannotOpenTwice() public {
        uint256 orderId = _delivered(100 * USDC);
        _open(payer, orderId, 3 * FEE);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Disputed));
        escrow.openDispute(orderId, REASON, _noAuth());
    }

    function test_resolveOnlyByTheArbitration() public {
        uint256 orderId = _delivered(100 * USDC);
        _open(payer, orderId, 3 * FEE);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotArbitration.selector, admin));
        escrow.resolveDispute(orderId, 10_000);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotArbitration.selector, payer));
        escrow.resolveDispute(orderId, 0);
    }

    function test_resolveRejectsSharesAboveTheMaximum() public {
        uint256 orderId = _delivered(100 * USDC);
        _open(payer, orderId, 3 * FEE);

        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidShare.selector, 10_001));
        court.resolve(orderId, 10_001);
    }

    function test_resolveNeedsADisputedOrder() public {
        uint256 orderId = _delivered(100 * USDC);

        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Delivered));
        court.resolve(orderId, 5000);
    }

    function test_resolveCannotRepeat() public {
        uint256 orderId = _delivered(100 * USDC);
        _open(payer, orderId, 3 * FEE);
        court.resolve(orderId, 10_000);

        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Settled));
        court.resolve(orderId, 0);
    }

    function test_requesterWinsAndPaysTheCostBecauseTheProviderHasNothing() public {
        uint256 orderId = _delivered(100 * USDC);
        _open(payer, orderId, 3 * FEE);
        uint256 payerBefore = usdc.balanceOf(payer);

        court.resolve(orderId, 0);

        assertEq(usdc.balanceOf(payer) - payerBefore, 100 * USDC);
        assertEq(usdc.balanceOf(payee), 0);
        assertEq(usdc.balanceOf(address(court)), 3 * FEE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertFalse(_order(orderId).paidOut);
    }

    function test_requesterLosesAndPaysTheCost() public {
        uint256 orderId = _delivered(100 * USDC);
        _open(payer, orderId, 3 * FEE);

        court.resolve(orderId, 10_000);

        assertEq(usdc.balanceOf(payee), 100 * USDC);
        assertEq(usdc.balanceOf(address(court)), 3 * FEE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertTrue(_order(orderId).paidOut);
    }

    function test_providerClaimantWinsFullyAndPaysTheCostWhenTheRequesterHasNothingLeft() public {
        uint256 orderId = _delivered(100 * USDC);
        _open(payee, orderId, 3 * FEE);
        uint256 payeeBefore = usdc.balanceOf(payee);

        court.resolve(orderId, 10_000);

        assertEq(usdc.balanceOf(payee) - payeeBefore, 100 * USDC);
        assertEq(usdc.balanceOf(address(court)), 3 * FEE);
    }

    function test_providerClaimantLosesAndTheRequesterGetsEverything() public {
        uint256 orderId = _delivered(100 * USDC);
        _open(payee, orderId, 3 * FEE);
        uint256 payerBefore = usdc.balanceOf(payer);

        court.resolve(orderId, 0);

        assertEq(usdc.balanceOf(payer) - payerBefore, 100 * USDC);
        assertEq(usdc.balanceOf(payee), 0);
        assertEq(usdc.balanceOf(address(court)), 3 * FEE);
    }

    function test_partialWinTakesTheCostFromTheRespondentsShare() public {
        uint256 orderId = _delivered(100 * USDC);
        _open(payee, orderId, 3 * FEE);
        uint256 payerBefore = usdc.balanceOf(payer);
        uint256 payeeBefore = usdc.balanceOf(payee);

        court.resolve(orderId, 7000);

        assertEq(usdc.balanceOf(payee) - payeeBefore, 70 * USDC + 3 * FEE);
        assertEq(usdc.balanceOf(payer) - payerBefore, 30 * USDC - 3 * FEE);
        assertEq(usdc.balanceOf(address(court)), 3 * FEE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_partialWinForTheRequesterTakesTheCostFromTheProvidersShare() public {
        uint256 orderId = _delivered(100 * USDC);
        _open(payer, orderId, 3 * FEE);
        uint256 payerBefore = usdc.balanceOf(payer);

        court.resolve(orderId, 2000);

        assertEq(usdc.balanceOf(payee), 20 * USDC - 3 * FEE);
        assertEq(usdc.balanceOf(payer) - payerBefore, 80 * USDC + 3 * FEE);
        assertEq(usdc.balanceOf(address(court)), 3 * FEE);
    }

    function test_costLargerThanTheRespondentsShareIsCappedAtTheShare() public {
        uint256 orderId = _delivered(100 * USDC);
        _open(payer, orderId, 3 * FEE);

        court.resolve(orderId, 500);

        assertEq(usdc.balanceOf(payee), 5 * USDC - 3 * FEE + 0);
        assertEq(usdc.balanceOf(address(court)), 3 * FEE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_exactTieCountsAgainstTheClaimant() public {
        uint256 orderId = _delivered(100 * USDC);
        _open(payer, orderId, 3 * FEE);

        court.resolve(orderId, 5000);

        assertEq(usdc.balanceOf(payee), 50 * USDC);
        assertEq(usdc.balanceOf(address(court)), 3 * FEE);
    }

    function test_protocolFeeApplies() public {
        _setParameter(ParameterKeys.FEE_BPS, 200);
        uint256 orderId = _delivered(100 * USDC);
        _open(payer, orderId, 3 * FEE);

        court.resolve(orderId, 10_000);

        assertEq(usdc.balanceOf(address(treasury)), 2 * USDC);
        assertEq(usdc.balanceOf(payee), 98 * USDC);
    }

    function test_conservationHoldsAcrossAWholeDispute() public {
        uint256 orderId = _delivered(100 * USDC);
        uint256 total = _balanceSum();
        _open(payer, orderId, 3 * FEE);
        total += 3 * FEE;
        assertEq(_balanceSum(), total);

        court.resolve(orderId, 6500);
        assertEq(_balanceSum(), total);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_disputeThroughTheForwarderAttributesTheSigner() public {
        uint256 orderId = _delivered(100 * USDC);
        DepositAuth memory auth = _permitAuthFor(payer, escrow, 3 * FEE);
        _forward(payerKey, payer, address(escrow), abi.encodeCall(IEscrow.openDispute, (orderId, REASON, auth)));

        assertEq(escrow.getDispute(orderId).claimant, payer);
    }

    function test_blockedPartyDoesNotBlockResolution() public {
        uint256 orderId = _delivered(100 * USDC);
        _open(payer, orderId, 3 * FEE);

        court.resolve(orderId, 10_000);

        assertEq(escrow.claimable(address(usdc), payee), 0);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
    }

    function test_setArbitrationRequiresTheAdminRole() public {
        vm.prank(other);
        vm.expectRevert();
        escrow.setArbitration(IArbitration(address(court)));
    }

    function test_setArbitrationEmitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit IEscrowEvents.ArbitrationUpdated(address(court));
        vm.prank(admin);
        escrow.setArbitration(IArbitration(address(court)));
    }

    function testFuzz_everyShareConservesTheMoney(uint96 priceSeed, uint16 shareSeed, bool providerClaims) public {
        uint256 price = bound(priceSeed, 21 * USDC, 300 * USDC);
        uint16 share = uint16(bound(shareSeed, 0, 10_000));
        uint256 orderId = _delivered(price);
        uint256 total = _balanceSum();
        _open(providerClaims ? payee : payer, orderId, 3 * FEE);
        total += 3 * FEE;

        court.resolve(orderId, share);

        assertEq(_balanceSum(), total);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(usdc.balanceOf(address(court)), 3 * FEE);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
    }
}

contract EscrowDisputeReputationTest is EscrowDisputeTest {
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

    function test_smallDisputeRecordsADisputeForBothWithoutLoser() public {
        uint256 orderId = _delivered(10 * USDC);
        _open(payer, orderId, 0);

        Stats memory provider = reputation.stats(payee, Role.Provider);
        Stats memory requester = reputation.stats(payer, Role.Requester);
        assertEq(provider.disputes, 1);
        assertEq(provider.disputesLost, 0);
        assertEq(requester.disputes, 1);
        assertEq(requester.disputesLost, 0);
        assertEq(provider.closed, 1);
        assertEq(provider.closedClean, 0);
    }

    function test_providerLossIsRecorded() public {
        uint256 orderId = _delivered(100 * USDC);
        _open(payer, orderId, 3 * FEE);
        court.resolve(orderId, 0);

        assertEq(reputation.stats(payee, Role.Provider).disputesLost, 1);
        assertEq(reputation.stats(payer, Role.Requester).disputesLost, 0);
        assertEq(reputation.stats(payee, Role.Provider).closed, 0);
    }

    function test_requesterLossIsRecordedAndTheProviderCloseIsNotClean() public {
        uint256 orderId = _delivered(100 * USDC);
        _open(payer, orderId, 3 * FEE);
        court.resolve(orderId, 10_000);

        assertEq(reputation.stats(payer, Role.Requester).disputesLost, 1);
        assertEq(reputation.stats(payee, Role.Provider).closed, 1);
        assertEq(reputation.stats(payee, Role.Provider).closedClean, 0);
    }
}
