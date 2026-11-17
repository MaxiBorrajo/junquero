import { keccak256, toBytes, type Address } from "viem";
import { readContract } from "wagmi/actions";
import { publicConfig } from "./publicConfig";
import { escrowAbi, forwarderAbi, registryAbi, tokenAbi } from "./abis";
import { deployment } from "./deployment";

const config = () => publicConfig;

export const readTokenBalance = (owner: Address): Promise<bigint> =>
  readContract(config(), { address: deployment.token, abi: tokenAbi, functionName: "balanceOf", args: [owner] });

export const readTokenNonce = (owner: Address): Promise<bigint> =>
  readContract(config(), { address: deployment.token, abi: tokenAbi, functionName: "nonces", args: [owner] });

export const readForwarderNonce = (owner: Address): Promise<bigint> =>
  readContract(config(), { address: deployment.forwarder, abi: forwarderAbi, functionName: "nonces", args: [owner] });

export interface FeeRule {
  bps: bigint;
  floor: bigint;
  cap: bigint;
}

export async function readFeeRule(): Promise<FeeRule> {
  const [bps, tokenConfig] = await Promise.all([
    readContract(config(), { address: deployment.parameterRegistry, abi: registryAbi, functionName: "get", args: [keccak256(toBytes("FEE_BPS"))] }),
    readContract(config(), { address: deployment.escrow, abi: escrowAbi, functionName: "tokenConfig", args: [deployment.token] }),
  ]);
  return { bps: BigInt(bps), floor: tokenConfig.feeFloor, cap: tokenConfig.feeCap };
}

export interface OrderState {
  payer: Address;
  payee: Address;
  status: number;
  price: bigint;
  deposited: bigint;
  evidenceHash: `0x${string}`;
  startsAt: number;
  deadline: number;
  deliveredAt: number;
  checkedInAt: number;
  arrivalConfirmed: boolean;
  hasMilestones: boolean;
  isGroup: boolean;
  modality: number;
  sizeClass: number;
  specHash: `0x${string}`;
}

import { arbitrationAbi } from "./arbitrationAbi";
import type { JurorSnapshot } from "./jury";

export async function readJurorCase(caseId: number, juror: Address): Promise<JurorSnapshot> {
  const c = await readContract(config(), { address: deployment.arbitration, abi: arbitrationAbi, functionName: "jurorCase", args: [BigInt(caseId), juror] });
  return { selected: c.selected, voteCommit: c.voteCommit, vote: c.vote };
}

export const readIsEligible = (caseId: number, juror: Address): Promise<boolean> =>
  readContract(config(), { address: deployment.arbitration, abi: arbitrationAbi, functionName: "isEligible", args: [juror, BigInt(caseId)] });

export async function readJurorAccount(juror: Address) {
  const a = await readContract(config(), { address: deployment.arbitration, abi: arbitrationAbi, functionName: "account", args: [juror] });
  return { staked: a.staked, locked: a.locked, active: a.active, seed: a.seed };
}

export const readReward = (juror: Address): Promise<bigint> =>
  readContract(config(), { address: deployment.arbitration, abi: arbitrationAbi, functionName: "rewards", args: [deployment.token, juror] });

export async function readParam(name: string): Promise<bigint> {
  return BigInt(await readContract(config(), { address: deployment.parameterRegistry, abi: registryAbi, functionName: "get", args: [keccak256(toBytes(name))] }));
}

export async function readJurorFee(): Promise<bigint> {
  return (await readContract(config(), { address: deployment.escrow, abi: escrowAbi, functionName: "tokenConfig", args: [deployment.token] })).jurorFee;
}

export const readCommitters = (caseId: number, round: number): Promise<readonly Address[]> =>
  readContract(config(), { address: deployment.arbitration, abi: arbitrationAbi, functionName: "committersOf", args: [BigInt(caseId), round] });

export const readRevealers = (caseId: number, round: number): Promise<readonly Address[]> =>
  readContract(config(), { address: deployment.arbitration, abi: arbitrationAbi, functionName: "revealersOf", args: [BigInt(caseId), round] });

import { groupAbi } from "./group";

export async function readContributionRule(): Promise<{ minBps: bigint; maxBps: bigint; vetoWindow: number }> {
  const [minBps, maxBps, vetoWindow] = await Promise.all([readParam("CONTRIBUTION_MIN_BPS"), readParam("CONTRIBUTION_MAX_BPS"), readParam("GROUP_VETO_WINDOW")]);
  return { minBps, maxBps, vetoWindow: Number(vetoWindow) };
}

export const readContributionOf = (orderId: number, account: Address): Promise<bigint> =>
  readContract(config(), { address: deployment.escrow, abi: groupAbi, functionName: "contributionOf", args: [BigInt(orderId), account] });
