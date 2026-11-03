// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";

contract MockPermit2 is ISignatureTransfer {
    error SignatureExpired(uint256 deadline);
    error InvalidSigner();
    error NonceUsed();
    error NotImplemented();

    mapping(address owner => mapping(uint256 nonce => bool)) public used;

    function digestFor(address token, uint256 amount, uint256 nonce, uint256 deadline, address spender)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(address(this), block.chainid, token, amount, nonce, deadline, spender));
    }

    function permitTransferFrom(
        PermitTransferFrom memory permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external {
        if (block.timestamp > permit.deadline) revert SignatureExpired(permit.deadline);
        if (transferDetails.requestedAmount > permit.permitted.amount) revert InvalidAmount(permit.permitted.amount);
        if (used[owner][permit.nonce]) revert NonceUsed();
        bytes32 digest = digestFor(permit.permitted.token, permit.permitted.amount, permit.nonce, permit.deadline, msg.sender);
        if (ECDSA.recover(digest, signature) != owner) revert InvalidSigner();
        used[owner][permit.nonce] = true;
        IERC20(permit.permitted.token).transferFrom(owner, transferDetails.to, transferDetails.requestedAmount);
    }

    function DOMAIN_SEPARATOR() external pure returns (bytes32) {
        return bytes32(0);
    }

    function nonceBitmap(address, uint256) external pure returns (uint256) {
        return 0;
    }

    function permitWitnessTransferFrom(
        PermitTransferFrom memory,
        SignatureTransferDetails calldata,
        address,
        bytes32,
        string calldata,
        bytes calldata
    ) external pure {
        revert NotImplemented();
    }

    function permitTransferFrom(
        PermitBatchTransferFrom memory,
        SignatureTransferDetails[] calldata,
        address,
        bytes calldata
    ) external pure {
        revert NotImplemented();
    }

    function permitWitnessTransferFrom(
        PermitBatchTransferFrom memory,
        SignatureTransferDetails[] calldata,
        address,
        bytes32,
        string calldata,
        bytes calldata
    ) external pure {
        revert NotImplemented();
    }

    function invalidateUnorderedNonces(uint256, uint256) external pure {
        revert NotImplemented();
    }
}
