// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IArbitration {
    function openCase(
        uint256 orderId,
        address payer,
        address payee,
        address claimant,
        uint128 fee,
        address token,
        uint8 jurors,
        bytes32 reasonHash
    ) external returns (uint256 caseId);
}
