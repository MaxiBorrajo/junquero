import { encodeAbiParameters, encodeFunctionData, keccak256, toBytes, type Address, type Hex } from "viem";
import { arbitrationAbi, CasePhase } from "./arbitrationAbi";

export const seedCommitment = (caseId: bigint, juror: Address, secret: Hex): Hex =>
  keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "address" }, { type: "bytes32" }], [caseId, juror, secret]));

export const voteCommitment = (caseId: bigint, juror: Address, vote: number, salt: Hex): Hex =>
  keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "address" }, { type: "uint8" }, { type: "bytes32" }], [caseId, juror, vote, salt]));

export const reasonHash = (text: string): Hex => keccak256(toBytes(text.trim()));

export const randomHex32 = (random: (n: number) => Uint8Array): Hex =>
  `0x${Array.from(random(32), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;

const call = (functionName: string, args: unknown[]): Hex => encodeFunctionData({ abi: arbitrationAbi, functionName, args } as never);

export const encodeRespond = (caseId: bigint, hash: Hex): Hex => call("respond", [caseId, hash]);
export const encodeCommitSeed = (caseId: bigint, commitment: Hex): Hex => call("commitSeed", [caseId, commitment]);
export const encodeRevealSeed = (caseId: bigint, secret: Hex): Hex => call("revealSeed", [caseId, secret]);
export const encodeCommitVote = (caseId: bigint, commitment: Hex): Hex => call("commitVote", [caseId, commitment]);
export const encodeRevealVote = (caseId: bigint, vote: number, salt: Hex): Hex => call("revealVote", [caseId, vote, salt]);
export const encodeAppeal = (caseId: bigint): Hex => call("appeal", [caseId]);
export const encodeUnstake = (amount: bigint): Hex => call("unstake", [amount]);
export const encodeWithdrawReward = (token: Address): Hex => call("withdrawReward", [token]);

export interface CaseSnapshot {
  orderId: number;
  payer: Address;
  payee: Address;
  claimant: Address;
  token: Address;
  fee: bigint;
  jurors: number;
  phase: CasePhase;
  round: number;
  revealedVotes: number;
  payeeVotes: number;
  payerVotes: number;
  commitEnd: number;
  revealEnd: number;
  appealed: boolean;
  verdictPayee: boolean;
  appealEnd: number;
  appellant: Address;
  appealFee: bigint;
}

export interface JurorSnapshot {
  selected: boolean;
  voteCommit: Hex;
  vote: number;
}

export type CaseView =
  | "waiting-response"
  | "seed-commit"
  | "seed-reveal"
  | "seed-draw"
  | "vote-commit"
  | "vote-reveal"
  | "vote-wait"
  | "verdict-appealable"
  | "verdict-final"
  | "emergency"
  | "resolved";

const ZERO_HASH = `0x${"0".repeat(64)}`;

export function phaseView(snapshot: CaseSnapshot, nowSeconds: number): CaseView {
  switch (snapshot.phase) {
    case CasePhase.Response:
      return "waiting-response";
    case CasePhase.Seed:
      return nowSeconds <= snapshot.commitEnd ? "seed-commit" : nowSeconds <= snapshot.revealEnd ? "seed-reveal" : "seed-draw";
    case CasePhase.Vote:
      return nowSeconds <= snapshot.commitEnd ? "vote-commit" : nowSeconds <= snapshot.revealEnd ? "vote-reveal" : "vote-wait";
    case CasePhase.Decided:
      return nowSeconds <= snapshot.appealEnd ? "verdict-appealable" : "verdict-final";
    case CasePhase.NeedsEmergency:
      return "emergency";
    default:
      return "resolved";
  }
}

export type PartyRole = "claimant" | "respondent" | "none";

export function partyRole(snapshot: Pick<CaseSnapshot, "payer" | "payee" | "claimant">, address: string): PartyRole {
  const me = address.toLowerCase();
  if (snapshot.claimant.toLowerCase() === me) return "claimant";
  if (snapshot.payer.toLowerCase() === me || snapshot.payee.toLowerCase() === me) return "respondent";
  return "none";
}

export function canRespond(snapshot: CaseSnapshot, address: string, nowSeconds: number): boolean {
  return snapshot.phase === CasePhase.Response && partyRole(snapshot, address) === "respondent" && nowSeconds <= snapshot.commitEnd;
}

export function loser(snapshot: Pick<CaseSnapshot, "payer" | "payee" | "verdictPayee">): Address {
  return snapshot.verdictPayee ? snapshot.payer : snapshot.payee;
}

export function canAppeal(snapshot: CaseSnapshot, address: string, nowSeconds: number): boolean {
  return snapshot.phase === CasePhase.Decided && !snapshot.appealed && nowSeconds <= snapshot.appealEnd && loser(snapshot).toLowerCase() === address.toLowerCase();
}

export const appealCost = (jurorFee: bigint, jurors: number): bigint => jurorFee * BigInt(2 * jurors + 1);

export function jurorAction(view: CaseView, juror: JurorSnapshot, hasSeedCommit: boolean): "commit-vote" | "reveal-vote" | "wait" | "done" {
  if (!juror.selected) return "wait";
  if (view === "vote-commit") return juror.voteCommit === ZERO_HASH ? "commit-vote" : "wait";
  if (view === "vote-reveal") return juror.voteCommit !== ZERO_HASH && juror.vote === 0 ? "reveal-vote" : juror.vote !== 0 ? "done" : "wait";
  void hasSeedCommit;
  return "wait";
}

export function stakeNeeded(required: bigint, available: bigint): bigint {
  return available >= required ? 0n : required - available;
}

export function disputeCost(size: number, jurorFee: bigint, jurors: number): bigint {
  return size === 0 ? 0n : jurorFee * BigInt(jurors);
}

export const encodeStakeWithPermit = (amount: bigint, deadline: bigint, v: number, r: Hex, sigS: Hex): Hex => call("stakeWithPermit", [amount, deadline, v, r, sigS]);
export const encodeAppealWithPermit = (caseId: bigint, deadline: bigint, v: number, r: Hex, sigS: Hex): Hex => call("appealWithPermit", [caseId, deadline, v, r, sigS]);
