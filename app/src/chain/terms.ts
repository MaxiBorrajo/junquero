import { encodeAbiParameters, keccak256, toBytes, type Hex } from "viem";
import type { Milestone } from "../api/types";

export interface MilestoneTerms {
  baseTerms: Hex;
  amounts: bigint[];
  criteria: Hex[];
  firstIsAdvance: boolean;
}

export const criteriaHash = (milestone: Pick<Milestone, "name" | "criteria" | "evidence">): Hex =>
  keccak256(toBytes(`${milestone.name}\n${milestone.criteria}\n${milestone.evidence}`));

export function milestoneTerms(milestones: Milestone[] | undefined, advance: boolean | undefined, specHash: Hex): MilestoneTerms | null {
  if (!milestones || milestones.length === 0) return null;
  return { baseTerms: specHash, amounts: milestones.map((item) => BigInt(item.amount)), criteria: milestones.map(criteriaHash), firstIsAdvance: advance === true };
}

export const milestoneTermsHash = (terms: MilestoneTerms): Hex =>
  keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint128[]" }, { type: "bytes32[]" }, { type: "bool" }], [terms.baseTerms, terms.amounts, terms.criteria, terms.firstIsAdvance]));

export const milestoneTotal = (milestones: Milestone[]): bigint => milestones.reduce((sum, item) => sum + BigInt(item.amount), 0n);

export const MILESTONE_ADVANCE_MAX_BPS = 3000n;

export function milestonesRequired(price: bigint, milestoneThreshold: bigint, durationSeconds: number, minDurationSeconds: number): boolean {
  return price > milestoneThreshold || durationSeconds > minDurationSeconds;
}
