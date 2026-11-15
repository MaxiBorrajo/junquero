import type { Attachment, Milestone, Spec } from "../api/types";
import { approximateCenter, type LatLng } from "../lib/geo";
import { toMicro } from "../lib/money";

export const MIN_AMOUNT_MICRO = 5_000_000n;
export const MIN_LEAD_SECONDS = 3600;
export const APPROX_RADIUS_M = 300;
export const TITLE_MIN = 3;
export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 2000;
export const EVIDENCE_MAX = 5;
export const EVIDENCE_LENGTH = 120;
export const ATTACHMENTS_MAX = 10;

export type Modality = "onsite" | "remote";
export type Kind = "individual" | "group";
export type Materials = "payer" | "worker";

export interface MilestoneDraft {
  name: string;
  amount: string;
  criteria: string;
  evidence: string;
}

export const MIN_MILESTONES = 2;
export const MAX_MILESTONES = 20;
export const FUNDING_DAYS = [3, 7, 14, 30];

export interface Draft {
  title: string;
  description: string;
  category: number | null;
  modality: Modality;
  point: LatLng | null;
  approx: LatLng | null;
  startsAt: number | null;
  deadline: number | null;
  durationMin: number | null;
  attachments: Attachment[];
  evidence: string[];
  amount: string;
  kind: Kind;
  fundingDays: number;
  // Aporte del que crea la changa grupal (opcional). Se suma recién cuando el grupo queda confirmado.
  ownContribution: string;
  useMilestones: boolean;
  materials: Materials;
  milestones: MilestoneDraft[];
}

export const emptyDraft = (): Draft => ({
  title: "",
  description: "",
  category: null,
  modality: "onsite",
  point: null,
  approx: null,
  startsAt: null,
  deadline: null,
  durationMin: null,
  attachments: [],
  evidence: [],
  amount: "",
  kind: "individual",
  fundingDays: 7,
  ownContribution: "",
  useMilestones: false,
  materials: "payer",
  milestones: [],
});

export type StepKey = "basics" | "when" | "files" | "price" | "evidence";

// Cantidad de pasos del asistente: con hitos, cada hito pide su propia evidencia y no hay paso de evidencia.
export const stepsTotal = (draft: Draft): number => (draft.useMilestones ? 6 : 7);
export type DraftErrors = Partial<Record<string, string>>;

export function validateBasics(draft: Draft): DraftErrors {
  const errors: DraftErrors = {};
  const title = draft.title.trim();
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) errors.title = "title";
  if (draft.description.length > DESCRIPTION_MAX) errors.description = "description";
  if (draft.category === null) errors.category = "category";
  return errors;
}

export function validateWhen(draft: Draft, nowSeconds: number): DraftErrors {
  const errors: DraftErrors = {};
  const earliest = nowSeconds + MIN_LEAD_SECONDS;
  if (draft.modality === "onsite") {
    if (!draft.point) errors.point = "point";
    if (draft.startsAt === null || draft.startsAt < earliest) errors.startsAt = "startsAt";
  } else if (draft.deadline === null || draft.deadline < earliest) {
    errors.deadline = "deadline";
  }
  if (draft.durationMin !== null && (draft.durationMin < 1 || draft.durationMin > 10080)) errors.durationMin = "durationMin";
  return errors;
}

export function validateFiles(draft: Draft): DraftErrors {
  return draft.attachments.length > ATTACHMENTS_MAX ? { attachments: "attachments" } : {};
}

export function parseAmount(input: string): bigint | null {
  const clean = input.trim().replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(clean)) return null;
  return toMicro(clean);
}

export const emptyMilestone = (): MilestoneDraft => ({ name: "", amount: "", criteria: "", evidence: "" });

export function milestoneAmounts(draft: Draft): bigint[] | null {
  const amounts = draft.milestones.map((item) => parseAmount(item.amount));
  return amounts.some((value) => value === null || value <= 0n) ? null : (amounts as bigint[]);
}

// Lo que vale el trabajo (o la meta del grupo): el monto que se escribe, o la suma de los hitos si se divide en hitos.
export function totalAmount(draft: Draft): bigint | null {
  return draft.useMilestones ? milestonesSum(draft) : parseAmount(draft.amount);
}

// Suma de los hitos cargados; null si alguno no tiene un monto válido.
export function milestonesSum(draft: Draft): bigint | null {
  const amounts = milestoneAmounts(draft);
  return amounts ? amounts.reduce((sum, value) => sum + value, 0n) : null;
}

