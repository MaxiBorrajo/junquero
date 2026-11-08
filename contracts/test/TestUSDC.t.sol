// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

contract TestUSDCTest is Test {
    TestUSDC internal token;
    address internal alice = makeAddr("alice");

    function setUp() public {
        token = new TestUSDC();
    }

    function test_hasSixDecimalsAndUsdcSymbol() public view {
        assertEq(token.decimals(), 6);
        assertEq(token.symbol(), "USDC");
    }

    function test_anyoneCanMintUpToTheLimit() public {
        vm.prank(alice);
        token.mint(alice, token.MAX_MINT());
        assertEq(token.balanceOf(alice), token.MAX_MINT());
    }

    function test_mintAboveTheLimitReverts() public {
        uint256 amount = token.MAX_MINT() + 1;
        vm.expectRevert(abi.encodeWithSelector(TestUSDC.MintLimitExceeded.selector, amount));
        token.mint(alice, amount);
    }

    function test_permitSetsAllowance() public {
        (address owner, uint256 key) = makeAddrAndKey("owner");
        address spender = makeAddr("spender");
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                owner,
                spender,
                5e6,
                token.nonces(owner),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        token.permit(owner, spender, 5e6, deadline, v, r, s);
        assertEq(token.allowance(owner, spender), 5e6);
    }
}
