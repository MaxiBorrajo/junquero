// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Agreement, Release, Reservation, MilestoneRelease, WitnessAssignment, Attestation} from "./OrderTypes.sol";

library EscrowHashes {
    bytes32 internal constant RESERVATION_TYPEHASH =
        keccak256("Reservation(uint256 orderId,address payer,address payee,uint40 expiry)");
    bytes32 internal constant AGREEMENT_TYPEHASH = keccak256(
        "Agreement(uint256 orderId,address payer,address payee,uint128 price,bytes32 specHash,bytes32 termsHash,uint40 expiry)"
    );
    bytes32 internal constant MILESTONE_RELEASE_TYPEHASH = keccak256(
        "MilestoneRelease(uint256 orderId,uint8 index,uint128 amount,uint8 rating,bytes32 evidenceHash,uint40 expiry)"
    );
    bytes32 internal constant WITNESS_ASSIGNMENT_TYPEHASH =
        keccak256("WitnessAssignment(uint256 orderId,address witness,uint40 expiry)");
    bytes32 internal constant ATTESTATION_TYPEHASH =
        keccak256("Attestation(uint256 orderId,uint8 index,bytes32 evidenceHash,bool approved,uint40 expiry)");
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

    function hash(MilestoneRelease memory r) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(MILESTONE_RELEASE_TYPEHASH, r.orderId, r.index, r.amount, r.rating, r.evidenceHash, r.expiry)
        );
    }

    function hash(WitnessAssignment memory a) internal pure returns (bytes32) {
        return keccak256(abi.encode(WITNESS_ASSIGNMENT_TYPEHASH, a.orderId, a.witness, a.expiry));
    }

    function hash(Attestation memory a) internal pure returns (bytes32) {
        return keccak256(abi.encode(ATTESTATION_TYPEHASH, a.orderId, a.index, a.evidenceHash, a.approved, a.expiry));
    }
}
