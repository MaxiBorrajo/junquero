// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IArbitration} from "../../src/interfaces/IArbitration.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEscrow} from "../../src/interfaces/IEscrow.sol";

contract MockArbitration is IArbitration {
    struct Case {
        uint256 orderId;
        address payer;
        address payee;
        address claimant;
        uint128 fee;
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
        uint128 fee,
        address token,
        uint8 jurors,
        bytes32 reasonHash
    ) external returns (uint256 caseId) {
        caseId = ++cases;
        caseOf[caseId] = Case(orderId, payer, payee, claimant, fee, token, jurors, reasonHash);
    }

    function resolve(uint256 orderId, uint16 payeeShareBps) external {
        escrow.resolveDispute(orderId, payeeShareBps, false, 0, address(0));
    }

    function resolveAppealed(uint256 orderId, uint16 payeeShareBps, uint128 appealFee, address appellant) external {
        escrow.resolveDispute(orderId, payeeShareBps, false, appealFee, appellant);
    }

    function resolveWaived(uint256 orderId, uint16 payeeShareBps) external {
        Case storage c = caseOf[caseIdOf(orderId)];
        IERC20(c.token).transfer(c.claimant, c.fee);
        escrow.resolveDispute(orderId, payeeShareBps, true, 0, address(0));
    }

    function caseIdOf(uint256 orderId) public view returns (uint256) {
        for (uint256 i = cases; i > 0; i--) {
            if (caseOf[i].orderId == orderId) return i;
        }
        return 0;
    }
}
