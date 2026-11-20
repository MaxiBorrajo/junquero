import type { Address } from "viem";
import type { Api } from "../api/client";
import type { CaseSnapshot } from "./jury";
import type { OrderState } from "./reader";

// Estado de la cadena que lee el servidor una vez y comparte entre todos (en lugar de que cada celular consulte el nodo).
// Los números grandes llegan como texto y acá se vuelven a pasar a bigint.

type Raw = Record<string, unknown>;
const big = (value: unknown): bigint => BigInt(String(value ?? 0));

export function orderFromServer(raw: Raw): OrderState {
  return {
    payer: raw.payer as Address,
    payee: raw.payee as Address,
    status: Number(raw.status),
    price: big(raw.price),
    deposited: big(raw.deposited),
    evidenceHash: raw.evidenceHash as `0x${string}`,
    startsAt: Number(raw.startsAt),
    agreedAt: Number(raw.agreedAt ?? 0),
    cash: Number(raw.mode ?? 0) === 1,
    deadline: Number(raw.deadline),
    deliveredAt: Number(raw.deliveredAt),
    checkedInAt: Number(raw.checkedInAt),
    arrivalConfirmed: Boolean(raw.arrivalConfirmed),
    hasMilestones: Boolean(raw.hasMilestones),
    isGroup: Boolean(raw.isGroup),
    modality: Number(raw.modality),
    sizeClass: Number(raw.sizeClass),
    specHash: raw.specHash as `0x${string}`,
  };
}

export function groupFromServer(raw: { info: Raw; contributors: { address: string; amount: unknown }[] }) {
  const info = raw.info;
  return {
    target: big(info.target),
    totalContributed: big(info.totalContributed),
    fundingDeadline: Number(info.fundingDeadline),
    proposedPayee: info.proposedPayee as Address,
    proposedAt: Number(info.proposedAt),
    vetoMoney: big(info.vetoMoney),
    vetoCount: Number(info.vetoCount),
    objectionMoney: big(info.objectionMoney),
    objectionCount: Number(info.objectionCount),
    contributors: raw.contributors.map((item) => ({ address: item.address as Address, amount: big(item.amount) })),
  };
}

export function milestonesFromServer(raw: { milestones: Raw[]; plan: Raw }) {
  return {
    milestones: raw.milestones.map((item) => ({ amount: big(item.amount), status: Number(item.status), deliveredAt: Number(item.deliveredAt), evidenceHash: item.evidenceHash as `0x${string}` })),
    next: Number(raw.plan.next),
    count: Number(raw.plan.count),
    paidTotal: big(raw.plan.paidTotal),
    progressBps: Number(raw.plan.progressBps ?? 0),
    started: Boolean(raw.plan.started),
    disputing: Boolean(raw.plan.disputing),
    disputedIndex: Number(raw.plan.disputedIndex ?? 0),
  };
}

export function caseFromServer(raw: { case: Raw; jurors: string[] }): { snapshot: CaseSnapshot; jurors: Address[] } {
  const c = raw.case;
  return {
    snapshot: {
      orderId: Number(c.orderId),
      payer: c.payer as Address,
      payee: c.payee as Address,
      claimant: c.claimant as Address,
      token: c.token as Address,
      fee: big(c.fee),
      jurors: Number(c.jurors),
      phase: Number(c.phase) as CaseSnapshot["phase"],
      round: Number(c.round),
      roundBase: Number(c.roundBase ?? 0),
      revealedVotes: Number(c.revealedVotes),
      payeeVotes: Number(c.payeeVotes),
      payerVotes: Number(c.payerVotes),
      commitEnd: Number(c.commitEnd),
      revealEnd: Number(c.revealEnd),
      appealed: Boolean(c.appealed),
      verdictPayee: Boolean(c.verdictPayee),
      appealEnd: Number(c.appealEnd),
      appellant: c.appellant as Address,
      appealFee: big(c.appealFee),
    },
    jurors: raw.jurors as Address[],
  };
}

// Justo después de una acción confirmada, el servidor no debe devolver una lectura guardada de antes de la acción.
let freshUntil = 0;
const FRESH_WINDOW_MS = 15_000;
export const markFresh = (now = Date.now()): void => {
  freshUntil = now + FRESH_WINDOW_MS;
};
export const freshSuffix = (now = Date.now()): string => (now < freshUntil ? "?fresh=1" : "");

export const fetchOrder = async (api: Api, orderId: number) => orderFromServer(await api.get<Raw>(`/me/chain/orders/${orderId}${freshSuffix()}`));
export const fetchGroup = async (api: Api, orderId: number) => groupFromServer(await api.get(`/me/chain/orders/${orderId}/group${freshSuffix()}`));
export const fetchMilestones = async (api: Api, orderId: number) => milestonesFromServer(await api.get(`/me/chain/orders/${orderId}/milestones${freshSuffix()}`));
export const fetchCase = async (api: Api, caseId: number) => caseFromServer(await api.get(`/me/chain/cases/${caseId}${freshSuffix()}`));
