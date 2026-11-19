// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ParameterRegistry} from "../src/ParameterRegistry.sol";

// Cambia un parámetro del registro mientras el admin todavía tiene el rol de administrador (antes del traspaso a gobernanza).
// Nadie tiene SETTER_ROLE de forma permanente: el admin se lo da, cambia el valor y se lo quita, todo en la misma corrida.
// Después del traspaso (`governanceHandedOver: true`) esto ya no sirve: el cambio pasa por una propuesta del Governor.
//
// Simular (no envía nada):
//   PARAM=SMALL_DISPUTES_PER_ACCOUNT_MONTH VALUE=1 forge script script/SetParameter.s.sol:SetParameter \
//     --rpc-url sepolia --sender <admin>
// Enviar (con el keystore del admin):
//   PARAM=... VALUE=... forge script script/SetParameter.s.sol:SetParameter --rpc-url sepolia --account admin --sender <admin> --broadcast
contract SetParameter is Script {
    function run() external {
        string memory json = vm.readFile(
            string.concat(vm.projectRoot(), "/deployments/", vm.envOr("DEPLOYMENT", string("sepolia")), ".json")
        );
        require(!vm.parseJsonBool(json, ".governanceHandedOver"), "governance handed over: use a Governor proposal");
        address admin = vm.parseJsonAddress(json, ".admin");
        ParameterRegistry registry = ParameterRegistry(vm.parseJsonAddress(json, ".contracts.parameterRegistry.address"));

        // PARAM puede ser uno o varios nombres separados por coma; todos toman el mismo VALUE.
        string[] memory names = vm.envString("PARAM", ",");
        uint64 value = uint64(vm.envUint("VALUE"));
        bytes32 setterRole = registry.SETTER_ROLE();
        bool alreadySetter = registry.hasRole(setterRole, admin);
        require(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin), "admin lacks DEFAULT_ADMIN_ROLE");
        for (uint256 i = 0; i < names.length; i++) {
            (uint64 min, uint64 max) = registry.bounds(keccak256(bytes(names[i])));
            require(value >= min && value <= max, "value out of bounds");
        }

        vm.startBroadcast(admin);
        if (!alreadySetter) registry.grantRole(setterRole, admin);
        for (uint256 i = 0; i < names.length; i++) {
            registry.set(keccak256(bytes(names[i])), value);
        }
        if (!alreadySetter) registry.renounceRole(setterRole, admin);
        vm.stopBroadcast();

        for (uint256 i = 0; i < names.length; i++) {
            console.log(names[i], "->", registry.get(keccak256(bytes(names[i]))));
        }
    }
}
