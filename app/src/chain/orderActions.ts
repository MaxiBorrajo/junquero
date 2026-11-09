import { encodeFunctionData, type Address, type Hex } from "viem";
import type { Api } from "../api/client";
import { orderAbi, releaseTypes } from "./orderAbi";
import { FORWARD_VALIDITY_SECONDS, forwardTypedData, relayBody } from "./createOrder";
import type { Deployment } from "./deployment";

export const ACTION_GAS = 1_500_000n;
export const RELEASE_VALIDITY_SECONDS = 24 * 3600;

export interface ReleaseData {
  orderId: bigint;
  payee: Address;
  amount: bigint;
  rating: number;
  evidenceHash: Hex;
  expiry: number;
}

export function releaseTypedData(deployment: Deployment, data: ReleaseData) {
  return {
    domain: { name: "Escrow", version: "1", chainId: deployment.chainId, verifyingContract: deployment.escrow },
    types: releaseTypes,
    primaryType: "Release" as const,
    message: data,
  };
}

export const encodeDeliver = (orderId: bigint, evidenceHash: Hex): Hex => encodeFunctionData({ abi: orderAbi, functionName: "deliver", args: [orderId, evidenceHash] });
export const encodeCheckIn = (orderId: bigint): Hex => encodeFunctionData({ abi: orderAbi, functionName: "checkIn", args: [orderId] });
export const encodeConfirmArrival = (orderId: bigint): Hex => encodeFunctionData({ abi: orderAbi, functionName: "confirmArrival", args: [orderId] });
export const encodeCancel = (orderId: bigint): Hex => encodeFunctionData({ abi: orderAbi, functionName: "cancel", args: [orderId] });
export const encodeExtendReview = (orderId: bigint): Hex => encodeFunctionData({ abi: orderAbi, functionName: "extendReview", args: [orderId] });
export const NO_AUTH = { method: 0, nonce: 0n, deadline: 0n, signature: "0x" as Hex };

export const encodeOpenDispute = (orderId: bigint, reasonHash: Hex, auth: { method: number; nonce: bigint; deadline: bigint; signature: Hex }): Hex =>
  encodeFunctionData({ abi: orderAbi, functionName: "openDispute", args: [orderId, reasonHash, auth] });
export const encodeRelease = (data: ReleaseData, payerSignature: Hex): Hex => encodeFunctionData({ abi: orderAbi, functionName: "release", args: [data, payerSignature] });

export interface RelayDeps {
  api: Api;
  deployment: Deployment;
  account: Address;
  now: () => number;
  readForwarderNonce: () => Promise<bigint>;
  signTypedData: (typed: unknown) => Promise<Hex>;
}

export async function sendViaRelay(deps: RelayDeps, data: Hex, gas: bigint = ACTION_GAS, to?: Address): Promise<Hex> {
  const target = to ?? deps.deployment.escrow;
  const deadline = deps.now() + FORWARD_VALIDITY_SECONDS;
  const nonce = await deps.readForwarderNonce();
  const signature = await deps.signTypedData(forwardTypedData(deps.deployment, deps.account, target, data, nonce, deadline, gas));
  const { txHash } = await deps.api.send<{ txHash: Hex }>("POST", "/relay", relayBody(deps.account, target, data, gas, deadline, signature));
  return txHash;
}

export interface ReleaseQr {
  v: 1;
  o: number;
  p: string;
  a: string;
  r: number;
  h: string;
  e: number;
  s: string;
}

export function encodeReleaseQr(data: ReleaseData, signature: Hex): string {
  const payload: ReleaseQr = { v: 1, o: Number(data.orderId), p: data.payee, a: data.amount.toString(), r: data.rating, h: data.evidenceHash, e: data.expiry, s: signature };
  return JSON.stringify(payload);
}

export function parseReleaseQr(text: string, nowSeconds: number): { data: ReleaseData; signature: Hex } | "invalid" | "expired" {
  try {
    const raw = JSON.parse(text) as Partial<ReleaseQr>;
    if (raw.v !== 1 || !Number.isSafeInteger(raw.o) || typeof raw.p !== "string" || typeof raw.a !== "string" || !/^\d+$/.test(raw.a)) return "invalid";
    if (!Number.isInteger(raw.r) || raw.r! < 1 || raw.r! > 5 || typeof raw.h !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(raw.h)) return "invalid";
    if (!Number.isSafeInteger(raw.e) || typeof raw.s !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(raw.s) || !/^0x[0-9a-fA-F]{40}$/.test(raw.p)) return "invalid";
    if (raw.e! < nowSeconds) return "expired";
    return {
      data: { orderId: BigInt(raw.o!), payee: raw.p as Address, amount: BigInt(raw.a), rating: raw.r!, evidenceHash: raw.h as Hex, expiry: raw.e! },
      signature: raw.s as Hex,
    };
  } catch {
    return "invalid";
  }
}
