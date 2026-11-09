import { encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import type { Deployment } from "./deployment";

export const groupAbi = parseAbi([
  "struct GroupParams { address coordinator; uint40 fundingDeadline; }",
  "struct CreateParams { address token; uint128 amount; bytes32 specHash; uint8 mode; uint8 modality; uint40 startsAt; uint40 deadline; uint8 category; }",
  "struct DepositAuth { uint8 method; uint256 nonce; uint256 deadline; bytes signature; }",
  "struct GroupInfo { uint128 target; uint128 totalContributed; uint40 fundingDeadline; address proposedPayee; uint40 proposedAt; uint32 proposalEpoch; uint128 vetoMoney; uint8 vetoCount; uint32 coordinatorEpoch; bytes32 reviewKey; uint128 objectionMoney; uint8 objectionCount; }",
  "function createGroupOrder(CreateParams params, GroupParams group) returns (uint256 orderId)",
  "function contribute(uint256 orderId, uint128 amount, DepositAuth auth)",
  "function withdrawContribution(uint256 orderId)",
  "function refundFunding(uint256 orderId)",
  "function proposeProvider(uint256 orderId, address payee)",
  "function vetoProvider(uint256 orderId)",
  "function supportCoordinator(uint256 orderId, address candidate)",
  "function object(uint256 orderId, bytes32 reasonHash, DepositAuth auth)",
  "function getGroup(uint256 orderId) view returns (GroupInfo)",
  "function contributorsOf(uint256 orderId) view returns (address[])",
  "function contributionOf(uint256 orderId, address account) view returns (uint128)",
]);

export interface ContributionLimits {
  min: bigint;
  max: bigint;
}

export const BPS = 10_000n;

export function contributionLimits(target: bigint, minBps: bigint, maxBps: bigint): ContributionLimits {
  return { min: (target * minBps) / BPS, max: (target * maxBps) / BPS };
}

export type ContributionCheck = { ok: true } | { ok: false; reason: "zero" | "range" | "exceeds"; min?: bigint; max?: bigint; remaining?: bigint };

export function checkContribution(amount: bigint, current: bigint, target: bigint, contributed: bigint, limits: ContributionLimits): ContributionCheck {
  if (amount <= 0n) return { ok: false, reason: "zero" };
  const remaining = target - contributed;
  if (amount > remaining) return { ok: false, reason: "exceeds", remaining };
  const total = current + amount;
  if (total > limits.max || (total < limits.min && amount !== remaining)) return { ok: false, reason: "range", min: limits.min, max: limits.max };
  return { ok: true };
}

export const fundingProgress = (contributed: bigint, target: bigint): number => (target === 0n ? 0 : Number((contributed * 10_000n) / target) / 100);

export const percentOf = (amount: bigint, target: bigint): number => (target === 0n ? 0 : Math.round(Number((amount * 10_000n) / target)) / 100);

export function vetoOpen(proposedAt: number, windowSeconds: number, nowSeconds: number): boolean {
  return proposedAt > 0 && nowSeconds < proposedAt + windowSeconds;
}

const call = (functionName: string, args: unknown[]): Hex => encodeFunctionData({ abi: groupAbi, functionName, args } as never);

export const encodeCreateGroup = (deployment: Deployment, params: { amount: bigint; specHash: Hex; modality: number; startsAt: number; deadline: number; category: number }, fundingDeadline: number): Hex =>
  call("createGroupOrder", [
    { token: deployment.token, amount: params.amount, specHash: params.specHash, mode: 0, modality: params.modality, startsAt: params.startsAt, deadline: params.deadline, category: params.category },
    { coordinator: "0x0000000000000000000000000000000000000000", fundingDeadline },
  ]);

export const encodeContribute = (orderId: bigint, amount: bigint, auth: { method: number; nonce: bigint; deadline: bigint; signature: Hex }): Hex => call("contribute", [orderId, amount, auth]);
export const encodeWithdrawContribution = (orderId: bigint): Hex => call("withdrawContribution", [orderId]);
export const encodeRefundFunding = (orderId: bigint): Hex => call("refundFunding", [orderId]);
export const encodeProposeProvider = (orderId: bigint, payee: Address): Hex => call("proposeProvider", [orderId, payee]);
export const encodeVetoProvider = (orderId: bigint): Hex => call("vetoProvider", [orderId]);
export const encodeObject = (orderId: bigint, reasonHash: Hex, auth: { method: number; nonce: bigint; deadline: bigint; signature: Hex }): Hex => call("object", [orderId, reasonHash, auth]);
