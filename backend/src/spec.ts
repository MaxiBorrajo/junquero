import { keccak256, toBytes, type Hex } from "viem";
import { roundCoordinate } from "./geo";

export const SPEC_VERSION = 1;
const MAX_CANONICAL_BYTES = 16384;
const HEX32 = /^0x[0-9a-f]{64}$/;

export interface Area {
  lat: number;
  lng: number;
  radiusM: number;
}

export interface Attachment {
  hash: Hex;
  name: string;
  mime: string;
  size: number;
}

export interface Spec {
  v: number;
  title: string;
  description: string;
  category: number;
  modality: "onsite" | "remote";
  nonce: string;
  area?: Area;
  startsAt?: number;
  deadline?: number;
  durationMin?: number;
  evidence: string[];
  attachments: Attachment[];
  milestones?: Milestone[];
  materials?: Materials;
  group?: GroupPlan;
}

export type Materials = "payer" | "worker";
const MATERIALS = new Set<string>(["payer", "worker"]);

export interface Milestone {
  name: string;
  amount: string;
  criteria: string;
  evidence: string;
}

export interface GroupPlan {
  target: string;
  fundingDeadline: number;
}

export type SpecResult = { ok: true; spec: Spec; canonical: string; hash: Hex } | { ok: false; error: string };

const ALLOWED_KEYS = new Set([
  "v", "title", "description", "category", "modality", "nonce", "area", "startsAt", "deadline", "durationMin", "evidence", "attachments", "milestones", "materials", "group",
]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

const cleanText = (value: unknown, min: number, max: number): string | null => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length < min || text.length > max) return null;
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) ? null : text;
};

function parseArea(value: unknown): Area | string {
  if (!isObject(value)) return "area must be an object";
  const { lat, lng, radiusM } = value;
  if (typeof lat !== "number" || !(lat >= -90 && lat <= 90)) return "area.lat out of range";
  if (typeof lng !== "number" || !(lng >= -180 && lng <= 180)) return "area.lng out of range";
  if (!isInt(radiusM, 200, 2000)) return "area.radiusM must be between 200 and 2000";
  return { lat: roundCoordinate(lat), lng: roundCoordinate(lng), radiusM };
}

function parseAttachments(value: unknown): Attachment[] | string {
  if (!Array.isArray(value) || value.length > 10) return "attachments must be a list of at most 10";
  const parsed: Attachment[] = [];
  for (const item of value) {
    if (!isObject(item)) return "invalid attachment";
    const name = cleanText(item.name, 1, 120);
    const mime = cleanText(item.mime, 3, 100);
    const hash = typeof item.hash === "string" ? item.hash.toLowerCase() : "";
    if (!name || !mime || !HEX32.test(hash) || !isInt(item.size, 1, 100 * 1024 * 1024)) return "invalid attachment";
    parsed.push({ hash: hash as Hex, name, mime, size: item.size });
  }
  return parsed;
}

const AMOUNT = /^[1-9][0-9]{0,38}$/;
export const MIN_MILESTONES = 2;
export const MAX_MILESTONES = 20;

export function parseMilestones(value: unknown): Milestone[] | string {
  if (!Array.isArray(value) || value.length < MIN_MILESTONES || value.length > MAX_MILESTONES) return `milestones must be a list of ${MIN_MILESTONES} to ${MAX_MILESTONES}`;
  const parsed: Milestone[] = [];
  for (const item of value) {
    if (!isObject(item)) return "invalid milestone";
    const unknown = Object.keys(item).find((key) => !["name", "amount", "criteria", "evidence"].includes(key));
    if (unknown) return `unknown milestone field ${unknown}`;
    const name = cleanText(item.name, 2, 60);
    const criteria = cleanText(item.criteria, 3, 200);
    const evidence = cleanText(item.evidence, 3, 100);
    if (!name || !criteria || !evidence) return "every milestone needs a name, a criteria and the evidence asked";
    if (typeof item.amount !== "string" || !AMOUNT.test(item.amount)) return "milestone amount must be a positive integer in token units";
    parsed.push({ name, amount: item.amount, criteria, evidence });
  }
  return parsed;
}

function parseGroup(value: unknown, nowSeconds: number): GroupPlan | string {
  if (!isObject(value)) return "group must be an object";
  const unknown = Object.keys(value).find((key) => !["target", "fundingDeadline"].includes(key));
  if (unknown) return `unknown group field ${unknown}`;
  if (typeof value.target !== "string" || !AMOUNT.test(value.target)) return "group.target must be a positive integer in token units";
  if (!isInt(value.fundingDeadline, nowSeconds + 3600, nowSeconds + 365 * 24 * 3600)) return "group.fundingDeadline must be between 1 hour and 1 year from now";
  return { target: value.target, fundingDeadline: value.fundingDeadline };
}

