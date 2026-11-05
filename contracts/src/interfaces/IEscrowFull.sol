// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {IEscrow} from "./IEscrow.sol";
import {IParameterRegistry} from "./IParameterRegistry.sol";
import {IReputation} from "./IReputation.sol";
import {IArbitration} from "./IArbitration.sol";

interface IEscrowFull is IEscrow, IAccessControl {
    function DEFAULT_ADMIN_ROLE() external view returns (bytes32);
    function TOKEN_ADMIN_ROLE() external view returns (bytes32);
    function MODERATOR_ROLE() external view returns (bytes32);
    function registry() external view returns (IParameterRegistry);
    function treasury() external view returns (address);
    function permit2() external view returns (ISignatureTransfer);
    function reputation() external view returns (IReputation);
    function arbitration() external view returns (IArbitration);
    function lastOrderId() external view returns (uint256);
    function isTrustedForwarder(address forwarder) external view returns (bool);
    function trustedForwarder() external view returns (address);
    function setModule(address module) external;
    function lockModules() external;
    function modulesLocked() external view returns (bool);
    function moduleOf(bytes4 selector) external view returns (address);
}
