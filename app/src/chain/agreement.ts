import type { Address, Hex } from "viem";
import type { Deployment } from "./deployment";

export const ZERO_HASH: Hex = `0x${"0".repeat(64)}`;
export const AGREEMENT_VALIDITY_SECONDS = 24 * 3600;

export const agreementTypes = {
  Agreement: [
    { name: "orderId", type: "uint256" },
    { name: "payer", type: "address" },
    { name: "payee", type: "address" },
    { name: "price", type: "uint128" },
    { name: "specHash", type: "bytes32" },
    { name: "termsHash", type: "bytes32" },
    { name: "expiry", type: "uint40" },
  ],
} as const;

export interface AgreementTerms {
  orderId: bigint;
  payer: Address;
  payee: Address;
  price: bigint;
  specHash: Hex;
  termsHash: Hex;
  expiry: number;
}

export function agreementTypedData(deployment: Deployment, terms: AgreementTerms) {
  return {
    domain: { name: "Escrow", version: "1", chainId: deployment.chainId, verifyingContract: deployment.escrow },
    types: agreementTypes,
    primaryType: "Agreement" as const,
    message: terms,
  };
}

export function proposalPrice(applicationAmount: string | null, changaAmount: string | null): bigint | null {
  const raw = applicationAmount ?? changaAmount;
  return raw !== null && /^\d+$/.test(raw) ? BigInt(raw) : null;
}