export function validateMilestones(draft: Draft): DraftErrors {
  if (!draft.useMilestones) return {};
  const errors: DraftErrors = {};
  if (draft.milestones.length < MIN_MILESTONES || draft.milestones.length > MAX_MILESTONES) errors.milestones = "count";
  draft.milestones.forEach((item, index) => {
    const amount = parseAmount(item.amount);
    if (item.name.trim().length < 2 || item.name.trim().length > 60) errors[`m${index}.name`] = "name";
    if (amount === null || amount <= 0n) errors[`m${index}.amount`] = "amount";
    if (item.criteria.trim().length < 3 || item.criteria.trim().length > 200) errors[`m${index}.criteria`] = "criteria";
    if (item.evidence.trim().length < 3 || item.evidence.trim().length > 100) errors[`m${index}.evidence`] = "evidence";
  });
  return errors;
}

// Un aporte individual a una changa grupal va de 5% a 50% de la meta (valores iniciales del contrato).
export const GROUP_CONTRIBUTION_MIN_BPS = 500n;
export const GROUP_CONTRIBUTION_MAX_BPS = 5000n;

export function groupContributionRange(target: bigint): { min: bigint; max: bigint } {
  return { min: (target * GROUP_CONTRIBUTION_MIN_BPS) / 10_000n, max: (target * GROUP_CONTRIBUTION_MAX_BPS) / 10_000n };
}

export function validatePrice(draft: Draft): DraftErrors {
  const errors: DraftErrors = {};
  const amount = totalAmount(draft);
  if (amount === null) errors.amount = "amount";
  else if (amount < MIN_AMOUNT_MICRO) errors.amount = "amountMin";
  if (draft.kind === "group" && draft.ownContribution.trim() !== "" && amount !== null) {
    const own = parseAmount(draft.ownContribution);
    const range = groupContributionRange(amount);
    if (own === null || own <= 0n) errors.ownContribution = "amount";
    else if (own < range.min || own > range.max) errors.ownContribution = "range";
  }
  return errors;
}

// Cómo se paga: todo al finalizar o por hitos (con hitos, cada uno con su monto y sus datos).
export function validatePayment(draft: Draft): DraftErrors {
  return validateMilestones(draft);
}

// Qué pruebas se piden para dar el trabajo por terminado (con hitos, cada hito tiene la suya).
export function validateEvidence(draft: Draft): DraftErrors {
  const errors: DraftErrors = {};
  const evidence = draft.evidence.map((item) => item.trim()).filter(Boolean);
  if (evidence.length > EVIDENCE_MAX || evidence.some((item) => item.length > EVIDENCE_LENGTH)) errors.evidence = "evidence";
  else if (!draft.useMilestones && evidence.length === 0) errors.evidence = "required";
  return errors;
}

export function validateAll(draft: Draft, nowSeconds: number): DraftErrors {
  return { ...validateBasics(draft), ...validateWhen(draft, nowSeconds), ...validateFiles(draft), ...validatePrice(draft), ...validatePayment(draft), ...validateEvidence(draft) };
}

export function withApproximateZone(draft: Draft, point: LatLng, random: () => number): Draft {
  return { ...draft, point, approx: approximateCenter(point, random) };
}

export function buildSpec(draft: Draft, nonce: string, nowSeconds: number = Math.floor(Date.now() / 1000)): Omit<Spec, "v"> & { v: 1 } {
  const spec: Omit<Spec, "v"> & { v: 1 } = {
    v: 1,
    title: draft.title.trim(),
    description: draft.description.trim(),
    category: draft.category ?? 0,
    modality: draft.modality,
    nonce,
    evidence: draft.useMilestones ? [] : draft.evidence.map((item) => item.trim()).filter(Boolean),
    attachments: draft.attachments,
  };
  if (draft.modality === "onsite" && draft.approx) spec.area = { lat: draft.approx.lat, lng: draft.approx.lng, radiusM: APPROX_RADIUS_M };
  if (draft.modality === "onsite" && draft.startsAt !== null) spec.startsAt = draft.startsAt;
  if (draft.modality === "remote" && draft.deadline !== null) spec.deadline = draft.deadline;
  if (draft.durationMin !== null) spec.durationMin = draft.durationMin;
  if (draft.useMilestones) {
    spec.milestones = draft.milestones.map((item, index): Milestone => ({
      name: item.name.trim(),
      amount: (milestoneAmounts(draft) as bigint[])[index]!.toString(),
      criteria: item.criteria.trim(),
      evidence: item.evidence.trim(),
    }));
    spec.materials = draft.materials;
  }
  if (draft.kind === "group") spec.group = { target: (totalAmount(draft) ?? 0n).toString(), fundingDeadline: groupDeadline(draft.fundingDays, nowSeconds) };
  return spec;
}

export const groupDeadline = (days: number, nowSeconds: number): number => nowSeconds + days * 86400;

export function setModality(draft: Draft, modality: Modality): Draft {
  if (modality === draft.modality) return draft;
  return { ...draft, modality, point: null, approx: null, startsAt: null, deadline: null };
}
