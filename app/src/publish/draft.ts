import type { Attachment, Spec } from "../api/types";
import { approximateCenter, type LatLng } from "../lib/geo";
import { toMicro } from "../lib/money";

export const MIN_AMOUNT_MICRO = 1_000_000n;
export const MIN_LEAD_SECONDS = 3600;
export const APPROX_RADIUS_M = 300;
export const TITLE_MIN = 3;
export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 2000;
export const EVIDENCE_MAX = 5;
export const EVIDENCE_LENGTH = 120;
export const ATTACHMENTS_MAX = 10;

export type Modality = "onsite" | "remote";

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
});

export type StepKey = "basics" | "when" | "files" | "price";
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

export function validatePrice(draft: Draft): DraftErrors {
  const errors: DraftErrors = {};
  const amount = parseAmount(draft.amount);
  if (amount === null) errors.amount = "amount";
  else if (amount < MIN_AMOUNT_MICRO) errors.amount = "amountMin";
  const evidence = draft.evidence.map((item) => item.trim()).filter(Boolean);
  if (evidence.length > EVIDENCE_MAX || evidence.some((item) => item.length > EVIDENCE_LENGTH)) errors.evidence = "evidence";
  return errors;
}

export function validateAll(draft: Draft, nowSeconds: number): DraftErrors {
  return { ...validateBasics(draft), ...validateWhen(draft, nowSeconds), ...validateFiles(draft), ...validatePrice(draft) };
}

export function withApproximateZone(draft: Draft, point: LatLng, random: () => number): Draft {
  return { ...draft, point, approx: approximateCenter(point, random) };
}

export function buildSpec(draft: Draft, nonce: string): Omit<Spec, "v"> & { v: 1 } {
  const spec: Omit<Spec, "v"> & { v: 1 } = {
    v: 1,
    title: draft.title.trim(),
    description: draft.description.trim(),
    category: draft.category ?? 0,
    modality: draft.modality,
    nonce,
    evidence: draft.evidence.map((item) => item.trim()).filter(Boolean),
    attachments: draft.attachments,
  };
  if (draft.modality === "onsite" && draft.approx) spec.area = { lat: draft.approx.lat, lng: draft.approx.lng, radiusM: APPROX_RADIUS_M };
  if (draft.modality === "onsite" && draft.startsAt !== null) spec.startsAt = draft.startsAt;
  if (draft.modality === "remote" && draft.deadline !== null) spec.deadline = draft.deadline;
  if (draft.durationMin !== null) spec.durationMin = draft.durationMin;
  return spec;
}

export function dayOptions(now: Date, count: number): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < count; i += 1) days.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i));
  return days;
}

export function atTime(day: Date, hour: number, minute = 0): number {
  return Math.floor(new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime() / 1000);
}

export function setModality(draft: Draft, modality: Modality): Draft {
  if (modality === draft.modality) return draft;
  return { ...draft, modality, point: null, approx: null, startsAt: null, deadline: null };
}
