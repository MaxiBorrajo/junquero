// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IParameterRegistry} from "./interfaces/IParameterRegistry.sol";

contract ParameterRegistry is IParameterRegistry, AccessControl {
    bytes32 public constant DEFINER_ROLE = keccak256("DEFINER_ROLE");
    bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");

    struct Parameter {
        uint64 min;
        uint64 max;
        uint64 value;
        bool defined;
    }

    mapping(bytes32 key => Parameter) private _parameters;

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(DEFINER_ROLE, admin);
    }

    function defineParameter(bytes32 key, uint64 min, uint64 max, uint64 value) external onlyRole(DEFINER_ROLE) {
        Parameter storage parameter = _parameters[key];
        if (parameter.defined) revert ParameterAlreadyDefined(key);
        if (min > max) revert InvalidBounds(min, max);
        _checkBounds(key, value, min, max);
        _parameters[key] = Parameter(min, max, value, true);
        emit ParameterDefined(key, min, max, value);
    }

    function set(bytes32 key, uint64 value) external onlyRole(SETTER_ROLE) {
        Parameter storage parameter = _parameters[key];
        if (!parameter.defined) revert ParameterNotDefined(key);
        _checkBounds(key, value, parameter.min, parameter.max);
        uint64 previous = parameter.value;
        parameter.value = value;
        emit ParameterSet(key, previous, value);
    }

    function get(bytes32 key) external view returns (uint64) {
        Parameter storage parameter = _parameters[key];
        if (!parameter.defined) revert ParameterNotDefined(key);
        return parameter.value;
    }

    function bounds(bytes32 key) external view returns (uint64 min, uint64 max) {
        Parameter storage parameter = _parameters[key];
        if (!parameter.defined) revert ParameterNotDefined(key);
        return (parameter.min, parameter.max);
    }

    function _checkBounds(bytes32 key, uint64 value, uint64 min, uint64 max) private pure {
        if (value < min || value > max) revert ValueOutOfBounds(key, value, min, max);
    }
}
