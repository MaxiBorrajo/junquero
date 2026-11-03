// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockToken} from "./mocks/MockToken.sol";

contract TreasuryTest is Test {
    Treasury treasury;
    MockToken token;
    address admin = makeAddr("admin");
    address spender = makeAddr("spender");
    address receiver = makeAddr("receiver");

    function setUp() public {
        treasury = new Treasury(admin);
        token = new MockToken("USDC", 6);
        bytes32 spenderRole = treasury.SPENDER_ROLE();
        vm.prank(admin);
        treasury.grantRole(spenderRole, spender);
        token.mint(address(treasury), 1_000e6);
    }

    function test_spenderWithdraws() public {
        vm.prank(spender);
        treasury.withdraw(token, receiver, 400e6);
        assertEq(token.balanceOf(receiver), 400e6);
        assertEq(token.balanceOf(address(treasury)), 600e6);
    }

    function test_adminWithoutSpenderRoleCannotWithdraw() public {
        vm.prank(admin);
        vm.expectRevert();
        treasury.withdraw(token, receiver, 1);
    }

    function test_revertsOnZeroAddress() public {
        vm.prank(spender);
        vm.expectRevert(Treasury.ZeroAddress.selector);
        treasury.withdraw(token, address(0), 1);
    }

    function test_revertsWhenAmountExceedsBalance() public {
        vm.prank(spender);
        vm.expectRevert();
        treasury.withdraw(token, receiver, 1_001e6);
    }
}
