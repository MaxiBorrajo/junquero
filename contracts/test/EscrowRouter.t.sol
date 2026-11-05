// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";
import {Escrow} from "../src/Escrow.sol";
import {OrderModule} from "../src/escrow/OrderModule.sol";
import {CancelModule} from "../src/escrow/CancelModule.sol";
import {AdminModule} from "../src/escrow/AdminModule.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {IEscrowFull} from "../src/interfaces/IEscrowFull.sol";
import {IParameterRegistry} from "../src/interfaces/IParameterRegistry.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";

contract EscrowRouterTest is EscrowBase {
    Escrow internal fresh;
    OrderModule internal orderModule;

    function setUp() public override {
        super.setUp();
        vm.startPrank(admin);
        fresh = new Escrow(admin, IParameterRegistry(address(registry)), address(treasury), permit2, address(forwarder));
        orderModule =
            new OrderModule(IParameterRegistry(address(registry)), address(treasury), permit2, address(forwarder));
        vm.stopPrank();
    }

    function _expectedSelectors() internal pure returns (bytes4[] memory list) {
        list = new bytes4[](23);
        list[0] = IEscrow.createOrder.selector;
        list[1] = IEscrow.reserve.selector;
        list[2] = IEscrow.withdrawReservation.selector;
        list[3] = IEscrow.agree.selector;
        list[4] = IEscrow.deliver.selector;
        list[5] = IEscrow.release.selector;
        list[6] = IEscrow.autoRelease.selector;
        list[7] = IEscrow.cancel.selector;
        list[8] = IEscrow.reclaim.selector;
        list[9] = IEscrow.checkIn.selector;
        list[10] = IEscrow.confirmArrival.selector;
        list[11] = IEscrow.claimNoShow.selector;
        list[12] = IEscrow.extendReview.selector;
        list[13] = IEscrow.requestChanges.selector;
        list[14] = IEscrow.moderate.selector;
        list[15] = IEscrow.claim.selector;
        list[16] = IEscrow.setReputation.selector;
        list[17] = IEscrow.configureToken.selector;
        list[18] = IEscrow.getOrder.selector;
        list[19] = IEscrow.tokenConfig.selector;
        list[20] = IEscrow.reservationCompensation.selector;
        list[21] = IEscrow.freeCancelsUsed.selector;
        list[22] = IEscrow.domainSeparator.selector;
    }

    function test_everyEscrowFunctionIsRouted() public view {
        bytes4[] memory list = _expectedSelectors();
        for (uint256 i = 0; i < list.length; i++) {
            assertTrue(escrow.moduleOf(list[i]) != address(0), "selector not routed");
        }
    }

    function test_selectorsAreSpreadAcrossTheThreeModules() public view {
        assertTrue(escrow.moduleOf(IEscrow.createOrder.selector) != escrow.moduleOf(IEscrow.cancel.selector));
        assertTrue(escrow.moduleOf(IEscrow.cancel.selector) != escrow.moduleOf(IEscrow.configureToken.selector));
    }

    function test_routedModulesAreLocked() public view {
        assertTrue(escrow.modulesLocked());
    }

    function test_setModuleRegistersEverySelectorOfTheModule() public {
        vm.expectEmit(true, false, false, true);
        emit Escrow.ModuleSet(address(orderModule), 9);
        vm.prank(admin);
        fresh.setModule(address(orderModule));

        assertEq(fresh.moduleOf(IEscrow.createOrder.selector), address(orderModule));
        assertEq(fresh.moduleOf(IEscrow.cancel.selector), address(0));
    }

    function test_setModuleRequiresTheAdminRole() public {
        vm.prank(other);
        vm.expectRevert();
        fresh.setModule(address(orderModule));
    }

    function test_setModuleRejectsAModuleBuiltWithOtherImmutables() public {
        OrderModule stranger = new OrderModule(
            IParameterRegistry(address(registry)), makeAddr("otherTreasury"), permit2, address(forwarder)
        );
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(Escrow.ModuleMismatch.selector, address(stranger)));
        fresh.setModule(address(stranger));
    }

    function test_setModuleRejectsASelectorTakenByAnotherModule() public {
        vm.startPrank(admin);
        fresh.setModule(address(orderModule));
        vm.expectRevert(abi.encodeWithSelector(Escrow.SelectorTaken.selector, IEscrow.createOrder.selector));
        fresh.setModule(address(orderModule));
        vm.stopPrank();
    }

    function test_lockedRouterRejectsNewModules() public {
        vm.startPrank(admin);
        fresh.lockModules();
        vm.expectRevert(Escrow.ModulesAreLocked.selector);
        fresh.setModule(address(orderModule));
        vm.stopPrank();
    }

    function test_lockModulesRequiresTheAdminRole() public {
        vm.prank(other);
        vm.expectRevert();
        fresh.lockModules();
    }

    function test_lockEmitsEvent() public {
        vm.expectEmit(false, false, false, false);
        emit Escrow.ModulesLocked();
        vm.prank(admin);
        fresh.lockModules();
    }

    function test_unroutedSelectorReverts() public {
        vm.expectRevert(abi.encodeWithSelector(Escrow.UnknownFunction.selector, bytes4(0xdeadbeef)));
        (bool ok,) = address(escrow).call(abi.encodeWithSelector(bytes4(0xdeadbeef)));
        assertTrue(ok);
    }

    function test_unroutedSelectorOnAnEmptyRouterReverts() public {
        vm.expectRevert(abi.encodeWithSelector(Escrow.UnknownFunction.selector, IEscrow.getOrder.selector));
        IEscrow(address(fresh)).getOrder(1);
    }

    function test_etherCannotBeSentToTheRouter() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(escrow).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(address(escrow).balance, 0);
    }

    function test_callingAModuleDirectlyCannotTouchTheRouterState() public {
        uint256 before = escrow.lastOrderId();
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(TOKEN_NOT_ALLOWED, address(usdc)));
        orderModule.createOrder(_params(address(usdc), 10 * USDC), _noAuth());
        assertEq(escrow.lastOrderId(), before);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_routerKeepsItsOwnRolesAndGetters() public view {
        assertTrue(escrow.hasRole(escrow.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(escrow.hasRole(escrow.MODERATOR_ROLE(), moderator));
        assertEq(address(escrow.registry()), address(registry));
        assertEq(escrow.treasury(), address(treasury));
        assertTrue(escrow.isTrustedForwarder(address(forwarder)));
    }

    function test_moduleConfigHashMatchesTheRouter() public view {
        assertEq(orderModule.configHash(), fresh.configHash());
    }
}

bytes4 constant TOKEN_NOT_ALLOWED = bytes4(keccak256("TokenNotAllowed(address)"));
