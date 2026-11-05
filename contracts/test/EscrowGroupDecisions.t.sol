// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {GroupBase} from "./GroupBase.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {IEscrowEvents} from "../src/interfaces/IEscrowEvents.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {
    Order,
    OrderStatus,
    CreateParams,
    DepositAuth,
    GroupParams,
    GroupInfo,
    Agreement,
    Release,
    Dispute
} from "../src/libraries/OrderTypes.sol";

contract EscrowGroupDecisionsTest is GroupBase {
    bytes32 internal constant REASON = keccak256("group objection");

    function _balances() internal view returns (uint256[4] memory result) {
        for (uint256 i = 0; i < 4; i++) {
            result[i] = usdc.balanceOf(members[i]);
        }
    }

    function _expectProposalRevert(uint256 orderId, bytes memory reason) internal {
        Agreement memory a = _agreement(orderId, 100 * USDC);
        bytes32 structHash = _agreementHash(a);
        bytes memory payerSig = _sign(payerKey, structHash);
        bytes memory payeeSig = _sign(payeeKey, structHash);
        vm.expectRevert(reason);
        vm.prank(relayer);
        escrow.agree(a, payerSig, payeeSig);
    }

    function _objectAs(uint256 member, uint256 orderId, uint256 fee) internal {
        DepositAuth memory auth = fee == 0 ? _noAuth() : _permitFor(members[member], memberKeys[member], fee);
        vm.prank(members[member]);
        escrow.object(orderId, REASON, auth);
    }

    function test_onlyTheCoordinatorProposesAProvider() public {
        uint256 orderId = _openGroup();

        vm.prank(members[0]);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotPayer.selector, members[0]));
        escrow.proposeProvider(orderId, payee);
    }

    function test_theProposalEmitsTheEndOfTheVetoWindow() public {
        uint256 orderId = _openGroup();

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.ProviderProposed(orderId, payee, uint40(block.timestamp + 24 hours));
        _proposeProvider(orderId);

        GroupInfo memory info = _group(orderId);
        assertEq(info.proposedPayee, payee);
        assertEq(info.proposedAt, block.timestamp);
    }

    function test_proposalsRejectInvalidProviders() public {
        uint256 orderId = _openGroup();

        vm.startPrank(payer);
        vm.expectRevert(IEscrowEvents.PayeeIsPayer.selector);
        escrow.proposeProvider(orderId, address(0));
        vm.expectRevert(IEscrowEvents.PayeeIsPayer.selector);
        escrow.proposeProvider(orderId, payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.ProviderIsContributor.selector, members[0]));
        escrow.proposeProvider(orderId, members[0]);
        vm.stopPrank();
    }

    function test_proposalsNeedAFundedOpenOrder() public {
        uint256 orderId = _createGroup(100 * USDC);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Funding));
        escrow.proposeProvider(orderId, payee);
    }

    function test_proposalsNeedAGroupOrder() public {
        uint256 orderId = _createUsdc(100 * USDC);
        vm.prank(payer);
        vm.expectRevert(IEscrowEvents.NotGroup.selector);
        escrow.proposeProvider(orderId, payee);
    }

    function test_theAgreementNeedsAProposal() public {
        uint256 orderId = _openGroup();
        _expectProposalRevert(orderId, abi.encodeWithSelector(IEscrowEvents.GroupAgreementNeedsProposal.selector));
    }

    function test_theAgreementWaitsForTheVetoWindow() public {
        uint256 orderId = _openGroup();
        _proposeProvider(orderId);
        uint40 readyAt = uint40(block.timestamp + 24 hours);
        vm.warp(readyAt - 1);

        _expectProposalRevert(orderId, abi.encodeWithSelector(IEscrowEvents.VetoWindowOpen.selector, readyAt));
    }

    function test_theAgreementWorksExactlyWhenTheWindowEnds() public {
        uint256 orderId = _openGroup();
        _proposeProvider(orderId);
        vm.warp(block.timestamp + 24 hours);
        _agree(orderId, 100 * USDC);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Agreed));
    }

    function test_theAgreementMustBeWithTheProposedProvider() public {
        uint256 orderId = _openGroup();
        _proposeProvider(orderId);
        vm.warp(block.timestamp + 24 hours);
        Agreement memory a = _agreement(orderId, 100 * USDC);
        a.payee = other;
        bytes32 structHash = _agreementHash(a);
        bytes memory payerSig = _sign(payerKey, structHash);
        bytes memory payeeSig = _sign(otherKey, structHash);

        vm.expectRevert(IEscrowEvents.GroupAgreementNeedsProposal.selector);
        escrow.agree(a, payerSig, payeeSig);
    }

    function test_aVetoByEnoughMoneyClearsTheProposal() public {
        uint256 orderId = _openGroup();
        _proposeProvider(orderId);

        vm.expectEmit(true, false, false, false);
        emit IEscrowEvents.ProposalCleared(orderId);
        vm.prank(members[0]);
        escrow.vetoProvider(orderId);

        assertEq(_group(orderId).proposedPayee, address(0));
        vm.warp(block.timestamp + 24 hours);
        _expectProposalRevert(orderId, abi.encodeWithSelector(IEscrowEvents.GroupAgreementNeedsProposal.selector));
    }

    function test_aVetoByTwoPeopleClearsTheProposalEvenWithLittleMoney() public {
        uint256 orderId = _openGroup();
        _proposeProvider(orderId);
        vm.prank(members[3]);
        escrow.vetoProvider(orderId);
        assertEq(_group(orderId).proposedPayee, payee);

        vm.prank(members[2]);
        escrow.vetoProvider(orderId);
        assertEq(_group(orderId).proposedPayee, address(0));
    }

    function test_aLoneSmallVetoDoesNotBlockTheProposal() public {
        uint256 orderId = _openGroup();
        _proposeProvider(orderId);
        vm.prank(members[3]);
        escrow.vetoProvider(orderId);
        vm.warp(block.timestamp + 24 hours);
        _agree(orderId, 100 * USDC);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Agreed));
    }

    function test_vetoesAreOnlyPossibleInsideTheWindow() public {
        uint256 orderId = _openGroup();
        _proposeProvider(orderId);
        uint40 readyAt = uint40(block.timestamp + 24 hours);
        vm.warp(readyAt);

        vm.prank(members[0]);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.VetoWindowClosed.selector, readyAt));
        escrow.vetoProvider(orderId);
    }

    function test_vetoRules() public {
        uint256 orderId = _openGroup();
        vm.prank(members[3]);
        vm.expectRevert(IEscrowEvents.NoProposal.selector);
        escrow.vetoProvider(orderId);

        _proposeProvider(orderId);
        vm.prank(members[5]);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotContributor.selector, members[5]));
        escrow.vetoProvider(orderId);

        vm.startPrank(members[3]);
        escrow.vetoProvider(orderId);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.AlreadyVoted.selector, members[3]));
        escrow.vetoProvider(orderId);
        vm.stopPrank();
    }

    function test_aNewProposalStartsWithFreshVetoes() public {
        uint256 orderId = _openGroup();
        _proposeProvider(orderId);
        vm.prank(members[3]);
        escrow.vetoProvider(orderId);

        _proposeProvider(orderId);
        assertEq(_group(orderId).vetoCount, 0);
        vm.prank(members[3]);
        escrow.vetoProvider(orderId);
        assertEq(_group(orderId).vetoCount, 1);
    }

    function test_theAgreementRefundIsSplitProportionally() public {
        uint256 orderId = _openGroup();
        _proposeProvider(orderId);
        vm.warp(block.timestamp + 24 hours);
        uint256[4] memory before = _balances();
        _agree(orderId, 80 * USDC);

        uint256[4] memory afterwards = _balances();
        assertEq(afterwards[0] - before[0], 8 * USDC);
        assertEq(afterwards[1] - before[1], 6 * USDC);
        assertEq(afterwards[2] - before[2], 4 * USDC);
        assertEq(afterwards[3] - before[3], 2 * USDC);
    }

    function test_roundingDustGoesToTheLastContributor() public {
        uint256 orderId = _createGroup(100 * USDC);
        _contribute(orderId, 0, 33 * USDC);
        _contribute(orderId, 1, 33 * USDC);
        _contribute(orderId, 2, 34 * USDC);
        _proposeProvider(orderId);
        vm.warp(block.timestamp + 24 hours);
        uint256[4] memory before = _balances();

        Agreement memory a = _agreement(orderId, 100 * USDC - 1);
        bytes32 structHash = _agreementHash(a);
        bytes memory payerSig = _sign(payerKey, structHash);
        bytes memory payeeSig = _sign(payeeKey, structHash);
        escrow.agree(a, payerSig, payeeSig);

        uint256[4] memory afterwards = _balances();
        assertEq(afterwards[0] - before[0], 0);
        assertEq(afterwards[1] - before[1], 0);
        assertEq(afterwards[2] - before[2], 1);
    }

    function test_aPartialReleaseRefundsTheContributorsProportionally() public {
        uint256 orderId = _deliveredGroup();
        uint256[4] memory before = _balances();
        (Release memory r, bytes memory sig) = _release(orderId, 60 * USDC, 4);
        vm.prank(payee);
        escrow.release(r, sig);

        uint256[4] memory afterwards = _balances();
        assertEq(afterwards[0] - before[0], 16 * USDC);
        assertEq(afterwards[1] - before[1], 12 * USDC);
        assertEq(afterwards[2] - before[2], 8 * USDC);
        assertEq(afterwards[3] - before[3], 4 * USDC);
        assertEq(usdc.balanceOf(payee), 60 * USDC);
    }

    function test_theCoordinatorSignsTheReleaseNotTheContributors() public {
        uint256 orderId = _deliveredGroup();
        Release memory r = Release({
            orderId: orderId,
            payee: payee,
            amount: uint128(100 * USDC),
            rating: 5,
            evidenceHash: EVIDENCE,
            expiry: uint40(block.timestamp + 10 minutes)
        });
        bytes memory forged = _sign(memberKeys[0], _releaseHash(r));

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidSignature.selector, payer));
        escrow.release(r, forged);
    }

    function test_aLateCancellationSplitsTheRemainderProportionally() public {
        uint256 orderId = _agreedGroup(100 * USDC);
        uint256[4] memory before = _balances();

        vm.prank(payer);
        escrow.cancel(orderId);

        uint256[4] memory afterwards = _balances();
        assertEq(afterwards[0] - before[0], 36 * USDC);
        assertEq(afterwards[1] - before[1], 27 * USDC);
        assertEq(afterwards[2] - before[2], 18 * USDC);
        assertEq(afterwards[3] - before[3], 9 * USDC);
        assertEq(usdc.balanceOf(payee), 8 * USDC);
        assertEq(usdc.balanceOf(address(treasury)), 2 * USDC);
    }

    function test_theCoordinatorsDisputeRefundsTheContributorsProportionally() public {
        uint256 orderId = _deliveredGroup();
        DepositAuth memory auth = _permitFor(payer, payerKey, 3 * USDC);
        vm.prank(payer);
        escrow.openDispute(orderId, REASON, auth);
        uint256[4] memory before = _balances();

        court.resolve(orderId, 0);

        uint256[4] memory afterwards = _balances();
        assertEq(afterwards[0] - before[0], 40 * USDC);
        assertEq(afterwards[1] - before[1], 30 * USDC);
        assertEq(afterwards[2] - before[2], 20 * USDC);
        assertEq(afterwards[3] - before[3], 10 * USDC);
    }

    function test_aSmallObjectionIsRecordedButDoesNotBlock() public {
        uint256 orderId = _deliveredGroup();

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.ObjectionRegistered(orderId, members[3], uint128(10 * USDC), 1);
        _objectAs(3, orderId, 0);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Delivered));
        assertEq(_group(orderId).objectionCount, 1);
    }

    function test_twoPeopleReachTheObjectionThresholdAndTheLastOneOpensTheCase() public {
        uint256 orderId = _deliveredGroup();
        _objectAs(3, orderId, 0);

        _objectAs(2, orderId, 3 * USDC);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Disputed));
        Dispute memory dispute = escrow.getDispute(orderId);
        assertEq(dispute.claimant, members[2]);
        assertEq(dispute.fee, 3 * USDC);
    }

    function test_aBigObjectorOpensTheCaseAlone() public {
        uint256 orderId = _deliveredGroup();
        _objectAs(0, orderId, 3 * USDC);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Disputed));
        assertEq(escrow.getDispute(orderId).claimant, members[0]);
    }

    function test_theMoneyThresholdIsInclusiveAtTwentyFivePercent() public {
        uint256 orderId = _createGroup(100 * USDC);
        for (uint256 i = 0; i < 4; i++) {
            _contribute(orderId, i, 25 * USDC);
        }
        _proposeProvider(orderId);
        vm.warp(block.timestamp + 24 hours);
        _agree(orderId, 100 * USDC);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);

        _objectAs(0, orderId, 3 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Disputed));
    }

    function test_justBelowTwentyFivePercentIsNotEnough() public {
        uint256 orderId = _createGroup(100 * USDC);
        _contribute(orderId, 0, 24_990_000);
        _contribute(orderId, 1, 25_010_000);
        _contribute(orderId, 2, 25 * USDC);
        _contribute(orderId, 3, 25 * USDC);
        _proposeProvider(orderId);
        vm.warp(block.timestamp + 24 hours);
        _agree(orderId, 100 * USDC);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);

        _objectAs(0, orderId, 0);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Delivered));
    }

    function test_theThresholdCanBeRaisedByTheParameter() public {
        _setParameter(ParameterKeys.OBJECTION_MONEY_BPS, 6000);
        _setParameter(ParameterKeys.OBJECTION_MIN_PEOPLE, 3);
        uint256 orderId = _deliveredGroup();
        _objectAs(0, orderId, 0);
        _objectAs(3, orderId, 0);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Delivered));

        _objectAs(2, orderId, 3 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Disputed));
    }

    function test_objectionRules() public {
        uint256 orderId = _deliveredGroup();

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotContributor.selector, payer));
        escrow.object(orderId, REASON, _noAuth());

        _objectAs(3, orderId, 0);
        vm.prank(members[3]);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.AlreadyVoted.selector, members[3]));
        escrow.object(orderId, REASON, _noAuth());
    }

    function test_objectionsNeedAGroupOrder() public {
        uint256 orderId = _createUsdc(100 * USDC);
        vm.prank(members[0]);
        vm.expectRevert(IEscrowEvents.NotGroup.selector);
        escrow.object(orderId, REASON, _noAuth());

        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.UnknownOrder.selector, 99));
        escrow.object(99, REASON, _noAuth());
    }

    function test_objectionsNeedAReviewableDelivery() public {
        uint256 orderId = _agreedGroup(100 * USDC);
        vm.prank(members[0]);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Agreed));
        escrow.object(orderId, REASON, _noAuth());
    }

    function test_objectionsAreBoundedByTheReviewWindow() public {
        uint256 orderId = _deliveredGroup();
        uint40 readyAt = _order(orderId).deliveredAt + 24 hours;
        vm.warp(readyAt);

        vm.prank(members[0]);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.ReviewWindowClosed.selector, readyAt));
        escrow.object(orderId, REASON, _noAuth());
    }

    function test_theSilenceOfTheGroupReleasesThePayment() public {
        uint256 orderId = _deliveredGroup();
        _objectAs(3, orderId, 0);
        vm.warp(block.timestamp + 24 hours);
        escrow.autoRelease(orderId);

        assertEq(usdc.balanceOf(payee), 100 * USDC);
    }

    function test_theGroupCanChangeTheCoordinatorByMoneyMajority() public {
        uint256 orderId = _agreedGroup(100 * USDC);

        vm.prank(members[0]);
        escrow.supportCoordinator(orderId, other);
        assertEq(_order(orderId).payer, payer);

        vm.expectEmit(true, true, true, false);
        emit IEscrowEvents.CoordinatorChanged(orderId, payer, other);
        vm.prank(members[1]);
        escrow.supportCoordinator(orderId, other);

        assertEq(_order(orderId).payer, other);
    }

    function test_theNewCoordinatorSignsTheRelease() public {
        uint256 orderId = _agreedGroup(100 * USDC);
        vm.prank(members[0]);
        escrow.supportCoordinator(orderId, other);
        vm.prank(members[1]);
        escrow.supportCoordinator(orderId, other);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);

        Release memory r = Release({
            orderId: orderId,
            payee: payee,
            amount: uint128(100 * USDC),
            rating: 5,
            evidenceHash: EVIDENCE,
            expiry: uint40(block.timestamp + 10 minutes)
        });
        bytes memory oldSig = _sign(payerKey, _releaseHash(r));
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidSignature.selector, other));
        escrow.release(r, oldSig);

        bytes memory newSig = _sign(otherKey, _releaseHash(r));
        vm.prank(payee);
        escrow.release(r, newSig);
        assertEq(usdc.balanceOf(payee), 100 * USDC);
    }

    function test_changingSupportMovesTheWeight() public {
        uint256 orderId = _agreedGroup(100 * USDC);
        address rival = makeAddr("rival");
        vm.prank(members[0]);
        escrow.supportCoordinator(orderId, rival);
        vm.prank(members[1]);
        escrow.supportCoordinator(orderId, other);
        assertEq(_order(orderId).payer, payer);

        vm.prank(members[0]);
        escrow.supportCoordinator(orderId, other);
        assertEq(_order(orderId).payer, other);
    }

    function test_aLoneMemberCannotChangeTheCoordinator() public {
        uint256 orderId = _agreedGroup(100 * USDC);
        vm.prank(members[0]);
        escrow.supportCoordinator(orderId, other);

        assertEq(_order(orderId).payer, payer);
    }

    function test_exactlyHalfOfTheMoneyIsNotEnough() public {
        uint256 orderId = _createGroup(100 * USDC);
        _contribute(orderId, 0, 50 * USDC);
        _contribute(orderId, 1, 50 * USDC);
        vm.prank(members[0]);
        escrow.supportCoordinator(orderId, other);

        assertEq(_order(orderId).payer, payer);
    }

    function test_coordinatorSupportRules() public {
        uint256 orderId = _agreedGroup(100 * USDC);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotContributor.selector, payer));
        escrow.supportCoordinator(orderId, other);

        vm.startPrank(members[0]);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidCoordinator.selector, address(0)));
        escrow.supportCoordinator(orderId, address(0));
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidCoordinator.selector, payer));
        escrow.supportCoordinator(orderId, payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidCoordinator.selector, payee));
        escrow.supportCoordinator(orderId, payee);
        escrow.supportCoordinator(orderId, other);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.AlreadyVoted.selector, members[0]));
        escrow.supportCoordinator(orderId, other);
        vm.stopPrank();
    }

    function test_theCoordinatorCannotChangeDuringReviewOrDispute() public {
        uint256 orderId = _deliveredGroup();
        vm.prank(members[0]);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Delivered));
        escrow.supportCoordinator(orderId, other);
    }

    function test_votesStartFreshAfterTheCoordinatorChanged() public {
        uint256 orderId = _agreedGroup(100 * USDC);
        vm.prank(members[0]);
        escrow.supportCoordinator(orderId, other);
        vm.prank(members[1]);
        escrow.supportCoordinator(orderId, other);

        address third = makeAddr("third");
        vm.prank(members[0]);
        escrow.supportCoordinator(orderId, third);
        assertEq(_order(orderId).payer, other);
    }

    function test_theWholeGroupFlowConservesTheMoney() public {
        uint256 total = _everyone();
        uint256 orderId = _agreedGroup(90 * USDC);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
        _objectAs(0, orderId, 3 * USDC);
        total += 103 * USDC;
        court.resolve(orderId, 6500);

        assertEq(_everyone(), total);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testFuzz_anyValidFundingAndPartialReleaseConservesTheMoney(
        uint96 a,
        uint96 b,
        uint96 c,
        uint16 pctSeed,
        uint96 priceSeed
    ) public {
        uint256 x = bound(a, 5 * USDC, 50 * USDC);
        uint256 y = bound(b, 5 * USDC, 50 * USDC);
        uint256 z = bound(c, 5 * USDC, 50 * USDC);
        vm.assume(x + y + z < 100 * USDC);
        uint256 w = 100 * USDC - x - y - z;
        vm.assume(w >= 5 * USDC && w <= 50 * USDC);
        uint256 total = _everyone();

        uint256 orderId = _createGroup(100 * USDC);
        _contribute(orderId, 0, x);
        _contribute(orderId, 1, y);
        _contribute(orderId, 2, z);
        _contribute(orderId, 3, w);
        _proposeProvider(orderId);
        vm.warp(block.timestamp + 24 hours);
        uint256 price = bound(priceSeed, 1 * USDC, 100 * USDC);
        _agree(orderId, price);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
        uint256 released = (price * bound(pctSeed, 0, 10_000)) / 10_000;
        (Release memory r, bytes memory sig) = _release(orderId, released, 3);
        vm.prank(payee);
        escrow.release(r, sig);

        assertEq(_everyone(), total + 100 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }
}
