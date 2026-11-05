// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {IParameterRegistry} from "../interfaces/IParameterRegistry.sol";
import {EscrowHashes} from "../libraries/EscrowHashes.sol";
import {
    Order,
    OrderStatus,
    PaymentMode,
    WitnessAssignment,
    Attestation,
    AttestationRecord,
    Milestone,
    MilestoneStatus
} from "../libraries/OrderTypes.sol";
import {EscrowStorage} from "./EscrowStorage.sol";

interface ITreasuryPayer {
    function withdraw(IERC20 token, address to, uint256 amount) external;
}

contract WitnessModule is EscrowStorage {
    constructor(IParameterRegistry registry_, address treasury_, ISignatureTransfer permit2_, address forwarder)
        EscrowStorage(registry_, treasury_, permit2_, forwarder)
    {}

    function selectors() external pure returns (bytes4[] memory selectors_) {
        selectors_ = new bytes4[](5);
        selectors_[0] = WitnessModule.assignWitness.selector;
        selectors_[1] = WitnessModule.attest.selector;
        selectors_[2] = WitnessModule.claimWitnessFee.selector;
        selectors_[3] = WitnessModule.witnessOf.selector;
        selectors_[4] = WitnessModule.attestationOf.selector;
    }

    function assignWitness(
        WitnessAssignment calldata assignment,
        bytes calldata payerSignature,
        bytes calldata payeeSignature
    ) external {
        Order storage order = _requireStatus(assignment.orderId, OrderStatus.Agreed);
        if (order.mode != PaymentMode.Escrowed) revert UnsupportedForMode();
        address current = _witnesses[assignment.orderId];
        if (current != address(0)) revert WitnessAlreadyAssigned(current);
        if (block.timestamp > assignment.expiry) revert SignatureExpired(assignment.expiry);
        address witness = assignment.witness;
        if (
            witness == address(0) || witness == order.payer || witness == order.payee
                || _contributions[assignment.orderId][witness] > 0
        ) revert InvalidWitness(witness);

        bytes32 digest = _hashTypedDataV4(EscrowHashes.hash(assignment));
        _verify(order.payer, digest, payerSignature);
        _verify(order.payee, digest, payeeSignature);

        _witnesses[assignment.orderId] = witness;
        emit WitnessAssigned(assignment.orderId, witness);
    }

    function attest(Attestation calldata attestation, bytes calldata witnessSignature) external nonReentrant {
        uint256 orderId = attestation.orderId;
        Order storage order = _orders[orderId];
        if (order.status != OrderStatus.Agreed && order.status != OrderStatus.Delivered) {
            if (order.status == OrderStatus.None) revert UnknownOrder(orderId);
            revert InvalidStatus(orderId, order.status);
        }
        address witness = _witnesses[orderId];
        if (witness == address(0)) revert WitnessNotAssigned();
        if (block.timestamp > attestation.expiry) revert SignatureExpired(attestation.expiry);
        if (
            attestation.evidenceHash == bytes32(0)
                || attestation.evidenceHash != _currentEvidence(orderId, order, attestation.index)
        ) {
            revert EvidenceMismatch();
        }
        AttestationRecord storage record = _attestations[orderId][attestation.index];
        if (record.evidenceHash == attestation.evidenceHash) revert AlreadyAttested(attestation.index);

        _verify(witness, _hashTypedDataV4(EscrowHashes.hash(attestation)), witnessSignature);

        record.evidenceHash = attestation.evidenceHash;
        record.approved = attestation.approved;
        emit Attested(orderId, witness, attestation.index, attestation.evidenceHash, attestation.approved);
        if (_requiresWitness(order)) _payFee(orderId, order.token, witness);
    }

    function claimWitnessFee(address token, address witness) external nonReentrant {
        uint256 owed = witnessOwed[token][witness];
        if (owed == 0) revert NothingOwed();
        witnessOwed[token][witness] = 0;
        ITreasuryPayer(treasury).withdraw(IERC20(token), witness, owed);
        emit WitnessFeeClaimed(token, witness, owed);
    }

    function witnessOf(uint256 orderId) external view returns (address) {
        return _witnesses[orderId];
    }

    function attestationOf(uint256 orderId, uint8 index) external view returns (AttestationRecord memory) {
        return _attestations[orderId][index];
    }

    function _currentEvidence(uint256 orderId, Order storage order, uint8 index) private view returns (bytes32) {
        if (!order.hasMilestones) {
            if (index != 0 || order.status != OrderStatus.Delivered) return bytes32(0);
            return order.evidenceHash;
        }
        if (index != _plans[orderId].next) return bytes32(0);
        Milestone storage milestone = _milestones[orderId][index];
        if (milestone.status != MilestoneStatus.Delivered) return bytes32(0);
        return milestone.evidenceHash;
    }

    function _payFee(uint256 orderId, address token, address witness) private {
        uint128 fee = _tokenConfigs[token].witnessFee;
        if (fee == 0) return;
        try ITreasuryPayer(treasury).withdraw(IERC20(token), witness, fee) {
            emit WitnessPaid(orderId, witness, fee);
        } catch {
            witnessOwed[token][witness] += fee;
            emit WitnessFeeOwed(orderId, witness, fee);
        }
    }
}
