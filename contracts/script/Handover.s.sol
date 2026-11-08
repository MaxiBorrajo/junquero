// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console} from "forge-std/Script.sol";
import {Deploy} from "./Deploy.s.sol";
import {IEscrowFull} from "../src/interfaces/IEscrowFull.sol";
import {Forwarder} from "../src/Forwarder.sol";
import {Treasury} from "../src/Treasury.sol";
import {Credentials} from "../src/Credentials.sol";
import {Reputation} from "../src/Reputation.sol";
import {Receipt as JunqueroReceipt} from "../src/Receipt.sol";
import {Arbitration} from "../src/Arbitration.sol";
import {VotingWeight} from "../src/VotingWeight.sol";
import {ProtocolGovernor} from "../src/ProtocolGovernor.sol";
import {ParameterRegistry} from "../src/ParameterRegistry.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

contract Handover is Deploy {
    function runHandover() external {
        string memory json = vm.readFile(
            string.concat(vm.projectRoot(), "/deployments/", vm.envOr("DEPLOYMENT", string("sepolia")), ".json")
        );
        require(!vm.parseJsonBool(json, ".governanceHandedOver"), "already handed over");
        address admin = vm.parseJsonAddress(json, ".admin");

        Deployment memory deployment = Deployment({
            forwarder: Forwarder(_addr(json, "forwarder")),
            registry: ParameterRegistry(_addr(json, "parameterRegistry")),
            treasury: Treasury(_addr(json, "treasury")),
            escrow: IEscrowFull(_addr(json, "escrow")),
            credentials: Credentials(_addr(json, "credentials")),
            reputation: Reputation(_addr(json, "reputation")),
            receipt: JunqueroReceipt(_addr(json, "receipt")),
            arbitration: Arbitration(_addr(json, "arbitration")),
            votingWeight: VotingWeight(_addr(json, "votingWeight")),
            timelock: TimelockController(payable(_addr(json, "timelock"))),
            governor: ProtocolGovernor(payable(_addr(json, "governor")))
        });

        vm.startBroadcast(admin);
        handOverToGovernance(deployment, admin);
        vm.stopBroadcast();

        console.log("handed over to", address(deployment.timelock));
    }

    function _addr(string memory json, string memory name) private pure returns (address) {
        return vm.parseJsonAddress(json, string.concat(".contracts.", name, ".address"));
    }
}
