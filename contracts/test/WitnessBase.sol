// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {GroupBase} from "./GroupBase.sol";
import {EscrowHashes} from "../src/libraries/EscrowHashes.sol";
import {WitnessAssignment, Attestation, TokenConfig} from "../src/libraries/OrderTypes.sol";

abstract contract WitnessBase is GroupBase {
    address internal witness;
    uint256 internal witnessKey;
    bytes32 internal constant PROOF = keccak256("witness proof");

    function setUp() public virtual override {
        super.setUp();
        (witness, witnessKey) = makeAddrAndKey("witness");
        TokenConfig memory config = escrow.tokenConfig(address(usdc));
        config.witnessAmount = uint128(50 * USDC);
        vm.prank(admin);
        escrow.configureToken(address(usdc), config);

        bytes32 spenderRole = treasury.SPENDER_ROLE();
        vm.startPrank(admin);
        treasury.grantRole(spenderRole, address(escrow));
        treasury.grantRole(spenderRole, admin);
        vm.stopPrank();
        usdc.mint(address(treasury), 100 * USDC);
    }

    function _assignment(uint256 orderId) internal view returns (WitnessAssignment memory) {
        return WitnessAssignment({orderId: orderId, witness: witness, expiry: uint40(block.timestamp + 1 hours)});
    }

    function _assignWitness(uint256 orderId) internal {
        WitnessAssignment memory a = _assignment(orderId);
        bytes32 structHash = EscrowHashes.hash(a);
        bytes memory payerSig = _sign(payerKey, structHash);
        bytes memory payeeSig = _sign(payeeKey, structHash);
        vm.prank(relayer);
        escrow.assignWitness(a, payerSig, payeeSig);
    }

    function _attestation(uint256 orderId, uint8 index, bytes32 evidence, bool approved)
        internal
        view
        returns (Attestation memory)
    {
        return Attestation({
            orderId: orderId,
            index: index,
            evidenceHash: evidence,
            approved: approved,
            expiry: uint40(block.timestamp + 1 hours)
        });
    }

    function _attest(uint256 orderId, uint8 index, bytes32 evidence, bool approved) internal {
        Attestation memory a = _attestation(orderId, index, evidence, approved);
        bytes memory sig = _sign(witnessKey, EscrowHashes.hash(a));
        vm.prank(relayer);
        escrow.attest(a, sig);
    }

    function _requiredPlain() internal returns (uint256 orderId) {
        orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);
        _assignWitness(orderId);
    }

    function _deliveredPlain() internal returns (uint256 orderId) {
        orderId = _requiredPlain();
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
    }
}
