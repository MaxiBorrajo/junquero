import { keccak256, toBytes, type Address } from "viem";
import { readContract } from "wagmi/actions";
import { wagmiAdapter } from "../wallet/appkit";
import { escrowAbi, forwarderAbi, registryAbi, tokenAbi } from "./abis";
import { deployment } from "./deployment";

const config = () => wagmiAdapter.wagmiConfig;

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

import { orderAbi } from "./orderAbi";

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

export async function readOrder(orderId: number): Promise<OrderState> {
  const order = await readContract(config(), { address: deployment.escrow, abi: orderAbi, functionName: "getOrder", args: [BigInt(orderId)] });
  return {
    payer: order.payer,
    payee: order.payee,
    status: order.status,
    price: order.price,
    deposited: order.deposited,
    evidenceHash: order.evidenceHash,
    startsAt: order.startsAt,
    deadline: order.deadline,
    deliveredAt: order.deliveredAt,
    checkedInAt: order.checkedInAt,
    arrivalConfirmed: order.arrivalConfirmed,
    hasMilestones: order.hasMilestones,
    isGroup: order.isGroup,
    modality: order.modality,
    sizeClass: order.sizeClass,
    specHash: order.specHash,
  };
}


import { arbitrationAbi } from "./arbitrationAbi";
import type { CaseSnapshot, JurorSnapshot } from "./jury";

export async function readCase(caseId: number): Promise<CaseSnapshot> {
  const c = await readContract(config(), { address: deployment.arbitration, abi: arbitrationAbi, functionName: "getCase", args: [BigInt(caseId)] });
  return {
    orderId: Number(c.orderId),
    payer: c.payer,
    payee: c.payee,
    claimant: c.claimant,
    token: c.token,
    fee: c.fee,
    jurors: c.jurors,
    phase: c.phase,
    round: c.round,
    revealedVotes: c.revealedVotes,
    payeeVotes: c.payeeVotes,
    payerVotes: c.payerVotes,
    commitEnd: c.commitEnd,
    revealEnd: c.revealEnd,
    appealed: c.appealed,
    verdictPayee: c.verdictPayee,
    appealEnd: c.appealEnd,
    appellant: c.appellant,
    appealFee: c.appealFee,
  };
}

export const readJurors = (caseId: number): Promise<readonly Address[]> =>
  readContract(config(), { address: deployment.arbitration, abi: arbitrationAbi, functionName: "jurorsOf", args: [BigInt(caseId)] });

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

export async function readMilestoneRule(): Promise<{ threshold: bigint; minDuration: bigint }> {
  const [config, minDuration] = await Promise.all([
    readContract(config_(), { address: deployment.escrow, abi: escrowAbi, functionName: "tokenConfig", args: [deployment.token] }),
    readParam("MILESTONE_MIN_DURATION"),
  ]);
  return { threshold: config.milestoneAmount, minDuration };
}

const config_ = () => wagmiAdapter.wagmiConfig;

import { groupAbi } from "./group";

export async function readGroup(orderId: number) {
  const [info, contributors] = await Promise.all([
    readContract(config(), { address: deployment.escrow, abi: groupAbi, functionName: "getGroup", args: [BigInt(orderId)] }),
    readContract(config(), { address: deployment.escrow, abi: groupAbi, functionName: "contributorsOf", args: [BigInt(orderId)] }),
  ]);
  const amounts = await Promise.all(contributors.map((account) => readContract(config(), { address: deployment.escrow, abi: groupAbi, functionName: "contributionOf", args: [BigInt(orderId), account] })));
  return {
    target: info.target,
    totalContributed: info.totalContributed,
    fundingDeadline: info.fundingDeadline,
    proposedPayee: info.proposedPayee,
    proposedAt: info.proposedAt,
    vetoMoney: info.vetoMoney,
    vetoCount: info.vetoCount,
    contributors: contributors.map((account, index) => ({ address: account, amount: amounts[index]! })),
  };
}

export async function readContributionRule(): Promise<{ minBps: bigint; maxBps: bigint; vetoWindow: number }> {
  const [minBps, maxBps, vetoWindow] = await Promise.all([readParam("CONTRIBUTION_MIN_BPS"), readParam("CONTRIBUTION_MAX_BPS"), readParam("GROUP_VETO_WINDOW")]);
  return { minBps, maxBps, vetoWindow: Number(vetoWindow) };
}

import { milestoneAbi } from "./milestones";

export async function readMilestones(orderId: number) {
  const [list, plan] = await Promise.all([
    readContract(config(), { address: deployment.escrow, abi: milestoneAbi, functionName: "getMilestones", args: [BigInt(orderId)] }),
    readContract(config(), { address: deployment.escrow, abi: milestoneAbi, functionName: "getPlan", args: [BigInt(orderId)] }),
  ]);
  return {
    milestones: list.map((item) => ({ amount: item.amount, status: item.status, deliveredAt: item.deliveredAt, evidenceHash: item.evidenceHash })),
    next: plan.next,
    count: plan.count,
    firstIsAdvance: plan.firstIsAdvance,
    paidTotal: plan.paidTotal,
  };
}
