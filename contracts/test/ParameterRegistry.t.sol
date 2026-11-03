// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ParameterRegistry} from "../src/ParameterRegistry.sol";
import {IParameterRegistry} from "../src/interfaces/IParameterRegistry.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";

contract ParameterRegistryTest is Test {
    ParameterRegistry registry;
    address admin = makeAddr("admin");
    address setter = makeAddr("setter");
    address stranger = makeAddr("stranger");

    function setUp() public {
        registry = new ParameterRegistry(admin);
        bytes32 setterRole = registry.SETTER_ROLE();
        vm.startPrank(admin);
        registry.grantRole(setterRole, setter);
        registry.defineParameter(ParameterKeys.FEE_BPS, 0, 200, 0);
        vm.stopPrank();
    }

    function test_defineStoresValueAndBounds() public view {
        assertEq(registry.get(ParameterKeys.FEE_BPS), 0);
        (uint64 min, uint64 max) = registry.bounds(ParameterKeys.FEE_BPS);
        assertEq(min, 0);
        assertEq(max, 200);
    }

    function test_defineRevertsWhenAlreadyDefined() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IParameterRegistry.ParameterAlreadyDefined.selector, ParameterKeys.FEE_BPS));
        registry.defineParameter(ParameterKeys.FEE_BPS, 0, 100, 0);
    }

    function test_defineRevertsOnInvertedBounds() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IParameterRegistry.InvalidBounds.selector, 10, 5));
        registry.defineParameter(keccak256("X"), 10, 5, 7);
    }

    function test_defineRevertsWhenInitialValueOutOfBounds() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IParameterRegistry.ValueOutOfBounds.selector, keccak256("X"), 11, 1, 10));
        registry.defineParameter(keccak256("X"), 1, 10, 11);
    }

    function test_defineRequiresDefinerRole() public {
        vm.prank(stranger);
        vm.expectRevert();
        registry.defineParameter(keccak256("X"), 0, 1, 0);
    }

    function test_adminCannotSetWithoutSetterRole() public {
        bytes32 setterRole = registry.SETTER_ROLE();
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, admin, setterRole)
        );
        registry.set(ParameterKeys.FEE_BPS, 100);
    }

    function test_setterUpdatesWithinBounds() public {
        vm.prank(setter);
        registry.set(ParameterKeys.FEE_BPS, 100);
        assertEq(registry.get(ParameterKeys.FEE_BPS), 100);
    }

    function test_setRevertsAboveMax() public {
        vm.prank(setter);
        vm.expectRevert(
            abi.encodeWithSelector(IParameterRegistry.ValueOutOfBounds.selector, ParameterKeys.FEE_BPS, 201, 0, 200)
        );
        registry.set(ParameterKeys.FEE_BPS, 201);
    }

    function test_setRevertsWhenNotDefined() public {
        vm.prank(setter);
        vm.expectRevert(abi.encodeWithSelector(IParameterRegistry.ParameterNotDefined.selector, keccak256("Y")));
        registry.set(keccak256("Y"), 1);
    }

    function test_getRevertsWhenNotDefined() public {
        vm.expectRevert(abi.encodeWithSelector(IParameterRegistry.ParameterNotDefined.selector, keccak256("Y")));
        registry.get(keccak256("Y"));
    }

    function testFuzz_setNeverEscapesBounds(uint64 value) public {
        vm.prank(setter);
        if (value > 200) {
            vm.expectRevert();
            registry.set(ParameterKeys.FEE_BPS, value);
        } else {
            registry.set(ParameterKeys.FEE_BPS, value);
            assertEq(registry.get(ParameterKeys.FEE_BPS), value);
        }
    }
}
