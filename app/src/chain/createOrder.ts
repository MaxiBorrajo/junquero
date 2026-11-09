import { encodeFunctionData, type Address, type Hex } from "viem";
import { escrowAbi } from "./abis";
import type { Deployment } from "./deployment";
import type { Spec } from "../api/types";

export const PAYMENT_MODE_ESCROWED = 0;
export const DEPOSIT_METHOD_PERMIT = 0;
export const GAS_CREATE_ORDER = 800_000n;
export const PERMIT_VALIDITY_SECONDS = 3600;
export const FORWARD_VALIDITY_SECONDS = 3600;

export const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const forwardTypes = {
  ForwardRequest: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "gas", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint48" },
    { name: "data", type: "bytes" },
  ],
} as const;

export interface CreateInput {
  amount: bigint;
  specHash: Hex;
  spec: Pick<Spec, "modality" | "startsAt" | "deadline" | "category">;
}

export function createParams(deployment: Deployment, input: CreateInput) {
  return {
    token: deployment.token,
    amount: input.amount,
    specHash: input.specHash,
    mode: PAYMENT_MODE_ESCROWED,
    modality: input.spec.modality === "remote" ? 1 : 0,
    startsAt: input.spec.startsAt ?? 0,
    deadline: input.spec.deadline ?? 0,
    category: input.spec.category,
  } as const;
}

export function permitTypedData(deployment: Deployment, owner: Address, value: bigint, nonce: bigint, deadline: bigint, spender: Address = deployment.escrow) {
  return {
    domain: { name: deployment.tokenName, version: deployment.tokenPermitVersion, chainId: deployment.chainId, verifyingContract: deployment.token },
    types: permitTypes,
    primaryType: "Permit" as const,
    message: { owner, spender, value, nonce, deadline },
  };
}

export function encodeCreateOrder(deployment: Deployment, input: CreateInput, permitSignature: Hex, permitDeadline: bigint): Hex {
  return encodeFunctionData({
    abi: escrowAbi,
    functionName: "createOrder",
    args: [createParams(deployment, input), { method: DEPOSIT_METHOD_PERMIT, nonce: 0n, deadline: permitDeadline, signature: permitSignature }],
  });
}

export function forwardTypedData(deployment: Deployment, from: Address, to: Address, data: Hex, nonce: bigint, deadline: number, gas = GAS_CREATE_ORDER) {
  return {
    domain: { name: "Forwarder", version: "1", chainId: deployment.chainId, verifyingContract: deployment.forwarder },
    types: forwardTypes,
    primaryType: "ForwardRequest" as const,
    message: { from, to, value: 0n, gas, nonce, deadline, data },
  };
}

export function relayBody(from: Address, to: Address, data: Hex, gas: bigint, deadline: number, signature: Hex) {
  return { from, to, value: "0", gas: gas.toString(), deadline, data, signature };
}

export function splitSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
  const clean = signature.slice(2);
  const v = parseInt(clean.slice(128, 130), 16);
  return { r: `0x${clean.slice(0, 64)}`, s: `0x${clean.slice(64, 128)}`, v: v < 27 ? v + 27 : v };
}
