// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IParameterRegistry {
    event ParameterDefined(bytes32 indexed key, uint64 min, uint64 max, uint64 value);
    event ParameterSet(bytes32 indexed key, uint64 previous, uint64 value);

    error ParameterAlreadyDefined(bytes32 key);
    error ParameterNotDefined(bytes32 key);
    error InvalidBounds(uint64 min, uint64 max);
    error ValueOutOfBounds(bytes32 key, uint64 value, uint64 min, uint64 max);

    function get(bytes32 key) external view returns (uint64);
    function bounds(bytes32 key) external view returns (uint64 min, uint64 max);
}
