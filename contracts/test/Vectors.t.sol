// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {WitnessBase} from "./WitnessBase.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {EscrowHashes} from "../src/libraries/EscrowHashes.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {
    Order,
    OrderStatus,
    Reservation,
    Agreement,
    Release,
    MilestoneRelease,
    MilestoneTerms,
    WitnessAssignment,
    Attestation,
    DepositAuth
} from "../src/libraries/OrderTypes.sol";

contract VectorsTest is WitnessBase {
    string internal vectors;

    function _q(string memory value) internal pure returns (string memory) {
        return string.concat('"', value, '"');
    }

    function _field(string memory key, string memory value) internal pure returns (string memory) {
        return string.concat(_q(key), ":", _q(value));
    }

    function _num(string memory key, uint256 value) internal pure returns (string memory) {
        return _field(key, vm.toString(value));
    }

    function _addr(string memory key, address value) internal pure returns (string memory) {
        return _field(key, vm.toString(value));
    }

    function _hex(string memory key, bytes32 value) internal pure returns (string memory) {
        return _field(key, vm.toString(value));
    }

    function _bytes(string memory key, bytes memory value) internal pure returns (string memory) {
        return _field(key, vm.toString(value));
    }

    function _obj2(string memory a, string memory b) internal pure returns (string memory) {
        return string.concat("{", a, ",", b, "}");
    }

    function _join(string[] memory parts) internal pure returns (string memory out) {
        out = "{";
        for (uint256 i = 0; i < parts.length; i++) {
            out = string.concat(out, i == 0 ? "" : ",", parts[i]);
        }
        out = string.concat(out, "}");
    }

    function _vector(
        string memory primaryType,
        string memory message,
        bytes32 structHash,
        string memory domainKey,
        string memory signatures
    ) internal view returns (string memory) {
        bytes32 domain = keccak256(bytes(domainKey)) == keccak256("escrow") ? escrow.domainSeparator() : bytes32(0);
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
        return string.concat(
            "{",
            _field("primaryType", primaryType),
            ",",
            _field("domain", domainKey),
            ",",
            '"message":',
            message,
            ",",
            _hex("structHash", structHash),
            ",",
            _hex("digest", digest),
            ',"signatures":',
            signatures,
            "}"
        );
    }

    function _types() internal pure returns (string memory) {
        return string.concat(
            "{",
            '"Reservation":[{"name":"orderId","type":"uint256"},{"name":"payer","type":"address"},{"name":"payee","type":"address"},{"name":"expiry","type":"uint40"}],',
            '"Agreement":[{"name":"orderId","type":"uint256"},{"name":"payer","type":"address"},{"name":"payee","type":"address"},{"name":"price","type":"uint128"},{"name":"specHash","type":"bytes32"},{"name":"termsHash","type":"bytes32"},{"name":"expiry","type":"uint40"}],',
            '"Release":[{"name":"orderId","type":"uint256"},{"name":"payee","type":"address"},{"name":"amount","type":"uint128"},{"name":"rating","type":"uint8"},{"name":"evidenceHash","type":"bytes32"},{"name":"expiry","type":"uint40"}],',
            '"MilestoneRelease":[{"name":"orderId","type":"uint256"},{"name":"index","type":"uint8"},{"name":"amount","type":"uint128"},{"name":"rating","type":"uint8"},{"name":"evidenceHash","type":"bytes32"},{"name":"expiry","type":"uint40"}],',
            '"WitnessAssignment":[{"name":"orderId","type":"uint256"},{"name":"witness","type":"address"},{"name":"expiry","type":"uint40"}],',
            '"Attestation":[{"name":"orderId","type":"uint256"},{"name":"index","type":"uint8"},{"name":"evidenceHash","type":"bytes32"},{"name":"approved","type":"bool"},{"name":"expiry","type":"uint40"}],',
            '"Permit":[{"name":"owner","type":"address"},{"name":"spender","type":"address"},{"name":"value","type":"uint256"},{"name":"nonce","type":"uint256"},{"name":"deadline","type":"uint256"}],',
            '"ForwardRequest":[{"name":"from","type":"address"},{"name":"to","type":"address"},{"name":"value","type":"uint256"},{"name":"gas","type":"uint256"},{"name":"nonce","type":"uint256"},{"name":"deadline","type":"uint48"},{"name":"data","type":"bytes"}]',
            "}"
        );
    }

    function _account(address who, uint256 key) internal pure returns (string memory) {
        return _obj2(_addr("address", who), _hex("privateKey", bytes32(key)));
    }

    function _agreementJson(Agreement memory a) internal pure returns (string memory) {
        string[] memory parts = new string[](7);
        parts[0] = _num("orderId", a.orderId);
        parts[1] = _addr("payer", a.payer);
        parts[2] = _addr("payee", a.payee);
        parts[3] = _num("price", a.price);
        parts[4] = _hex("specHash", a.specHash);
        parts[5] = _hex("termsHash", a.termsHash);
        parts[6] = _num("expiry", a.expiry);
        return _join(parts);
    }

    function _signatures2(bytes memory first, bytes memory second, string memory firstKey, string memory secondKey)
        internal
        pure
        returns (string memory)
    {
        return _obj2(_bytes(firstKey, first), _bytes(secondKey, second));
    }

    function test_writeTheSignatureVectorsTheAppMustReproduce() public {
        string memory permitVector = _permitVector();
        string memory reservationVector = _reservationVector();
        string memory agreementVector = _agreementVector();
        string memory witnessVectors = _witnessVectors();
        string memory releaseVector = _releaseVector();
        string memory milestoneVectors = _milestoneVectors();
        string memory forwardVector = _forwardVector();

        string[] memory vectorParts = new string[](9);
        vectorParts[0] = string.concat('"permit":', permitVector);
        vectorParts[1] = string.concat('"reservation":', reservationVector);
        vectorParts[2] = string.concat('"agreement":', agreementVector);
        vectorParts[3] = string.concat('"witnessAssignment":', _field0(witnessVectors));
        vectorParts[4] = string.concat('"attestation":', _field1(witnessVectors));
        vectorParts[5] = string.concat('"release":', releaseVector);
        vectorParts[6] = string.concat('"milestoneAgreement":', _field0(milestoneVectors));
        vectorParts[7] = string.concat('"milestoneRelease":', _field1(milestoneVectors));
        vectorParts[8] = string.concat('"forwardRequest":', forwardVector);

        string[] memory accountParts = new string[](3);
        accountParts[0] = string.concat('"payer":', _account(payer, payerKey));
        accountParts[1] = string.concat('"payee":', _account(payee, payeeKey));
        accountParts[2] = string.concat('"witness":', _account(witness, witnessKey));

        string[] memory root = new string[](7);
        root[0] = _field(
            "warning", "Deterministic test keys. Never use them outside local tests. Generated by test/Vectors.t.sol."
        );
        root[1] = _num("chainId", block.chainid);
        root[2] = string.concat(
            '"contracts":',
            _obj2(
                _addr("escrow", address(escrow)),
                _obj2s(_addr("forwarder", address(forwarder)), _addr("usdc", address(usdc)))
            )
        );
        root[3] = string.concat('"accounts":', _join(accountParts));
        root[4] = string.concat('"types":', _types());
        root[5] = string.concat('"vectors":', _join(vectorParts));
        root[6] = _field("usdcPermitDomainVersion", "1");

        string memory json = _join(root);
        vm.writeFile("vectors/signatures.json", json);

        assertEq(vm.parseJsonUint(json, ".chainId"), block.chainid);
        assertEq(vm.parseJsonAddress(json, ".contracts.escrow"), address(escrow));
        assertTrue(bytes(vm.readFile("vectors/signatures.json")).length > 1000);
        vectors = json;
    }

    function _obj2s(string memory a, string memory b) internal pure returns (string memory) {
        return string.concat(a, ",", b);
    }

    function _field0(string memory pair) internal pure returns (string memory) {
        return _slice(pair, 0);
    }

    function _field1(string memory pair) internal pure returns (string memory) {
        return _slice(pair, 1);
    }

    function _slice(string memory pair, uint256 which) internal pure returns (string memory) {
        bytes memory raw = bytes(pair);
        uint256 split;
        for (uint256 i = 0; i + 2 < raw.length; i++) {
            if (raw[i] == "|" && raw[i + 1] == "|" && raw[i + 2] == "|") {
                split = i;
                break;
            }
        }
        bytes memory out = new bytes(which == 0 ? split : raw.length - split - 3);
        uint256 offset = which == 0 ? 0 : split + 3;
        for (uint256 i = 0; i < out.length; i++) {
            out[i] = raw[offset + i];
        }
        return string(out);
    }

    function _permitVector() internal returns (string memory) {
        uint256 nonce = usdc.nonces(payer);
        DepositAuth memory auth = _permitAuth(100 * USDC);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                payer,
                address(escrow),
                100 * USDC,
                nonce,
                auth.deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        vm.prank(payer);
        escrow.createOrder(_params(address(usdc), 100 * USDC), auth);

        string[] memory message = new string[](5);
        message[0] = _addr("owner", payer);
        message[1] = _addr("spender", address(escrow));
        message[2] = _num("value", 100 * USDC);
        message[3] = _num("nonce", nonce);
        message[4] = _num("deadline", auth.deadline);
        return string.concat(
            "{",
            _field("primaryType", "Permit"),
            ",",
            _field("domain", "usdc"),
            ',"message":',
            _join(message),
            ",",
            _hex("structHash", structHash),
            ",",
            _hex("digest", digest),
            ',"signatures":',
            _obj2s0(_bytes("owner", auth.signature)),
            "}"
        );
    }

    function _obj2s0(string memory only) internal pure returns (string memory) {
        return string.concat("{", only, "}");
    }

    function _reservationVector() internal returns (string memory) {
        Reservation memory r =
            Reservation({orderId: 1, payer: payer, payee: payee, expiry: uint40(block.timestamp + 24 hours)});
        bytes32 structHash = _reservationHash(r);
        bytes memory payerSig = _sign(payerKey, structHash);
        bytes memory payeeSig = _sign(payeeKey, structHash);
        vm.prank(relayer);
        escrow.reserve(r, payerSig, payeeSig);

        string[] memory message = new string[](4);
        message[0] = _num("orderId", r.orderId);
        message[1] = _addr("payer", r.payer);
        message[2] = _addr("payee", r.payee);
        message[3] = _num("expiry", r.expiry);
        return _vector(
            "Reservation", _join(message), structHash, "escrow", _signatures2(payerSig, payeeSig, "payer", "payee")
        );
    }

    function _agreementVector() internal returns (string memory) {
        Agreement memory a = _agreement(1, 100 * USDC);
        bytes32 structHash = _agreementHash(a);
        bytes memory payerSig = _sign(payerKey, structHash);
        bytes memory payeeSig = _sign(payeeKey, structHash);
        vm.prank(relayer);
        escrow.agree(a, payerSig, payeeSig);
        return _vector(
            "Agreement", _agreementJson(a), structHash, "escrow", _signatures2(payerSig, payeeSig, "payer", "payee")
        );
    }

    function _witnessVectors() internal returns (string memory) {
        WitnessAssignment memory assignment = _assignment(1);
        bytes32 assignmentHash = EscrowHashes.hash(assignment);
        bytes memory payerSig = _sign(payerKey, assignmentHash);
        bytes memory payeeSig = _sign(payeeKey, assignmentHash);
        vm.prank(relayer);
        escrow.assignWitness(assignment, payerSig, payeeSig);
        string[] memory assignmentMessage = new string[](3);
        assignmentMessage[0] = _num("orderId", assignment.orderId);
        assignmentMessage[1] = _addr("witness", assignment.witness);
        assignmentMessage[2] = _num("expiry", assignment.expiry);

        vm.prank(payee);
        escrow.deliver(1, EVIDENCE);
        Attestation memory attestation = _attestation(1, 0, EVIDENCE, true);
        bytes32 attestationHash = EscrowHashes.hash(attestation);
        bytes memory witnessSig = _sign(witnessKey, attestationHash);
        vm.prank(relayer);
        escrow.attest(attestation, witnessSig);
        string[] memory attestationMessage = new string[](5);
        attestationMessage[0] = _num("orderId", attestation.orderId);
        attestationMessage[1] = _num("index", attestation.index);
        attestationMessage[2] = _hex("evidenceHash", attestation.evidenceHash);
        attestationMessage[3] = string.concat('"approved":', attestation.approved ? "true" : "false");
        attestationMessage[4] = _num("expiry", attestation.expiry);

        return string.concat(
            _vector(
                "WitnessAssignment",
                _join(assignmentMessage),
                assignmentHash,
                "escrow",
                _signatures2(payerSig, payeeSig, "payer", "payee")
            ),
            "|||",
            _vector(
                "Attestation",
                _join(attestationMessage),
                attestationHash,
                "escrow",
                _obj2s0(_bytes("witness", witnessSig))
            )
        );
    }

    function _releaseVector() internal returns (string memory) {
        (Release memory r, bytes memory sig) = _release(1, 100 * USDC, 5);
        bytes32 structHash = _releaseHash(r);
        vm.prank(payee);
        escrow.release(r, sig);

        string[] memory message = new string[](6);
        message[0] = _num("orderId", r.orderId);
        message[1] = _addr("payee", r.payee);
        message[2] = _num("amount", r.amount);
        message[3] = _num("rating", r.rating);
        message[4] = _hex("evidenceHash", r.evidenceHash);
        message[5] = _num("expiry", r.expiry);
        return _vector("Release", _join(message), structHash, "escrow", _obj2s0(_bytes("payer", sig)));
    }

    function _milestoneVectors() internal returns (string memory) {
        uint256 orderId = _createUsdc(300 * USDC);
        MilestoneTerms memory terms =
            _terms(_amounts(uint128(100 * USDC), uint128(100 * USDC), uint128(100 * USDC)), false);
        Agreement memory a = _milestoneAgreement(orderId, terms);
        bytes32 structHash = _agreementHash(a);
        bytes memory payerSig = _sign(payerKey, structHash);
        bytes memory payeeSig = _sign(payeeKey, structHash);
        vm.prank(relayer);
        escrow.agreeWithMilestones(a, terms, payerSig, payeeSig);
        _assignWitness(orderId);
        _deliverAt(orderId, 0);
        _attest(orderId, 0, keccak256(abi.encode("evidence", uint8(0))), true);

        (MilestoneRelease memory release, bytes memory sig) = _msRelease(orderId, 0, 100 * USDC, 5);
        vm.prank(payee);
        escrow.releaseMilestone(release, sig);

        string[] memory message = new string[](6);
        message[0] = _num("orderId", release.orderId);
        message[1] = _num("index", release.index);
        message[2] = _num("amount", release.amount);
        message[3] = _num("rating", release.rating);
        message[4] = _hex("evidenceHash", release.evidenceHash);
        message[5] = _num("expiry", release.expiry);
        return string.concat(
            _vector(
                "Agreement", _agreementJson(a), structHash, "escrow", _signatures2(payerSig, payeeSig, "payer", "payee")
            ),
            "|||",
            _vector(
                "MilestoneRelease", _join(message), EscrowHashes.hash(release), "escrow", _obj2s0(_bytes("payer", sig))
            )
        );
    }

    function _forwardVector() internal returns (string memory) {
        uint256 orderId = escrow.lastOrderId();
        bytes memory data = abi.encodeCall(IEscrow.deliverMilestone, (orderId, 1, keccak256("relayed")));
        uint48 deadline = uint48(block.timestamp + 1 hours);
        uint256 nonce = forwarder.nonces(payee);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)"
                ),
                payee,
                address(escrow),
                uint256(0),
                uint256(2_000_000),
                nonce,
                deadline,
                keccak256(data)
            )
        );
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Forwarder"),
                keccak256("1"),
                block.chainid,
                address(forwarder)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payeeKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);
        vm.prank(relayer);
        forwarder.execute(
            ERC2771Forwarder.ForwardRequestData({
                from: payee,
                to: address(escrow),
                value: 0,
                gas: 2_000_000,
                deadline: deadline,
                data: data,
                signature: signature
            })
        );

        string[] memory message = new string[](7);
        message[0] = _addr("from", payee);
        message[1] = _addr("to", address(escrow));
        message[2] = _num("value", 0);
        message[3] = _num("gas", 2_000_000);
        message[4] = _num("nonce", nonce);
        message[5] = _num("deadline", deadline);
        message[6] = _bytes("data", data);
        return string.concat(
            "{",
            _field("primaryType", "ForwardRequest"),
            ",",
            _field("domain", "forwarder"),
            ',"message":',
            _join(message),
            ",",
            _hex("structHash", structHash),
            ",",
            _hex("digest", digest),
            ',"signatures":',
            _obj2s0(_bytes("payee", signature)),
            "}"
        );
    }
}
