// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Agreement, Release, Reservation} from "./OrderTypes.sol";

library EscrowHashes {
    bytes32 internal constant RESERVATION_TYPEHASH =
        keccak256("Reservation(uint256 orderId,address payer,address payee,uint40 expiry)");
    bytes32 internal constant AGREEMENT_TYPEHASH = keccak256(
        "Agreement(uint256 orderId,address payer,address payee,uint128 price,bytes32 specHash,bytes32 termsHash,uint40 expiry)"
    );
    bytes32 internal constant RELEASE_TYPEHASH = keccak256(
        "Release(uint256 orderId,address payee,uint128 amount,uint8 rating,bytes32 evidenceHash,uint40 expiry)"
    );

    function hash(Reservation calldata r) internal pure returns (bytes32) {
        return keccak256(abi.encode(RESERVATION_TYPEHASH, r.orderId, r.payer, r.payee, r.expiry));
    }

    function hash(Agreement calldata a) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(AGREEMENT_TYPEHASH, a.orderId, a.payer, a.payee, a.price, a.specHash, a.termsHash, a.expiry)
        );
    }

    function hash(Release calldata r) internal pure returns (bytes32) {
        return keccak256(abi.encode(RELEASE_TYPEHASH, r.orderId, r.payee, r.amount, r.rating, r.evidenceHash, r.expiry));
    }
}
