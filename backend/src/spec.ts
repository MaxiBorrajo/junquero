import { keccak256, toBytes, type Hex } from "viem";
import { roundCoordinate } from "./geo";

export const SPEC_VERSION = 1;
const MAX_CANONICAL_BYTES = 8192;
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
}

export type SpecResult = { ok: true; spec: Spec; canonical: string; hash: Hex } | { ok: false; error: string };

const ALLOWED_KEYS = new Set([
  "v", "title", "description", "category", "modality", "nonce", "area", "startsAt", "deadline", "durationMin", "evidence", "attachments",
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

  const canonical = canonicalize(spec);
  if (new TextEncoder().encode(canonical).length > MAX_CANONICAL_BYTES) return { ok: false, error: "spec is too large" };
  return { ok: true, spec, canonical, hash: keccak256(toBytes(canonical)) };
}
