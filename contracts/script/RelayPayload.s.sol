// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IEscrowFull} from "../src/interfaces/IEscrowFull.sol";
import {CreateParams, DepositAuth, DepositMethod, PaymentMode, Modality} from "../src/libraries/OrderTypes.sol";
import {TestUSDC} from "../src/TestUSDC.sol";
import {Forwarder} from "../src/Forwarder.sol";

contract RelayPayload is Script {
    bytes32 internal constant FORWARD_REQUEST_TYPEHASH = keccak256(
        "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)"
    );
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    uint256 internal constant AMOUNT = 1e6;
    uint256 internal constant GAS = 800_000;

    IEscrowFull internal escrow;
    TestUSDC internal token;
    Forwarder internal forwarder;
    address internal requester;

    function run() external {
        string memory json = vm.readFile(
            string.concat(vm.projectRoot(), "/deployments/", vm.envOr("DEPLOYMENT", string("sepolia")), ".json")
        );
        escrow = IEscrowFull(vm.parseJsonAddress(json, ".contracts.escrow.address"));
        token = TestUSDC(vm.parseJsonAddress(json, ".contracts.token.address"));
        forwarder = Forwarder(vm.parseJsonAddress(json, ".contracts.forwarder.address"));
        requester = vm.parseJsonAddress(json, ".demoAccounts.solicitante");

        bytes memory data = abi.encodeCall(escrow.createOrder, (_params(), _permitAuth()));
        uint48 deadline = uint48(block.timestamp + 1 hours);
        bytes memory signature = _signForward(data, deadline);

        console.log("BODY_START");
        console.log(
            string.concat(
                '{"from":"',
                vm.toString(requester),
                '","to":"',
                vm.toString(address(escrow)),
                '","value":"0","gas":"',
                vm.toString(GAS),
                '","deadline":',
                vm.toString(uint256(deadline)),
                ',"data":"',
                vm.toString(data),
                '","signature":"',
                vm.toString(signature),
                '"}'
            )
        );
        console.log("BODY_END");
    }

    function _params() private view returns (CreateParams memory) {
        return CreateParams({
            token: address(token),
            amount: uint128(AMOUNT),
            specHash: keccak256("relayer test"),
            mode: PaymentMode.Escrowed,
            modality: Modality.OnSite,
            startsAt: 0,
            deadline: 0,
            category: 2
        });
    }

    function _permitAuth() private view returns (DepositAuth memory) {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                requester,
                address(escrow),
                AMOUNT,
                token.nonces(requester),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(requester, digest);
        return DepositAuth({
            method: DepositMethod.Permit, nonce: 0, deadline: deadline, signature: abi.encodePacked(r, s, v)
        });
    }

    function _signForward(bytes memory data, uint48 deadline) private view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                FORWARD_REQUEST_TYPEHASH,
                requester,
                address(escrow),
                uint256(0),
                GAS,
                forwarder.nonces(requester),
                deadline,
                keccak256(data)
            )
        );
        bytes32 domain = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("Forwarder"), keccak256("1"), block.chainid, address(forwarder))
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(requester, digest);
        return abi.encodePacked(r, s, v);
    }
}