export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (isObject(value)) {
    const entries = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function validateSpec(input: unknown, nowSeconds: number): SpecResult {
  if (!isObject(input)) return { ok: false, error: "spec must be an object" };
  const unknown = Object.keys(input).find((key) => !ALLOWED_KEYS.has(key));
  if (unknown) return { ok: false, error: `unknown field ${unknown}` };
  if (input.v !== SPEC_VERSION) return { ok: false, error: "unsupported spec version" };

  const title = cleanText(input.title, 3, 80);
  if (!title) return { ok: false, error: "title must have 3 to 80 characters" };
  const description = cleanText(input.description ?? "", 0, 2000);
  if (description === null) return { ok: false, error: "description must have at most 2000 characters" };
  if (!isInt(input.category, 0, 255)) return { ok: false, error: "category must be an integer between 0 and 255" };
  if (input.modality !== "onsite" && input.modality !== "remote") return { ok: false, error: "modality must be onsite or remote" };
  const nonce = cleanText(input.nonce, 8, 64);
  if (!nonce) return { ok: false, error: "nonce must have 8 to 64 characters" };

  const spec: Spec = {
    v: SPEC_VERSION,
    title,
    description,
    category: input.category,
    modality: input.modality,
    nonce,
    evidence: [],
    attachments: [],
  };

  if (input.modality === "onsite") {
    const area = parseArea(input.area);
    if (typeof area === "string") return { ok: false, error: area };
    spec.area = area;
  } else if (input.area !== undefined) {
    return { ok: false, error: "remote changas must not have an area" };
  }

  if (input.startsAt !== undefined) {
    if (!isInt(input.startsAt, nowSeconds, nowSeconds + 3 * 365 * 24 * 3600)) return { ok: false, error: "startsAt must be a future date" };
    spec.startsAt = input.startsAt;
  }
  if (input.deadline !== undefined) {
    if (!isInt(input.deadline, nowSeconds, nowSeconds + 3 * 365 * 24 * 3600)) return { ok: false, error: "deadline must be a future date" };
    if (spec.startsAt !== undefined && input.deadline <= spec.startsAt) return { ok: false, error: "deadline must be after startsAt" };
    spec.deadline = input.deadline;
  }
  if (input.durationMin !== undefined) {
    if (!isInt(input.durationMin, 1, 10080)) return { ok: false, error: "durationMin must be between 1 and 10080" };
    spec.durationMin = input.durationMin;
  }

  if (input.evidence !== undefined) {
    if (!Array.isArray(input.evidence) || input.evidence.length > 5) return { ok: false, error: "evidence must be a list of at most 5" };
    const items = input.evidence.map((item) => cleanText(item, 1, 120));
    if (items.some((item) => item === null)) return { ok: false, error: "invalid evidence item" };
    spec.evidence = items as string[];
  }
  if (input.attachments !== undefined) {
    const attachments = parseAttachments(input.attachments);
    if (typeof attachments === "string") return { ok: false, error: attachments };
    spec.attachments = attachments;
  }

  if (input.milestones !== undefined) {
    const milestones = parseMilestones(input.milestones);
    if (typeof milestones === "string") return { ok: false, error: milestones };
    spec.milestones = milestones;
  }
  if (input.materials !== undefined) {
    if (typeof input.materials !== "string" || !MATERIALS.has(input.materials)) return { ok: false, error: "materials must be payer or worker" };
    spec.materials = input.materials as Materials;
  }
  if (input.group !== undefined) {
    const group = parseGroup(input.group, nowSeconds);
    if (typeof group === "string") return { ok: false, error: group };
    if (spec.milestones && spec.milestones.reduce((sum, item) => sum + BigInt(item.amount), 0n) !== BigInt(group.target)) {
      return { ok: false, error: "milestones must add up to the group target" };
    }
    spec.group = group;
  }

  if (spec.milestones === undefined && spec.evidence.length === 0) return { ok: false, error: "ask for at least one closing evidence" };

  const canonical = canonicalize(spec);
  if (new TextEncoder().encode(canonical).length > MAX_CANONICAL_BYTES) return { ok: false, error: "spec is too large" };
  return { ok: true, spec, canonical, hash: keccak256(toBytes(canonical)) };
}
