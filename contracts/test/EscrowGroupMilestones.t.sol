// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {GroupBase} from "./GroupBase.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {IEscrowEvents} from "../src/interfaces/IEscrowEvents.sol";
import {Order, OrderStatus, DepositAuth, MilestoneTerms, Agreement} from "../src/libraries/OrderTypes.sol";

contract EscrowGroupMilestonesTest is GroupBase {
    bytes32 internal constant REASON = keccak256("hito objection");

    function _groupWithMilestones() internal returns (uint256 orderId) {
        orderId = _createGroup(300 * USDC);
        _contribute(orderId, 0, 120 * USDC);
        _contribute(orderId, 1, 90 * USDC);
        _contribute(orderId, 2, 60 * USDC);
        _contribute(orderId, 3, 30 * USDC);
        _proposeProvider(orderId);
        vm.warp(block.timestamp + 24 hours);
        _agreeMilestones(
            orderId, _terms(_amounts(uint128(100 * USDC), uint128(100 * USDC), uint128(100 * USDC)), false)
        );
    }

    function _balances() internal view returns (uint256[4] memory result) {
        for (uint256 i = 0; i < 4; i++) {
            result[i] = usdc.balanceOf(members[i]);
        }
    }

    function _assertShares(uint256[4] memory before, uint256 a, uint256 b, uint256 c, uint256 d) internal view {
        uint256[4] memory afterwards = _balances();
        assertEq(afterwards[0] - before[0], a);
        assertEq(afterwards[1] - before[1], b);
        assertEq(afterwards[2] - before[2], c);
        assertEq(afterwards[3] - before[3], d);
    }

    function test_aBigGroupOrderCanAgreeWithoutMilestones() public {
        uint256 orderId = _createGroup(200 * USDC);
        _contribute(orderId, 0, 80 * USDC);
        _contribute(orderId, 1, 60 * USDC);
        _contribute(orderId, 2, 40 * USDC);
        _contribute(orderId, 3, 20 * USDC);
        _proposeProvider(orderId);
        vm.warp(block.timestamp + 24 hours);

        Agreement memory a = _agreement(orderId, 200 * USDC);
        bytes32 structHash = _agreementHash(a);
        bytes memory payerSig = _sign(payerKey, structHash);
        bytes memory payeeSig = _sign(payeeKey, structHash);
        escrow.agree(a, payerSig, payeeSig);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Agreed));
    }

    function test_theMilestoneAgreementAlsoNeedsTheGroupProposal() public {
        uint256 orderId = _createGroup(300 * USDC);
        _contribute(orderId, 0, 120 * USDC);
        _contribute(orderId, 1, 90 * USDC);
        _contribute(orderId, 2, 60 * USDC);
        _contribute(orderId, 3, 30 * USDC);
        MilestoneTerms memory terms =
            _terms(_amounts(uint128(100 * USDC), uint128(100 * USDC), uint128(100 * USDC)), false);
        Agreement memory a = _milestoneAgreement(orderId, terms);
        bytes32 structHash = _agreementHash(a);
        bytes memory payerSig = _sign(payerKey, structHash);
        bytes memory payeeSig = _sign(payeeKey, structHash);

        vm.expectRevert(IEscrowEvents.GroupAgreementNeedsProposal.selector);
        escrow.agreeWithMilestones(a, terms, payerSig, payeeSig);
    }

    function test_aPartialMilestonePaymentRefundsTheContributorsProportionally() public {
        uint256 orderId = _groupWithMilestones();
        uint256[4] memory before = _balances();
        _payMilestone(orderId, 0, 60 * USDC, 4);

        _assertShares(before, 16 * USDC, 12 * USDC, 8 * USDC, 4 * USDC);
        assertEq(usdc.balanceOf(payee), 60 * USDC);
    }

    function test_earlyTerminationRefundsTheContributorsProportionally() public {
        uint256 orderId = _groupWithMilestones();
        uint256[4] memory before = _balances();

        vm.prank(payer);
        escrow.terminateEarly(orderId);

        _assertShares(before, 108 * USDC, 81 * USDC, 54 * USDC, 27 * USDC);
        assertEq(usdc.balanceOf(payee), 24 * USDC);
    }

    function test_afterAnAbandonTheCoordinatorCancelsAndEveryoneRecoversTheirShare() public {
        uint256 orderId = _groupWithMilestones();
        _payMilestone(orderId, 0, 100 * USDC, 5);
        vm.prank(payee);
        escrow.abandon(orderId);
        uint256[4] memory before = _balances();

        vm.prank(payer);
        escrow.cancel(orderId);

        _assertShares(before, 80 * USDC, 60 * USDC, 40 * USDC, 20 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Cancelled));
    }

    function test_aBigContributorsObjectionOpensTheMilestoneCase() public {
        uint256 orderId = _groupWithMilestones();
        _deliverAt(orderId, 0);
        DepositAuth memory auth = _permitFor(members[0], memberKeys[0], 3 * USDC);
        vm.prank(members[0]);
        escrow.object(orderId, REASON, auth);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Disputed));
        assertEq(escrow.getDispute(orderId).claimant, members[0]);

        court.resolve(orderId, 10_000);
        assertEq(usdc.balanceOf(payee), 100 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Agreed));
        assertEq(_plan(orderId).next, 1);
    }

    function test_theMilestoneDecisionRefundsTheContributorsProportionally() public {
        uint256 orderId = _groupWithMilestones();
        _deliverAt(orderId, 0);
        DepositAuth memory auth = _permitFor(members[0], memberKeys[0], 3 * USDC);
        vm.prank(members[0]);
        escrow.object(orderId, REASON, auth);
        uint256[4] memory before = _balances();

        court.resolve(orderId, 0);

        _assertShares(before, 40 * USDC, 30 * USDC, 20 * USDC, 10 * USDC);
    }

    function test_objectionsStartOverForEachMilestone() public {
        uint256 orderId = _groupWithMilestones();
        _deliverAt(orderId, 0);
        vm.prank(members[3]);
        escrow.object(orderId, REASON, _noAuth());
        vm.warp(block.timestamp + 72 hours);
        escrow.autoReleaseMilestone(orderId);

        _deliverAt(orderId, 1);
        vm.prank(members[2]);
        escrow.object(orderId, REASON, _noAuth());

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Agreed));
        assertEq(_group(orderId).objectionCount, 1);
    }

    function test_theSameMemberCanObjectToTheNextMilestone() public {
        uint256 orderId = _groupWithMilestones();
        _deliverAt(orderId, 0);
        vm.prank(members[3]);
        escrow.object(orderId, REASON, _noAuth());
        vm.warp(block.timestamp + 72 hours);
        escrow.autoReleaseMilestone(orderId);
        _deliverAt(orderId, 1);

        vm.prank(members[3]);
        escrow.object(orderId, REASON, _noAuth());
        assertEq(_group(orderId).objectionCount, 1);
    }

    function test_theWholeGroupMilestoneFlowConservesTheMoney() public {
        uint256 total = _everyone();
        uint256 orderId = _groupWithMilestones();
        total += 300 * USDC;
        _payMilestone(orderId, 0, 70 * USDC, 4);
        _deliverAt(orderId, 1);
        DepositAuth memory auth = _permitFor(members[0], memberKeys[0], 3 * USDC);
        vm.prank(members[0]);
        escrow.object(orderId, REASON, auth);
        total += 3 * USDC;
        court.resolve(orderId, 4000);
        _payMilestone(orderId, 2, 90 * USDC, 5);

        assertEq(_everyone(), total);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
    }

    function testFuzz_anyMilestoneReleasePatternConservesTheMoneyInAGroup(uint16 p0, uint16 p1, uint16 p2) public {
        uint256 total = _everyone();
        uint256 orderId = _groupWithMilestones();
        total += 300 * USDC;
        _payMilestone(orderId, 0, (100 * USDC * bound(p0, 0, 10_000)) / 10_000, 4);
        _payMilestone(orderId, 1, (100 * USDC * bound(p1, 0, 10_000)) / 10_000, 4);
        _payMilestone(orderId, 2, (100 * USDC * bound(p2, 0, 10_000)) / 10_000, 4);

        assertEq(_everyone(), total);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }
}
