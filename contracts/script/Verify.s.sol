// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IEscrowFull} from "../src/interfaces/IEscrowFull.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {Arbitration} from "../src/Arbitration.sol";
import {Credentials} from "../src/Credentials.sol";
import {Reputation} from "../src/Reputation.sol";
import {Treasury} from "../src/Treasury.sol";
import {ParameterRegistry} from "../src/ParameterRegistry.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {TokenConfig, DepositMethod} from "../src/libraries/OrderTypes.sol";

contract Verify is Script {
    uint256 internal failures;
    string internal json;
    IEscrowFull internal escrow;
    Arbitration internal arbitration;
    Credentials internal credentials;
    Reputation internal reputation;
    Treasury internal treasury;
    ParameterRegistry internal registry;
    TimelockController internal timelock;
    address internal token;
    address internal admin;
    address internal deployer;
    address internal owner;

    function run() external {
        json = vm.readFile(
            string.concat(vm.projectRoot(), "/deployments/", vm.envOr("DEPLOYMENT", string("sepolia")), ".json")
        );
        admin = vm.parseJsonAddress(json, ".admin");
        deployer = vm.parseJsonAddress(json, ".deployer");
        bool demo = keccak256(bytes(vm.parseJsonString(json, ".mode"))) == keccak256("demo");

        escrow = IEscrowFull(_addr("escrow"));
        arbitration = Arbitration(_addr("arbitration"));
        credentials = Credentials(_addr("credentials"));
        reputation = Reputation(_addr("reputation"));
        treasury = Treasury(_addr("treasury"));
        registry = ParameterRegistry(_addr("parameterRegistry"));
        timelock = TimelockController(payable(_addr("timelock")));
        token = _addr("token");
        owner = vm.parseJsonBool(json, ".governanceHandedOver") ? address(timelock) : admin;

        _codeExists();
        _wiring();
        _token();
        _parameters(demo);
        _roles();
        _modules();

        console.log("failures", failures);
        require(failures == 0, "deployment check failed");
    }

    function _codeExists() private {
        string[11] memory names = [
            "token",
            "forwarder",
            "parameterRegistry",
            "treasury",
            "escrow",
            "credentials",
            "reputation",
            "receipt",
            "arbitration",
            "votingWeight",
            "governor"
        ];
        for (uint256 i; i < names.length; i++) {
            _check(_addr(names[i]).code.length > 0, string.concat("code at ", names[i]));
        }
        _check(_addr("timelock").code.length > 0, "code at timelock");
    }

    function _wiring() private {
        _check(address(escrow.registry()) == address(registry), "escrow.registry");
        _check(escrow.treasury() == address(treasury), "escrow.treasury");
        _check(address(escrow.permit2()) == vm.parseJsonAddress(json, ".permit2"), "escrow.permit2");
        _check(address(escrow.reputation()) == address(reputation), "escrow.reputation");
        _check(address(escrow.arbitration()) == address(arbitration), "escrow.arbitration");
        _check(escrow.isTrustedForwarder(_addr("forwarder")), "escrow forwarder");
        _check(address(arbitration.escrow()) == address(escrow), "arbitration.escrow");
        _check(address(arbitration.stakeToken()) == token, "arbitration.stakeToken");
        _check(arbitration.treasury() == address(treasury), "arbitration.treasury");
        _check(reputation.hasRole(reputation.RECORDER_ROLE(), address(escrow)), "recorder escrow");
        _check(reputation.hasRole(reputation.RECORDER_ROLE(), address(arbitration)), "recorder arbitration");
        _check(treasury.hasRole(treasury.SPENDER_ROLE(), address(escrow)), "spender escrow");
    }

    function _token() private {
        TokenConfig memory config = escrow.tokenConfig(token);
        _check(config.allowed, "token allowed");
        _check(config.method == DepositMethod.Permit, "token method");
        _check(config.smallMax == 20e6 && config.mediumMax == 300e6, "token size thresholds");
        _check(config.witnessAmount == 300e6, "token witness");
        _check(config.jurorFee == 1e6, "token juror fee");
    }

    function _parameters(bool demo) private {
        _check(registry.get(ParameterKeys.FEE_BPS) == 0, "fee 0");
        _check(registry.get(ParameterKeys.JUROR_STAKE) == 10e6, "juror stake");
        _check(registry.get(ParameterKeys.VOTE_DEPOSIT) == 5e6, "vote deposit");
        _check(registry.get(ParameterKeys.VOTE_WEIGHT_CAP) == 20, "weight cap");
        _check(registry.get(ParameterKeys.RESERVATION_GRACE) == 12 hours, "reservation grace");
        _check(registry.get(ParameterKeys.RESERVATION_RAMP) == 3 days, "reservation ramp");
        _check(registry.get(ParameterKeys.RESERVATION_MAX_BPS) == 200, "reservation max");
        _check(registry.get(ParameterKeys.AUTO_RELEASE_SHORT) == 24 hours, "auto release short");
        _check(registry.get(ParameterKeys.AUTO_RELEASE_MILESTONE) == 72 hours, "auto release milestone");
        _check(registry.get(ParameterKeys.DISPUTE_RESPONSE_WINDOW) == (demo ? 5 minutes : 72 hours), "response window");
        _check(registry.get(ParameterKeys.VOTE_REVEAL_WINDOW) == (demo ? 5 minutes : 24 hours), "reveal window");
    }

    function _roles() private {
        bytes32 root = 0x00;
        _check(escrow.hasRole(escrow.MODERATOR_ROLE(), admin), "admin moderator");
        _check(credentials.hasRole(credentials.ISSUER_ROLE(), admin), "admin issuer");
        _check(arbitration.hasRole(arbitration.SEEDER_ROLE(), admin), "admin seeder");
        _check(arbitration.hasRole(arbitration.EMERGENCY_ROLE(), admin), "admin emergency");
        _check(escrow.hasRole(escrow.TOKEN_ADMIN_ROLE(), owner), "owner token admin");
        _check(registry.hasRole(registry.DEFINER_ROLE(), owner), "owner definer");
        _check(registry.hasRole(root, owner), "owner registry admin");
        _check(escrow.hasRole(root, owner), "owner escrow admin");
        _check(treasury.hasRole(root, owner), "owner treasury admin");
        _check(reputation.hasRole(root, owner), "owner reputation admin");
        _check(credentials.hasRole(root, owner), "owner credentials admin");
        _check(arbitration.hasRole(root, owner), "owner arbitration admin");

        IAccessControl[7] memory all = [
            IAccessControl(address(escrow)),
            IAccessControl(address(arbitration)),
            IAccessControl(address(credentials)),
            IAccessControl(address(reputation)),
            IAccessControl(address(treasury)),
            IAccessControl(address(registry)),
            IAccessControl(address(timelock))
        ];
        for (uint256 i; i < all.length; i++) {
            _check(!all[i].hasRole(root, deployer), "deployer keeps admin role");
        }
        _check(!escrow.hasRole(escrow.TOKEN_ADMIN_ROLE(), deployer), "deployer token admin");
        _check(!escrow.hasRole(escrow.MODERATOR_ROLE(), deployer), "deployer moderator");
        _check(!registry.hasRole(registry.DEFINER_ROLE(), deployer), "deployer definer");
        _check(!timelock.hasRole(timelock.PROPOSER_ROLE(), deployer), "deployer proposer");
        _check(timelock.hasRole(timelock.PROPOSER_ROLE(), _addr("governor")), "governor proposer");
        _check(timelock.hasRole(timelock.EXECUTOR_ROLE(), address(0)), "open executor");
    }

    function _modules() private {
        _check(escrow.modulesLocked(), "modules locked");
        _check(escrow.moduleOf(IEscrow.openDispute.selector) != address(0), "dispute module routed");
        _check(escrow.moduleOf(IEscrow.configureToken.selector) != address(0), "admin module routed");
    }

    function _addr(string memory name) private view returns (address) {
        return vm.parseJsonAddress(json, string.concat(".contracts.", name, ".address"));
    }

    function _check(bool ok, string memory label) private {
        if (ok) {
            console.log("ok  ", label);
        } else {
            failures++;
            console.log("FAIL", label);
        }
    }
}
