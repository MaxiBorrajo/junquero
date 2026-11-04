// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {MockPermit2} from "./mocks/MockPermit2.sol";

contract DeployTest is Test {
    Deploy internal script;
    Deploy.Deployment internal deployment;
    address internal admin;
    address internal nextAdmin = makeAddr("nextAdmin");

    function setUp() public {
        script = new Deploy();
        admin = address(script);
        deployment = script.deploy(admin, ISignatureTransfer(address(new MockPermit2())));
    }

    function test_wiresContractsTogether() public view {
        assertEq(address(deployment.escrow.registry()), address(deployment.registry));
        assertEq(deployment.escrow.treasury(), address(deployment.treasury));
        assertTrue(deployment.escrow.isTrustedForwarder(address(deployment.forwarder)));
    }

    function test_reputationAndReceiptAreWired() public view {
        assertEq(address(deployment.escrow.reputation()), address(deployment.reputation));
        assertTrue(deployment.reputation.hasRole(deployment.reputation.RECORDER_ROLE(), address(deployment.escrow)));
        assertEq(address(deployment.receipt.escrow()), address(deployment.escrow));
        assertTrue(deployment.receipt.isTrustedForwarder(address(deployment.forwarder)));
        assertEq(deployment.registry.get(ParameterKeys.REPUTATION_PAIR_CAP), 2);
    }

    function test_definesEveryParameterTheEscrowReads() public view {
        assertEq(deployment.registry.get(ParameterKeys.FEE_BPS), 0);
        assertEq(deployment.registry.get(ParameterKeys.REQUEST_CHANGES_MAX), 2);
        assertEq(deployment.registry.get(ParameterKeys.CASH_FEE_BPS), 200);
        assertEq(deployment.registry.get(ParameterKeys.AUTO_RELEASE_SHORT), 24 hours);
        assertEq(deployment.registry.get(ParameterKeys.CANCEL_FEE_AGREED_BPS), 1000);
        assertEq(deployment.registry.get(ParameterKeys.NO_SHOW_WAIT), 20 minutes);
        assertEq(deployment.registry.get(ParameterKeys.FREE_CANCELS_PER_ACCOUNT_MONTH), 2);
        assertEq(deployment.registry.get(ParameterKeys.FREE_CANCELS_PER_PAIR_MONTH), 1);
    }

    function test_feeStaysUnderTheTwoPercentCeiling() public view {
        (, uint64 max) = deployment.registry.bounds(ParameterKeys.FEE_BPS);
        assertEq(max, 200);
    }

    function test_handOverMovesEveryRole() public {
        script.handOver(deployment, nextAdmin, admin);

        bytes32 adminRole = deployment.registry.DEFAULT_ADMIN_ROLE();
        bytes32 tokenAdminRole = deployment.escrow.TOKEN_ADMIN_ROLE();
        bytes32 moderatorRole = deployment.escrow.MODERATOR_ROLE();
        assertTrue(deployment.registry.hasRole(adminRole, nextAdmin));
        assertTrue(deployment.registry.hasRole(deployment.registry.DEFINER_ROLE(), nextAdmin));
        assertTrue(deployment.treasury.hasRole(adminRole, nextAdmin));
        assertTrue(deployment.escrow.hasRole(adminRole, nextAdmin));
        assertTrue(deployment.escrow.hasRole(tokenAdminRole, nextAdmin));
        assertTrue(deployment.escrow.hasRole(moderatorRole, nextAdmin));
        assertTrue(deployment.credentials.hasRole(adminRole, nextAdmin));
        assertTrue(deployment.credentials.hasRole(deployment.credentials.ISSUER_ROLE(), nextAdmin));
        assertTrue(deployment.reputation.hasRole(adminRole, nextAdmin));

        assertFalse(deployment.registry.hasRole(adminRole, admin));
        assertFalse(deployment.registry.hasRole(deployment.registry.DEFINER_ROLE(), admin));
        assertFalse(deployment.treasury.hasRole(adminRole, admin));
        assertFalse(deployment.escrow.hasRole(adminRole, admin));
        assertFalse(deployment.escrow.hasRole(tokenAdminRole, admin));
        assertFalse(deployment.escrow.hasRole(moderatorRole, admin));
        assertFalse(deployment.credentials.hasRole(adminRole, admin));
        assertFalse(deployment.credentials.hasRole(deployment.credentials.ISSUER_ROLE(), admin));
        assertFalse(deployment.reputation.hasRole(adminRole, admin));
    }
}
