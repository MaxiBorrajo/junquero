// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IArbitration} from "../../src/interfaces/IArbitration.sol";
import {IEscrow} from "../../src/interfaces/IEscrow.sol";

contract MockArbitration is IArbitration {
    struct Case {
        uint256 orderId;
        address payer;
        address payee;
        address claimant;
        uint128 amount;
        address token;
        uint8 jurors;
        bytes32 reasonHash;
    }

    IEscrow public immutable escrow;
    uint256 public cases;
    mapping(uint256 caseId => Case) public caseOf;

    constructor(IEscrow escrow_) {
        escrow = escrow_;
    }

    function openCase(
        uint256 orderId,
        address payer,
        address payee,
        address claimant,
        uint128 amount,
        address token,
        uint8 jurors,
        bytes32 reasonHash
    ) external returns (uint256 caseId) {
        caseId = ++cases;
        caseOf[caseId] = Case(orderId, payer, payee, claimant, amount, token, jurors, reasonHash);
    }

    function resolve(uint256 orderId, uint16 payeeShareBps) external {
        escrow.resolveDispute(orderId, payeeShareBps, false);
    }

    function resolveWaived(uint256 orderId, uint16 payeeShareBps) external {
        escrow.resolveDispute(orderId, payeeShareBps, true);
    }
}
