// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Credentials} from "../src/Credentials.sol";
import {Arbitration} from "../src/Arbitration.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

contract Seed is Script {
    uint256 internal constant UNIT = 1e6;

    string internal json;
    Credentials internal credentials;
    TestUSDC internal token;

    function run() external {
        json = vm.readFile(
            string.concat(vm.projectRoot(), "/deployments/", vm.envOr("DEPLOYMENT", string("sepolia")), ".json")
        );
        credentials = Credentials(_addr("credentials"));
        token = TestUSDC(_addr("token"));
        Arbitration arbitration = Arbitration(_addr("arbitration"));

        address requester = vm.parseJsonAddress(json, ".demoAccounts.solicitante");
        address provider = vm.parseJsonAddress(json, ".demoAccounts.prestador");
        address witness = vm.parseJsonAddress(json, ".demoAccounts.witness");
        address[] memory jurors = vm.parseJsonAddressArray(json, ".demoAccounts.jurors");
        address[] memory contributors = vm.parseJsonAddressArray(json, ".demoAccounts.contributors");

        vm.startBroadcast();
        _issue(requester);
        _issue(provider);
        _issue(witness);
        for (uint256 i; i < jurors.length; i++) {
            _issue(jurors[i]);
            if (!arbitration.account(jurors[i]).seed) arbitration.setSeedJuror(jurors[i], true);
            _topUp(jurors[i], 100 * UNIT);
        }
        for (uint256 i; i < contributors.length; i++) {
            _issue(contributors[i]);
            _topUp(contributors[i], 1_000 * UNIT);
        }
        _topUp(requester, 5_000 * UNIT);
        _topUp(provider, 500 * UNIT);
        _topUp(_addr("treasury"), 1_000 * UNIT);
        vm.stopBroadcast();

        console.log("seed done");
    }

    function _issue(address account) private {
        if (!credentials.has(account)) credentials.issue(account, 0);
    }

    function _topUp(address account, uint256 target) private {
        uint256 balance = token.balanceOf(account);
        if (balance < target) token.mint(account, target - balance);
    }

    function _addr(string memory name) private view returns (address) {
        return vm.parseJsonAddress(json, string.concat(".contracts.", name, ".address"));
    }
}
