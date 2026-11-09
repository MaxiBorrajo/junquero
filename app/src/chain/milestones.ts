import { encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import type { Deployment } from "./deployment";

export const milestoneAbi = parseAbi([
  "struct Milestone { uint128 amount; uint8 status; uint40 deliveredAt; bytes32 evidenceHash; }",
  "struct MilestonePlan { uint8 count; uint8 next; uint8 disputedIndex; bool firstIsAdvance; bool started; bool disputing; uint16 progressBps; uint16 ratingSum; uint16 ratingCount; uint128 paidTotal; uint128 refundedTotal; uint128 feeTotal; bytes32 progressEvidence; }",
  "struct MilestoneRelease { uint256 orderId; uint8 index; uint128 amount; uint8 rating; bytes32 evidenceHash; uint40 expiry; }",
  "function getMilestones(uint256 orderId) view returns (Milestone[])",
  "function getPlan(uint256 orderId) view returns (MilestonePlan)",
  "function deliverMilestone(uint256 orderId, uint8 index, bytes32 evidenceHash)",
  "function releaseMilestone(MilestoneRelease release, bytes payerSignature)",
  "function reportProgress(uint256 orderId, uint16 progressBps, bytes32 evidenceHash)",
  "function claimAdvance(uint256 orderId)",
  "function terminateEarly(uint256 orderId)",
  "function abandon(uint256 orderId)",
  "function declareAbandoned(uint256 orderId)",
]);

export enum MilestoneStatus {
  Pending = 0,
  Delivered = 1,
  Paid = 2,
  Disputed = 3,
}

export const milestoneReleaseTypes = {
  MilestoneRelease: [
    { name: "orderId", type: "uint256" },
    { name: "index", type: "uint8" },
    { name: "amount", type: "uint128" },
    { name: "rating", type: "uint8" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "expiry", type: "uint40" },
  ],
} as const;

export interface MilestoneReleaseData {
  orderId: bigint;
  index: number;
  amount: bigint;
  rating: number;
  evidenceHash: Hex;
  expiry: number;
}

export function milestoneReleaseTypedData(deployment: Deployment, data: MilestoneReleaseData) {
  return {
    domain: { name: "Escrow", version: "1", chainId: deployment.chainId, verifyingContract: deployment.escrow },
    types: milestoneReleaseTypes,
    primaryType: "MilestoneRelease" as const,
    message: data,
  };
}

const call = (functionName: string, args: unknown[]): Hex => encodeFunctionData({ abi: milestoneAbi, functionName, args } as never);

export const encodeDeliverMilestone = (orderId: bigint, index: number, evidenceHash: Hex): Hex => call("deliverMilestone", [orderId, index, evidenceHash]);
export const encodeReleaseMilestone = (data: MilestoneReleaseData, signature: Hex): Hex => call("releaseMilestone", [data, signature]);
export const encodeClaimAdvance = (orderId: bigint): Hex => call("claimAdvance", [orderId]);
export const encodeTerminateEarly = (orderId: bigint): Hex => call("terminateEarly", [orderId]);
export const encodeAbandon = (orderId: bigint): Hex => call("abandon", [orderId]);
export const encodeDeclareAbandoned = (orderId: bigint): Hex => call("declareAbandoned", [orderId]);

export interface MilestoneQr {
  v: 1;
  k: "m";
  o: number;
  i: number;
  p: string;
  a: string;
  r: number;
  h: string;
  e: number;
  s: string;
}

export const encodeMilestoneQr = (data: MilestoneReleaseData, payee: Address, signature: Hex): string =>
  JSON.stringify({ v: 1, k: "m", o: Number(data.orderId), i: data.index, p: payee, a: data.amount.toString(), r: data.rating, h: data.evidenceHash, e: data.expiry, s: signature } satisfies MilestoneQr);

export function parseMilestoneQr(text: string, nowSeconds: number): { data: MilestoneReleaseData; payee: Address; signature: Hex } | "invalid" | "expired" {
  try {
    const raw = JSON.parse(text) as Partial<MilestoneQr>;
    if (raw.v !== 1 || raw.k !== "m" || !Number.isSafeInteger(raw.o) || !Number.isInteger(raw.i) || raw.i! < 0 || raw.i! > 19) return "invalid";
    if (typeof raw.a !== "string" || !/^\d+$/.test(raw.a) || !Number.isInteger(raw.r) || raw.r! < 1 || raw.r! > 5) return "invalid";
    if (typeof raw.h !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(raw.h) || typeof raw.p !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(raw.p)) return "invalid";
    if (typeof raw.s !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(raw.s) || !Number.isSafeInteger(raw.e)) return "invalid";
    if (raw.e! < nowSeconds) return "expired";
    return { data: { orderId: BigInt(raw.o!), index: raw.i!, amount: BigInt(raw.a), rating: raw.r!, evidenceHash: raw.h as Hex, expiry: raw.e! }, payee: raw.p as Address, signature: raw.s as Hex };
  } catch {
    return "invalid";
  }
}
