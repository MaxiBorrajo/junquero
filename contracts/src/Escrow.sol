// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IParameterRegistry} from "./interfaces/IParameterRegistry.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {EscrowStorage} from "./escrow/EscrowStorage.sol";

interface IEscrowModule {
    function selectors() external view returns (bytes4[] memory);
    function configHash() external view returns (bytes32);
}

contract Escrow is EscrowStorage {
    mapping(bytes4 selector => address module) private _modules;
    bool public modulesLocked;

    event ModuleSet(address indexed module, uint256 selectorCount);
    event ModulesLocked();

    error ModulesAreLocked();
    error ModuleMismatch(address module);
    error SelectorTaken(bytes4 selector);
    error UnknownFunction(bytes4 selector);

    constructor(
        address admin,
        IParameterRegistry registry_,
        address treasury_,
        ISignatureTransfer permit2_,
        address forwarder
    ) EscrowStorage(registry_, treasury_, permit2_, forwarder) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TOKEN_ADMIN_ROLE, admin);
        _grantRole(MODERATOR_ROLE, admin);
    }

    function setModule(address module) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (modulesLocked) revert ModulesAreLocked();
        if (IEscrowModule(module).configHash() != configHash()) revert ModuleMismatch(module);
        bytes4[] memory selectors = IEscrowModule(module).selectors();
        for (uint256 i = 0; i < selectors.length; i++) {
            if (_modules[selectors[i]] != address(0)) revert SelectorTaken(selectors[i]);
            _modules[selectors[i]] = module;
        }
        emit ModuleSet(module, selectors.length);
    }

    function lockModules() external onlyRole(DEFAULT_ADMIN_ROLE) {
        modulesLocked = true;
        emit ModulesLocked();
    }

    function moduleOf(bytes4 selector) external view returns (address) {
        return _modules[selector];
    }

    fallback() external {
        address module = _modules[msg.sig];
        if (module == address(0)) revert UnknownFunction(msg.sig);
        assembly {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), module, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
