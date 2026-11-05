// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {Escrow} from "../../src/Escrow.sol";
import {OrderModule} from "../../src/escrow/OrderModule.sol";
import {CancelModule} from "../../src/escrow/CancelModule.sol";
import {AdminModule} from "../../src/escrow/AdminModule.sol";
import {DisputeModule} from "../../src/escrow/DisputeModule.sol";
import {IEscrowFull} from "../../src/interfaces/IEscrowFull.sol";
import {IParameterRegistry} from "../../src/interfaces/IParameterRegistry.sol";

library EscrowAssembly {
    function deploy(
        address admin,
        IParameterRegistry registry,
        address treasury,
        ISignatureTransfer permit2,
        address forwarder
    ) internal returns (IEscrowFull) {
        Escrow router = new Escrow(admin, registry, treasury, permit2, forwarder);
        router.setModule(address(new OrderModule(registry, treasury, permit2, forwarder)));
        router.setModule(address(new CancelModule(registry, treasury, permit2, forwarder)));
        router.setModule(address(new AdminModule(registry, treasury, permit2, forwarder)));
        router.setModule(address(new DisputeModule(registry, treasury, permit2, forwarder)));
        router.lockModules();
        return IEscrowFull(address(router));
    }
}
