// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {console} from "forge-std/console.sol";
import {EscrowBase} from "../EscrowBase.sol";
import {EscrowHandler} from "./EscrowHandler.sol";
import {IArbitration} from "../../src/interfaces/IArbitration.sol";
import {MockArbitration} from "../mocks/MockArbitration.sol";
import {
    Order,
    OrderStatus,
    Milestone,
    MilestoneStatus,
    GroupInfo,
    TokenConfig
} from "../../src/libraries/OrderTypes.sol";

contract EscrowInvariantsTest is StdInvariant, EscrowBase {
    EscrowHandler internal handler;
    MockArbitration internal court;

    function setUp() public override {
        super.setUp();
        court = new MockArbitration(escrow);
        vm.startPrank(admin);
        escrow.setArbitration(IArbitration(address(court)));
        escrow.grantRole(escrow.MODERATOR_ROLE(), address(this));
        vm.stopPrank();

        handler = new EscrowHandler(escrow, usdc, court);
        vm.startPrank(admin);
        escrow.grantRole(escrow.MODERATOR_ROLE(), address(handler));
        vm.stopPrank();
        vm.warp(1_700_000_000);

        bytes4[] memory selectors = new bytes4[](17);
        selectors[0] = handler.createPlain.selector;
        selectors[1] = handler.createGroup.selector;
        selectors[2] = handler.contribute.selector;
        selectors[3] = handler.withdrawContribution.selector;
        selectors[4] = handler.refundFunding.selector;
        selectors[5] = handler.agree.selector;
        selectors[6] = handler.agreeMilestones.selector;
        selectors[7] = handler.deliver.selector;
        selectors[8] = handler.release.selector;
        selectors[9] = handler.autoRelease.selector;
        selectors[10] = handler.cancel.selector;
        selectors[11] = handler.terminateEarly.selector;
        selectors[12] = handler.abandon.selector;
        selectors[13] = handler.requestChanges.selector;
        selectors[14] = handler.openDispute.selector;
        selectors[15] = handler.resolve.selector;
        selectors[16] = handler.moderate.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    function _actorsMoney() internal view returns (uint256 total) {
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            total += usdc.balanceOf(handler.actors(i));
        }
    }

    function invariant_theEscrowBalanceIsExactlyWhatIsLocked() public view {
        uint256 locked;
        uint256 claimables;
        for (uint256 id = 1; id <= escrow.lastOrderId(); id++) {
            Order memory order = escrow.getOrder(id);
            locked += order.deposited;
        }
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            claimables += escrow.claimable(address(usdc), handler.actors(i));
        }
        claimables += escrow.claimable(address(usdc), address(treasury));
        claimables += escrow.claimable(address(usdc), address(court));

        assertEq(usdc.balanceOf(address(escrow)), locked + claimables);
    }

    function invariant_noMoneyIsCreatedOrDestroyed() public view {
        uint256 total = _actorsMoney() + usdc.balanceOf(address(escrow)) + usdc.balanceOf(address(treasury))
            + usdc.balanceOf(address(court));
        assertEq(total, handler.initialSupply());
    }

    function invariant_finishedOrdersHoldNothing() public view {
        for (uint256 id = 1; id <= escrow.lastOrderId(); id++) {
            Order memory order = escrow.getOrder(id);
            if (order.status == OrderStatus.Settled || order.status == OrderStatus.Cancelled) {
                assertEq(order.deposited, 0);
            }
        }
    }

    function invariant_milestoneFundsMatchTheUnpaidMilestones() public view {
        for (uint256 id = 1; id <= escrow.lastOrderId(); id++) {
            Order memory order = escrow.getOrder(id);
            if (!order.hasMilestones) continue;
            if (order.status != OrderStatus.Agreed && order.status != OrderStatus.Disputed) continue;
            Milestone[] memory list = escrow.getMilestones(id);
            uint256 unpaid;
            for (uint256 i = 0; i < list.length; i++) {
                if (list[i].status != MilestoneStatus.Paid) unpaid += list[i].amount;
            }
            assertEq(order.deposited, unpaid);
        }
    }

    function invariant_groupContributionsAddUp() public view {
        for (uint256 id = 1; id <= escrow.lastOrderId(); id++) {
            Order memory order = escrow.getOrder(id);
            if (!order.isGroup) continue;
            GroupInfo memory info = escrow.getGroup(id);
            address[] memory list = escrow.contributorsOf(id);
            uint256 sum;
            for (uint256 i = 0; i < list.length; i++) {
                sum += escrow.contributionOf(id, list[i]);
            }
            assertEq(sum, info.totalContributed);
            assertLe(order.deposited, info.totalContributed);
            if (order.status == OrderStatus.Funding) assertEq(order.deposited, info.totalContributed);
            assertLe(info.totalContributed, info.target);
        }
    }

    function invariant_aPlainOrderNeverHoldsMoreThanItsPrice() public view {
        for (uint256 id = 1; id <= escrow.lastOrderId(); id++) {
            Order memory order = escrow.getOrder(id);
            if (order.status == OrderStatus.Agreed || order.status == OrderStatus.Delivered) {
                assertLe(order.deposited, order.price);
            }
        }
    }

    function _checkAll() internal view {
        invariant_theEscrowBalanceIsExactlyWhatIsLocked();
        invariant_noMoneyIsCreatedOrDestroyed();
        invariant_finishedOrdersHoldNothing();
        invariant_milestoneFundsMatchTheUnpaidMilestones();
        invariant_groupContributionsAddUp();
        invariant_aPlainOrderNeverHoldsMoreThanItsPrice();
    }

    function test_theHandlerReachesAJuryDisputeAndTheInvariantsHold() public {
        handler.createPlain(0, 100 * 1e6, false);
        handler.agree(0, 100 * 1e6);
        handler.deliver(0);
        handler.openDispute(0, false);
        assertEq(uint8(escrow.getOrder(1).status), uint8(OrderStatus.Disputed));
        _checkAll();

        handler.resolve(0, 7000, false);
        assertEq(uint8(escrow.getOrder(1).status), uint8(OrderStatus.Settled));
        _checkAll();
    }

    function test_theHandlerReachesMilestonesAndTheInvariantsHold() public {
        handler.createPlain(1, 200 * 1e6, false);
        handler.agreeMilestones(0, 80 * 1e6);
        assertTrue(escrow.getOrder(1).hasMilestones);
        handler.deliver(0);
        handler.release(0, 6000);
        _checkAll();
        handler.deliver(0);
        handler.release(0, 10_000);
        assertEq(uint8(escrow.getOrder(1).status), uint8(OrderStatus.Settled));
        _checkAll();
    }

    function test_theHandlerReachesAGroupSettlementAndTheInvariantsHold() public {
        handler.createGroup(0, 100 * 1e6);
        uint256 target = escrow.getGroup(1).target;
        for (uint256 i = 0; i < 40 && uint8(escrow.getOrder(1).status) == uint8(OrderStatus.Funding); i++) {
            handler.contribute(0, i, target + i);
        }
        assertEq(uint8(escrow.getOrder(1).status), uint8(OrderStatus.Open));
        handler.agree(0, 70 * 1e6);
        assertEq(uint8(escrow.getOrder(1).status), uint8(OrderStatus.Agreed));
        _checkAll();
        handler.release(0, 5000);
        _checkAll();
    }

    function afterInvariant() public view {
        uint256[9] memory byStatus;
        uint256 milestoned;
        uint256 groups;
        for (uint256 id = 1; id <= escrow.lastOrderId(); id++) {
            Order memory order = escrow.getOrder(id);
            byStatus[uint8(order.status)]++;
            if (order.hasMilestones) milestoned++;
            if (order.isGroup) groups++;
        }
        console.log("orders", escrow.lastOrderId());
        console.log("open/reserved/agreed", byStatus[1], byStatus[2], byStatus[3]);
        console.log("delivered/disputed", byStatus[4], byStatus[5]);
        console.log("settled/cancelled/funding", byStatus[6], byStatus[7], byStatus[8]);
        console.log("milestoned/group", milestoned, groups);
    }
}
