import { encodeAbiParameters, keccak256, toBytes, type Hex } from "viem";
import type { Spec } from "./spec";

export interface MilestoneTermsData {
  baseTerms: Hex;
  amounts: bigint[];
  criteria: Hex[];
  firstIsAdvance: boolean;
}

export const criteriaHash = (milestone: { name: string; criteria: string; evidence: string }): Hex =>
  keccak256(toBytes(`${milestone.name}\n${milestone.criteria}\n${milestone.evidence}`));

export function milestoneTerms(spec: Pick<Spec, "milestones">, specHash: Hex): MilestoneTermsData | null {
  if (!spec.milestones || spec.milestones.length === 0) return null;
  return {
    baseTerms: specHash,
    amounts: spec.milestones.map((item) => BigInt(item.amount)),
    criteria: spec.milestones.map(criteriaHash),
    firstIsAdvance: false,
  };
}

export const milestoneTermsHash = (terms: MilestoneTermsData): Hex =>
  keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "uint128[]" }, { type: "bytes32[]" }, { type: "bool" }], [terms.baseTerms, terms.amounts, terms.criteria, terms.firstIsAdvance]),
  );

export const milestoneTotal = (spec: Pick<Spec, "milestones">): bigint => (spec.milestones ?? []).reduce((sum, item) => sum + BigInt(item.amount), 0n);
