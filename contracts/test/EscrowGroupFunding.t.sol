// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {GroupBase} from "./GroupBase.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {IEscrowEvents} from "../src/interfaces/IEscrowEvents.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {
    Order,
    OrderStatus,
    PaymentMode,
    CreateParams,
    DepositAuth,
    GroupParams,
    GroupInfo,
    Reservation
} from "../src/libraries/OrderTypes.sol";

contract EscrowGroupFundingTest is GroupBase {
    function _expectContributeRevert(uint256 orderId, uint256 member, uint256 amount, bytes memory reason) internal {
        DepositAuth memory auth = _permitFor(members[member], memberKeys[member], amount);
        vm.expectRevert(reason);
        vm.prank(members[member]);
        escrow.contribute(orderId, uint128(amount), auth);
    }

    function test_creatingAGroupOrderOpensTheFundingPhase() public {
        CreateParams memory params = _params(address(usdc), 100 * USDC);
        uint40 deadline = uint40(block.timestamp + 7 days);

        vm.expectEmit(true, true, true, true);
        emit IEscrowEvents.GroupCreated(1, payer, payer, uint128(100 * USDC), deadline);
        vm.prank(payer);
        uint256 orderId = escrow.createGroupOrder(params, GroupParams(address(0), deadline));

        Order memory order = _order(orderId);
        assertEq(uint8(order.status), uint8(OrderStatus.Funding));
        assertEq(order.payer, payer);
        assertEq(order.deposited, 0);
        assertTrue(order.isGroup);
        GroupInfo memory info = _group(orderId);
        assertEq(info.target, 100 * USDC);
        assertEq(info.fundingDeadline, deadline);
    }

    function test_theCoordinatorCanBeSomeoneElse() public {
        CreateParams memory params = _params(address(usdc), 100 * USDC);
        vm.prank(payer);
        uint256 orderId = escrow.createGroupOrder(params, GroupParams(members[0], uint40(block.timestamp + 7 days)));

        assertEq(_order(orderId).payer, members[0]);
    }

    function test_groupCreationValidatesTheParameters() public {
        CreateParams memory params = _params(address(usdc), 100 * USDC);
        uint40 deadline = uint40(block.timestamp + 7 days);

        params.token = address(0xdead);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.TokenNotAllowed.selector, address(0xdead)));
        escrow.createGroupOrder(params, GroupParams(address(0), deadline));

        params = _params(address(usdc), 0);
        vm.expectRevert(IEscrowEvents.InvalidAmount.selector);
        escrow.createGroupOrder(params, GroupParams(address(0), deadline));

        params = _params(address(usdc), 100 * USDC);
        params.mode = PaymentMode.Cash;
        vm.expectRevert(IEscrowEvents.UnsupportedForMode.selector);
        escrow.createGroupOrder(params, GroupParams(address(0), deadline));

        params = _params(address(usdc), 100 * USDC);
        vm.expectRevert(IEscrowEvents.InvalidDeadline.selector);
        escrow.createGroupOrder(params, GroupParams(address(0), uint40(block.timestamp)));

        params.startsAt = uint40(block.timestamp);
        vm.expectRevert(IEscrowEvents.InvalidSchedule.selector);
        escrow.createGroupOrder(params, GroupParams(address(0), deadline));
    }

    function test_aContributionPullsTheFundsAndRecordsTheShare() public {
        uint256 orderId = _createGroup(100 * USDC);
        DepositAuth memory auth = _permitFor(members[0], memberKeys[0], 40 * USDC);

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.Contributed(orderId, members[0], uint128(40 * USDC), uint128(40 * USDC));
        vm.prank(members[0]);
        escrow.contribute(orderId, uint128(40 * USDC), auth);

        assertEq(escrow.contributionOf(orderId, members[0]), 40 * USDC);
        assertEq(_order(orderId).deposited, 40 * USDC);
        assertEq(_group(orderId).totalContributed, 40 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 40 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Funding));
    }

    function test_theLastContributionOpensTheOrder() public {
        uint256 orderId = _createGroup(100 * USDC);
        _contribute(orderId, 0, 40 * USDC);
        _contribute(orderId, 1, 30 * USDC);
        _contribute(orderId, 2, 20 * USDC);
        DepositAuth memory auth = _permitFor(members[3], memberKeys[3], 10 * USDC);

        vm.expectEmit(true, false, false, false);
        emit IEscrowEvents.FundingCompleted(orderId);
        vm.prank(members[3]);
        escrow.contribute(orderId, uint128(10 * USDC), auth);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Open));
        assertEq(_order(orderId).deposited, 100 * USDC);
        assertEq(escrow.contributorsOf(orderId).length, 4);
    }

    function test_theMinimumContributionIsFivePercent() public {
        uint256 orderId = _createGroup(100 * USDC);
        _expectContributeRevert(
            orderId,
            0,
            5 * USDC - 1,
            abi.encodeWithSelector(IEscrowEvents.ContributionOutOfRange.selector, 5 * USDC, 50 * USDC)
        );
        _contribute(orderId, 0, 5 * USDC);
        assertEq(escrow.contributionOf(orderId, members[0]), 5 * USDC);
    }

    function test_theMaximumContributionIsFiftyPercent() public {
        uint256 orderId = _createGroup(100 * USDC);
        _expectContributeRevert(
            orderId,
            0,
            50 * USDC + 1,
            abi.encodeWithSelector(IEscrowEvents.ContributionOutOfRange.selector, 5 * USDC, 50 * USDC)
        );
        _contribute(orderId, 0, 50 * USDC);
        assertEq(escrow.contributionOf(orderId, members[0]), 50 * USDC);
    }

    function test_aContributorCanTopUpWithinTheMaximum() public {
        uint256 orderId = _createGroup(100 * USDC);
        _contribute(orderId, 0, 10 * USDC);
        _contribute(orderId, 0, 10 * USDC);

        assertEq(escrow.contributionOf(orderId, members[0]), 20 * USDC);
        assertEq(escrow.contributorsOf(orderId).length, 1);
    }

    function test_topUpsCannotPassTheMaximum() public {
        uint256 orderId = _createGroup(100 * USDC);
        _contribute(orderId, 0, 30 * USDC);
        _expectContributeRevert(
            orderId,
            0,
            30 * USDC,
            abi.encodeWithSelector(IEscrowEvents.ContributionOutOfRange.selector, 5 * USDC, 50 * USDC)
        );
    }

    function test_theLastGapCanBeFilledBelowTheMinimum() public {
        uint256 orderId = _createGroup(100 * USDC);
        _contribute(orderId, 0, 50 * USDC);
        _contribute(orderId, 1, 47 * USDC);
        _expectContributeRevert(
            orderId,
            2,
            2 * USDC,
            abi.encodeWithSelector(IEscrowEvents.ContributionOutOfRange.selector, 5 * USDC, 50 * USDC)
        );
        _contribute(orderId, 2, 3 * USDC);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Open));
    }

    function test_contributionsCannotExceedTheTarget() public {
        uint256 orderId = _createGroup(100 * USDC);
        _contribute(orderId, 0, 50 * USDC);
        _contribute(orderId, 1, 40 * USDC);
        _expectContributeRevert(
            orderId, 2, 20 * USDC, abi.encodeWithSelector(IEscrowEvents.ExceedsTarget.selector, 10 * USDC)
        );
    }

    function test_zeroContributionsAreRejected() public {
        uint256 orderId = _createGroup(100 * USDC);
        vm.prank(members[0]);
        vm.expectRevert(IEscrowEvents.InvalidAmount.selector);
        escrow.contribute(orderId, 0, _noAuth());
    }

    function test_contributionsStopAtTheFundingDeadline() public {
        uint256 orderId = _createGroup(100 * USDC);
        vm.warp(_group(orderId).fundingDeadline + 1);
        _expectContributeRevert(orderId, 0, 10 * USDC, abi.encodeWithSelector(IEscrowEvents.FundingClosed.selector));
    }

    function test_aContributionRightAtTheDeadlineStillWorks() public {
        uint256 orderId = _createGroup(100 * USDC);
        vm.warp(_group(orderId).fundingDeadline);
        _contribute(orderId, 0, 10 * USDC);

        assertEq(escrow.contributionOf(orderId, members[0]), 10 * USDC);
    }

    function test_onlyFundingOrdersAcceptContributions() public {
        uint256 orderId = _openGroup();
        _expectContributeRevert(
            orderId,
            4,
            10 * USDC,
            abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Open)
        );
    }

    function test_plainOrdersAreNotFundingOrders() public {
        uint256 orderId = _createUsdc(100 * USDC);
        vm.prank(members[0]);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Open));
        escrow.contribute(orderId, uint128(10 * USDC), _noAuth());
    }

    function test_thirtyContributorsIsTheLimit() public {
        _setParameter(ParameterKeys.CONTRIBUTION_MIN_BPS, 0);
        uint256 orderId = _createGroup(1000 * USDC);
        for (uint256 i = 0; i < 30; i++) {
            address who = makeAddr(string.concat("crowd", vm.toString(i)));
            usdc.mint(who, USDC);
            vm.startPrank(who);
            usdc.approve(address(escrow), USDC);
            escrow.contribute(orderId, uint128(USDC), _noAuth());
            vm.stopPrank();
        }
        address extra = makeAddr("crowd30");
        usdc.mint(extra, USDC);
        vm.startPrank(extra);
        usdc.approve(address(escrow), USDC);
        vm.expectRevert(IEscrowEvents.TooManyContributors.selector);
        escrow.contribute(orderId, uint128(USDC), _noAuth());
        vm.stopPrank();
    }

    function test_contributionThroughTheForwarderAttributesTheSigner() public {
        uint256 orderId = _createGroup(100 * USDC);
        DepositAuth memory auth = _permitFor(members[0], memberKeys[0], 25 * USDC);
        _forward(
            memberKeys[0],
            members[0],
            address(escrow),
            abi.encodeCall(IEscrow.contribute, (orderId, uint128(25 * USDC), auth))
        );

        assertEq(escrow.contributionOf(orderId, members[0]), 25 * USDC);
    }

    function test_aContributorCanWithdrawWhileFunding() public {
        uint256 orderId = _createGroup(100 * USDC);
        _contribute(orderId, 0, 40 * USDC);
        _contribute(orderId, 1, 30 * USDC);
        uint256 before = usdc.balanceOf(members[0]);

        vm.expectEmit(true, true, false, true);
        emit IEscrowEvents.ContributionWithdrawn(orderId, members[0], uint128(40 * USDC));
        vm.prank(members[0]);
        escrow.withdrawContribution(orderId);

        assertEq(usdc.balanceOf(members[0]) - before, 40 * USDC);
        assertEq(escrow.contributionOf(orderId, members[0]), 0);
        assertEq(_group(orderId).totalContributed, 30 * USDC);
        assertEq(_order(orderId).deposited, 30 * USDC);
        assertEq(escrow.contributorsOf(orderId).length, 1);
    }

    function test_withdrawingFromAFundedOrderReopensTheFunding() public {
        uint256 orderId = _openGroup();
        vm.prank(members[1]);
        escrow.withdrawContribution(orderId);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Funding));
        assertEq(_order(orderId).deposited, 70 * USDC);
        address[] memory list = escrow.contributorsOf(orderId);
        assertEq(list.length, 3);
        assertEq(list[1], members[3]);
    }

    function test_aWithdrawnContributorCanContributeAgain() public {
        uint256 orderId = _openGroup();
        vm.prank(members[1]);
        escrow.withdrawContribution(orderId);
        _contribute(orderId, 1, 30 * USDC);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Open));
        assertEq(escrow.contributorsOf(orderId).length, 4);
    }

    function test_onlyContributorsCanWithdraw() public {
        uint256 orderId = _openGroup();
        vm.prank(members[5]);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotContributor.selector, members[5]));
        escrow.withdrawContribution(orderId);
    }

    function test_withdrawalsAreClosedAfterTheAgreement() public {
        uint256 orderId = _agreedGroup(100 * USDC);
        vm.prank(members[0]);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Agreed));
        escrow.withdrawContribution(orderId);
    }

    function test_withdrawalsNeedAGroupOrder() public {
        uint256 orderId = _createUsdc(100 * USDC);
        vm.prank(payer);
        vm.expectRevert(IEscrowEvents.NotGroup.selector);
        escrow.withdrawContribution(orderId);

        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.UnknownOrder.selector, 99));
        escrow.withdrawContribution(99);
    }

    function test_anExpiredFundingRefundsEveryContributor() public {
        uint256 orderId = _createGroup(100 * USDC);
        _contribute(orderId, 0, 40 * USDC);
        _contribute(orderId, 1, 30 * USDC);
        uint256 first = usdc.balanceOf(members[0]);
        uint256 second = usdc.balanceOf(members[1]);
        vm.warp(_group(orderId).fundingDeadline + 1);

        vm.expectEmit(true, false, false, true);
        emit IEscrowEvents.FundingRefunded(orderId, uint128(70 * USDC));
        vm.prank(other);
        escrow.refundFunding(orderId);

        assertEq(usdc.balanceOf(members[0]) - first, 40 * USDC);
        assertEq(usdc.balanceOf(members[1]) - second, 30 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Cancelled));
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_theFundingCannotBeRefundedBeforeTheDeadline() public {
        uint256 orderId = _createGroup(100 * USDC);
        _contribute(orderId, 0, 40 * USDC);
        uint40 deadline = _group(orderId).fundingDeadline;
        vm.warp(deadline);

        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.FundingNotExpired.selector, deadline));
        escrow.refundFunding(orderId);
    }

    function test_aFundedOrderCannotBeRefundedAsExpired() public {
        uint256 orderId = _openGroup();
        vm.warp(_group(orderId).fundingDeadline + 1);

        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.InvalidStatus.selector, orderId, OrderStatus.Open));
        escrow.refundFunding(orderId);
    }

    function test_anExpiredFundingWithoutContributionsJustCancels() public {
        uint256 orderId = _createGroup(100 * USDC);
        vm.warp(_group(orderId).fundingDeadline + 1);
        escrow.refundFunding(orderId);

        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Cancelled));
    }

    function test_theCoordinatorCancelsAFundingOrderAndEveryoneIsRefunded() public {
        uint256 orderId = _createGroup(100 * USDC);
        _contribute(orderId, 0, 40 * USDC);
        _contribute(orderId, 1, 30 * USDC);
        uint256 first = usdc.balanceOf(members[0]);
        uint256 second = usdc.balanceOf(members[1]);

        vm.prank(payer);
        escrow.cancel(orderId);

        assertEq(usdc.balanceOf(members[0]) - first, 40 * USDC);
        assertEq(usdc.balanceOf(members[1]) - second, 30 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Cancelled));
    }

    function test_cancellingAnOpenGroupOrderRefundsProportionally() public {
        uint256 orderId = _openGroup();
        uint256[4] memory before;
        for (uint256 i = 0; i < 4; i++) {
            before[i] = usdc.balanceOf(members[i]);
        }
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payer);
        escrow.cancel(orderId);

        assertEq(usdc.balanceOf(members[0]) - before[0], 40 * USDC);
        assertEq(usdc.balanceOf(members[1]) - before[1], 30 * USDC);
        assertEq(usdc.balanceOf(members[2]) - before[2], 20 * USDC);
        assertEq(usdc.balanceOf(members[3]) - before[3], 10 * USDC);
        assertEq(usdc.balanceOf(payer), payerBefore);
    }

    function test_contributorsCannotCancelTheOrder() public {
        uint256 orderId = _openGroup();
        vm.prank(members[0]);
        vm.expectRevert(abi.encodeWithSelector(IEscrowEvents.NotPayer.selector, members[0]));
        escrow.cancel(orderId);
    }

    function test_theModeratorCanBlockAFundingOrder() public {
        uint256 orderId = _createGroup(100 * USDC);
        _contribute(orderId, 0, 40 * USDC);
        uint256 before = usdc.balanceOf(members[0]);

        vm.prank(moderator);
        escrow.moderate(orderId, keccak256("prohibited"));

        assertEq(usdc.balanceOf(members[0]) - before, 40 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Cancelled));
    }

    function test_theModeratorCanBlockAFundedOrder() public {
        uint256 orderId = _openGroup();
        vm.prank(moderator);
        escrow.moderate(orderId, keccak256("prohibited"));

        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(usdc.balanceOf(members[0]), 40 * USDC);
    }

    function test_reservationsAreNotAvailableForGroupOrders() public {
        uint256 orderId = _openGroup();
        Reservation memory r =
            Reservation({orderId: orderId, payer: payer, payee: payee, expiry: uint40(block.timestamp + 24 hours)});
        bytes32 structHash = _reservationHash(r);
        bytes memory payerSig = _sign(payerKey, structHash);
        bytes memory payeeSig = _sign(payeeKey, structHash);
        vm.expectRevert(IEscrowEvents.NotAvailableForGroup.selector);
        escrow.reserve(r, payerSig, payeeSig);
    }
}
