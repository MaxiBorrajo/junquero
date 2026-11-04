// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Credentials} from "../src/Credentials.sol";
import {IERC5192} from "../src/interfaces/IERC5192.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract CredentialsTest is Test {
    Credentials internal credentials;
    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        credentials = new Credentials(admin);
    }

    function test_adminHoldsBothRoles() public view {
        assertTrue(credentials.hasRole(credentials.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(credentials.hasRole(credentials.ISSUER_ROLE(), admin));
    }

    function test_constructorRejectsZeroAdmin() public {
        vm.expectRevert(Credentials.ZeroAddress.selector);
        new Credentials(address(0));
    }

    function test_issueMintsALockedCredential() public {
        uint256 tokenId = credentials.tokenIdOf(alice);

        vm.expectEmit(false, false, false, true);
        emit IERC5192.Locked(tokenId);
        vm.expectEmit(true, false, false, true);
        emit Credentials.CredentialIssued(alice, 0);
        vm.prank(admin);
        credentials.issue(alice, 0);

        assertEq(credentials.ownerOf(tokenId), alice);
        assertTrue(credentials.locked(tokenId));
        assertTrue(credentials.has(alice));
        assertEq(credentials.levelOf(alice), 0);
        assertEq(credentials.balanceOf(alice), 1);
    }

    function test_issueAgainUpdatesTheLevelWithoutMintingTwice() public {
        vm.startPrank(admin);
        credentials.issue(alice, 0);
        credentials.issue(alice, 2);
        vm.stopPrank();

        assertEq(credentials.levelOf(alice), 2);
        assertEq(credentials.balanceOf(alice), 1);
    }

    function test_issueRejectsInvalidLevel() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(Credentials.InvalidLevel.selector, 3));
        credentials.issue(alice, 3);
    }

    function test_issueRejectsZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(Credentials.ZeroAddress.selector);
        credentials.issue(address(0), 0);
    }

    function test_issueRequiresTheIssuerRole() public {
        vm.prank(alice);
        vm.expectRevert();
        credentials.issue(alice, 0);
    }

    function test_revokeBurnsAndClearsTheLevel() public {
        vm.startPrank(admin);
        credentials.issue(alice, 2);
        vm.expectEmit(true, false, false, true);
        emit Credentials.CredentialRevoked(alice);
        credentials.revoke(alice);
        vm.stopPrank();

        assertFalse(credentials.has(alice));
        assertEq(credentials.balanceOf(alice), 0);
        vm.expectRevert(abi.encodeWithSelector(Credentials.NoCredential.selector, alice));
        credentials.levelOf(alice);
    }

    function test_revokeWithoutCredentialReverts() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(Credentials.NoCredential.selector, alice));
        credentials.revoke(alice);
    }

    function test_revokeRequiresTheIssuerRole() public {
        vm.prank(admin);
        credentials.issue(alice, 0);
        vm.prank(alice);
        vm.expectRevert();
        credentials.revoke(alice);
    }

    function test_reissueAfterRevokeStartsFromTheNewLevel() public {
        vm.startPrank(admin);
        credentials.issue(alice, 2);
        credentials.revoke(alice);
        credentials.issue(alice, 0);
        vm.stopPrank();

        assertEq(credentials.levelOf(alice), 0);
    }

    function test_transferIsBlocked() public {
        vm.prank(admin);
        credentials.issue(alice, 0);
        uint256 tokenId = credentials.tokenIdOf(alice);

        vm.prank(alice);
        vm.expectRevert(Credentials.Soulbound.selector);
        credentials.transferFrom(alice, bob, tokenId);

        vm.prank(alice);
        vm.expectRevert(Credentials.Soulbound.selector);
        credentials.safeTransferFrom(alice, bob, tokenId);
    }

    function test_approvedOperatorCannotTransferEither() public {
        vm.prank(admin);
        credentials.issue(alice, 0);
        uint256 tokenId = credentials.tokenIdOf(alice);

        vm.prank(alice);
        credentials.approve(bob, tokenId);
        vm.prank(bob);
        vm.expectRevert(Credentials.Soulbound.selector);
        credentials.transferFrom(alice, bob, tokenId);
    }

    function test_lockedRevertsForUnknownToken() public {
        uint256 tokenId = credentials.tokenIdOf(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId));
        credentials.locked(tokenId);
    }

    function test_supportsErc5192AndErc721() public view {
        assertTrue(credentials.supportsInterface(type(IERC5192).interfaceId));
        assertTrue(credentials.supportsInterface(0x80ac58cd));
        assertEq(type(IERC5192).interfaceId, bytes4(0xb45a3c0e));
    }

    function test_hasIsFalseForUnknownAccount() public view {
        assertFalse(credentials.has(alice));
    }

    function testFuzz_levelsUpToTheMaximumAreAccepted(uint8 level) public {
        level = uint8(bound(level, 0, 2));
        vm.prank(admin);
        credentials.issue(alice, level);
        assertEq(credentials.levelOf(alice), level);
    }

    function testFuzz_levelsAboveTheMaximumAreRejected(uint8 level) public {
        level = uint8(bound(level, 3, type(uint8).max));
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(Credentials.InvalidLevel.selector, level));
        credentials.issue(alice, level);
    }
}
