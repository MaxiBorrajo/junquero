// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IEscrowFull} from "../src/interfaces/IEscrowFull.sol";
import {EscrowAssembly} from "./lib/EscrowAssembly.sol";
import {Forwarder} from "../src/Forwarder.sol";
import {Treasury} from "../src/Treasury.sol";
import {Credentials} from "../src/Credentials.sol";
import {Reputation} from "../src/Reputation.sol";
import {Receipt as JunqueroReceipt} from "../src/Receipt.sol";
import {Arbitration} from "../src/Arbitration.sol";
import {IReputation} from "../src/interfaces/IReputation.sol";
import {IArbitration} from "../src/interfaces/IArbitration.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {ParameterRegistry} from "../src/ParameterRegistry.sol";
import {IParameterRegistry} from "../src/interfaces/IParameterRegistry.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {DepositMethod, TokenConfig} from "../src/libraries/OrderTypes.sol";

contract Deploy is Script {
    address internal constant CANONICAL_PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    uint256 internal constant UNIT = 1e6;

    struct Deployment {
        Forwarder forwarder;
        ParameterRegistry registry;
        Treasury treasury;
        IEscrowFull escrow;
        Credentials credentials;
        Reputation reputation;
        JunqueroReceipt receipt;
        Arbitration arbitration;
    }

    function run() external returns (Deployment memory deployment) {
        address permit2 = vm.envOr("PERMIT2", CANONICAL_PERMIT2);
        address usdc = vm.envOr("USDC", address(0));
        bool demo = vm.envOr("DEMO", false);
        address usdt = vm.envOr("USDT", address(0));
        address finalAdmin = vm.envOr("FINAL_ADMIN", address(0));

        vm.startBroadcast();
        require(usdc != address(0), "USDC required as the juror stake token");
        deployment = deploy(msg.sender, ISignatureTransfer(permit2), IERC20(usdc), demo);
        if (usdc != address(0)) _configureToken(deployment.escrow, usdc, DepositMethod.Permit);
        if (usdt != address(0)) _configureToken(deployment.escrow, usdt, DepositMethod.Permit2);
        if (finalAdmin != address(0) && finalAdmin != msg.sender) handOver(deployment, finalAdmin, msg.sender);
        vm.stopBroadcast();

        console.log("Forwarder", address(deployment.forwarder));
        console.log("ParameterRegistry", address(deployment.registry));
        console.log("Treasury", address(deployment.treasury));
        console.log("Escrow", address(deployment.escrow));
        console.log("Credentials", address(deployment.credentials));
        console.log("Reputation", address(deployment.reputation));
        console.log("Receipt", address(deployment.receipt));
        console.log("Arbitration", address(deployment.arbitration));
    }

    function deploy(address admin, ISignatureTransfer permit2, IERC20 stakeToken, bool demo)
        public
        returns (Deployment memory deployment)
    {
        deployment.forwarder = new Forwarder();
        deployment.registry = new ParameterRegistry(admin);
        deployment.treasury = new Treasury(admin);
        deployment.escrow = EscrowAssembly.deploy(
            admin,
            IParameterRegistry(address(deployment.registry)),
            address(deployment.treasury),
            permit2,
            address(deployment.forwarder)
        );
        _defineParameters(deployment.registry, demo);
        deployment.credentials = new Credentials(admin);
        deployment.reputation = new Reputation(admin, IParameterRegistry(address(deployment.registry)));
        deployment.receipt = new JunqueroReceipt(IEscrow(address(deployment.escrow)), address(deployment.forwarder));
        deployment.reputation.grantRole(deployment.reputation.RECORDER_ROLE(), address(deployment.escrow));
        deployment.escrow.setReputation(deployment.reputation);
        deployment.arbitration = new Arbitration(
            admin,
            deployment.escrow,
            IParameterRegistry(address(deployment.registry)),
            deployment.credentials,
            IReputation(address(deployment.reputation)),
            stakeToken,
            address(deployment.treasury),
            address(deployment.forwarder)
        );
        deployment.reputation.grantRole(deployment.reputation.RECORDER_ROLE(), address(deployment.arbitration));
        deployment.escrow.setArbitration(IArbitration(address(deployment.arbitration)));
    }

    function handOver(Deployment memory deployment, address newAdmin, address previousAdmin) public {
        bytes32 adminRole = deployment.registry.DEFAULT_ADMIN_ROLE();
        bytes32 definerRole = deployment.registry.DEFINER_ROLE();
        bytes32 tokenAdminRole = deployment.escrow.TOKEN_ADMIN_ROLE();
        bytes32 moderatorRole = deployment.escrow.MODERATOR_ROLE();
        bytes32 issuerRole = deployment.credentials.ISSUER_ROLE();

        deployment.registry.grantRole(adminRole, newAdmin);
        deployment.registry.grantRole(definerRole, newAdmin);
        deployment.treasury.grantRole(adminRole, newAdmin);
        deployment.escrow.grantRole(adminRole, newAdmin);
        deployment.escrow.grantRole(tokenAdminRole, newAdmin);
        deployment.escrow.grantRole(moderatorRole, newAdmin);
        deployment.credentials.grantRole(adminRole, newAdmin);
        deployment.credentials.grantRole(issuerRole, newAdmin);
        deployment.reputation.grantRole(adminRole, newAdmin);
        deployment.arbitration.grantRole(adminRole, newAdmin);
        deployment.arbitration.grantRole(deployment.arbitration.SEEDER_ROLE(), newAdmin);
        deployment.arbitration.grantRole(deployment.arbitration.EMERGENCY_ROLE(), newAdmin);

        deployment.registry.renounceRole(definerRole, previousAdmin);
        deployment.registry.renounceRole(adminRole, previousAdmin);
        deployment.treasury.renounceRole(adminRole, previousAdmin);
        deployment.escrow.renounceRole(tokenAdminRole, previousAdmin);
        deployment.escrow.renounceRole(moderatorRole, previousAdmin);
        deployment.credentials.renounceRole(issuerRole, previousAdmin);
        deployment.credentials.renounceRole(adminRole, previousAdmin);
        deployment.reputation.renounceRole(adminRole, previousAdmin);
        deployment.arbitration.renounceRole(deployment.arbitration.SEEDER_ROLE(), previousAdmin);
        deployment.arbitration.renounceRole(deployment.arbitration.EMERGENCY_ROLE(), previousAdmin);
        deployment.arbitration.renounceRole(adminRole, previousAdmin);
        deployment.escrow.renounceRole(adminRole, previousAdmin);
    }

    function _defineParameters(ParameterRegistry registry, bool demo) private {
        registry.defineParameter(ParameterKeys.FEE_BPS, 0, 200, 0);
        registry.defineParameter(ParameterKeys.REQUEST_CHANGES_MAX, 0, 5, 2);
        registry.defineParameter(ParameterKeys.CONTRIBUTION_MIN_BPS, 0, 2000, 500);
        registry.defineParameter(ParameterKeys.CONTRIBUTION_MAX_BPS, 1000, 10_000, 5000);
        registry.defineParameter(ParameterKeys.OBJECTION_MONEY_BPS, 100, 10_000, 2500);
        registry.defineParameter(ParameterKeys.OBJECTION_MIN_PEOPLE, 1, 10, 2);
        registry.defineParameter(ParameterKeys.GROUP_VETO_WINDOW, 1 hours, 7 days, 24 hours);
        registry.defineParameter(ParameterKeys.MILESTONE_MIN_DURATION, 1 hours, 90 days, 5 days);
        registry.defineParameter(ParameterKeys.AUTO_RELEASE_MILESTONE, 1 hours, 14 days, 72 hours);
        registry.defineParameter(ParameterKeys.ADVANCE_MAX_BPS, 0, 5000, 3000);
        registry.defineParameter(ParameterKeys.ADVANCE_MIN_CLOSED_ORDERS, 0, 100, 5);
        registry.defineParameter(ParameterKeys.TERMINATION_COMP_BPS, 0, 2000, 1000);
        registry.defineParameter(ParameterKeys.JURY_SIZE_MEDIUM, 1, 15, 3);
        registry.defineParameter(ParameterKeys.JURY_SIZE_LARGE, 1, 15, 5);
        registry.defineParameter(ParameterKeys.SMALL_DISPUTES_PER_ACCOUNT_MONTH, 0, 20, 3);
        registry.defineParameter(ParameterKeys.REPUTATION_PAIR_CAP, 1, 10, 2);
        registry.defineParameter(ParameterKeys.AUTO_RELEASE_SHORT, 1 hours, 7 days, 24 hours);
        registry.defineParameter(ParameterKeys.RESERVATION_GRACE, 0, 7 days, 12 hours);
        registry.defineParameter(ParameterKeys.RESERVATION_RAMP, 1 hours, 30 days, 3 days);
        registry.defineParameter(ParameterKeys.RESERVATION_MAX_BPS, 0, 300, 200);
        registry.defineParameter(ParameterKeys.CASH_FEE_BPS, 0, 1000, 200);
        registry.defineParameter(ParameterKeys.CANCEL_FEE_AGREED_BPS, 0, 2000, 1000);
        registry.defineParameter(ParameterKeys.CANCEL_PAYEE_SHARE_BPS, 5000, 10_000, 8000);
        registry.defineParameter(ParameterKeys.NO_SHOW_COMPENSATION_BPS, 0, 2000, 1000);
        registry.defineParameter(ParameterKeys.NO_SHOW_WAIT, 5 minutes, 2 hours, 20 minutes);
        registry.defineParameter(ParameterKeys.FREE_CANCEL_NOTICE, 1 hours, 7 days, 24 hours);
        registry.defineParameter(ParameterKeys.FREE_CANCELS_PER_ACCOUNT_MONTH, 0, 10, 2);
        registry.defineParameter(ParameterKeys.FREE_CANCELS_PER_PAIR_MONTH, 0, 10, 1);
        _defineArbitrationParameters(registry, demo);
    }

    function _defineArbitrationParameters(ParameterRegistry registry, bool demo) private {
        uint64 floor = demo ? 1 minutes : 1 hours;
        registry.defineParameter(ParameterKeys.JUROR_STAKE, 0, uint64(1_000_000 * UNIT), uint64(10 * UNIT));
        registry.defineParameter(ParameterKeys.JUROR_MIN_CLOSED, 0, 100, 0);
        registry.defineParameter(ParameterKeys.JUROR_MIN_LEVEL, 0, 2, 0);
        registry.defineParameter(ParameterKeys.RECUSALS_PER_PARTY, 0, 5, 1);
        registry.defineParameter(ParameterKeys.SLASH_MINORITY_BPS, 0, 10_000, 2500);
        registry.defineParameter(ParameterKeys.JUROR_REPLACEMENT_ROUNDS, 0, 5, 3);
        registry.defineParameter(ParameterKeys.JUROR_MAX_ACTIVE_CASES, 1, 10, 2);
        registry.defineParameter(
            ParameterKeys.DISPUTE_RESPONSE_WINDOW, floor, 14 days, demo ? uint64(5 minutes) : uint64(72 hours)
        );
        registry.defineParameter(
            ParameterKeys.JUROR_INVITE_WINDOW, floor, 7 days, demo ? uint64(5 minutes) : uint64(24 hours)
        );
        registry.defineParameter(
            ParameterKeys.SEED_REVEAL_WINDOW, floor, 3 days, demo ? uint64(5 minutes) : uint64(6 hours)
        );
        registry.defineParameter(
            ParameterKeys.VOTE_COMMIT_WINDOW, floor, 7 days, demo ? uint64(5 minutes) : uint64(24 hours)
        );
        registry.defineParameter(
            ParameterKeys.VOTE_REVEAL_WINDOW, floor, 7 days, demo ? uint64(5 minutes) : uint64(24 hours)
        );
    }

    function _configureToken(IEscrowFull escrow, address token, DepositMethod method) private {
        escrow.configureToken(
            token,
            TokenConfig({
                allowed: true,
                method: method,
                smallMax: uint128(20 * UNIT),
                mediumMax: uint128(300 * UNIT),
                milestoneAmount: uint128(150 * UNIT),
                witnessAmount: uint128(300 * UNIT),
                reputationMin: uint128(5 * UNIT),
                feeFloor: uint128(UNIT / 4),
                feeCap: uint128(5 * UNIT),
                cashFeeFloor: uint128(UNIT),
                reservationCap: uint128(10 * UNIT),
                jurorFee: uint128(UNIT)
            })
        );
    }
}
