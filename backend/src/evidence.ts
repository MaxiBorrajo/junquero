import { recoverMessageAddress } from "viem";
import { buildEvidenceMessage } from "./auth";

export const EVIDENCE_STATUSES = new Set(["agreed", "delivered", "disputed"]);
export const MAX_ITEMS_PER_UPLOADER = 15;
export const MAX_META_CHARS = 2048;
export const MAX_WRAPPED_CHARS = 512;
export const KINDS = new Set(["photo", "video", "document"]);
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
const HEX32 = /^[0-9a-f]{64}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;

export type Role = "payer" | "payee" | "juror";

export interface EvidenceAccess {
  orderId: number;
  role: Role;
  status: string;
  payer: string | null;
  payee: string | null;
}

export type AccessResult = { ok: true; access: EvidenceAccess } | { ok: false; status: 403 | 404; error: string };

export async function resolveEvidenceAccess(db: D1Database, orderId: number, address: string): Promise<AccessResult> {
  const order = await db
    .prepare(
      `SELECT p.payer AS payer, p.payee AS payee, c.status AS status
       FROM order_parties p LEFT JOIN changas c ON c.order_id = p.order_id WHERE p.order_id = ?`,
    )
    .bind(orderId)
    .first<{ payer: string | null; payee: string | null; status: string | null }>();
  if (!order) return { ok: false, status: 404, error: "order not found" };
  const base = { orderId, status: order.status ?? "", payer: order.payer, payee: order.payee };
  if (address === order.payer) return { ok: true, access: { ...base, role: "payer" } };
  if (address === order.payee) return { ok: true, access: { ...base, role: "payee" } };

  const juror = await db
    .prepare(
      `SELECT 1 AS found FROM case_jurors j JOIN order_cases o ON o.case_id = j.case_id
       WHERE o.order_id = ? AND j.juror = ? LIMIT 1`,
    )
    .bind(orderId, address)
    .first();
  if (juror) return { ok: true, access: { ...base, role: "juror" } };
  return { ok: false, status: 403, error: "not allowed to see this order's evidence" };
}

export interface EvidenceInput {
  hash: string;
  kind: string;
  meta: string;
  signature: string;
}

export type EvidenceParse = { ok: true; value: EvidenceInput } | { ok: false; error: string };

export function parseEvidence(body: unknown): EvidenceParse {
  if (typeof body !== "object" || body === null) return { ok: false, error: "body must be an object" };
  const raw = body as Record<string, unknown>;
  const hash = typeof raw.hash === "string" ? raw.hash.toLowerCase() : "";
  if (!HEX32.test(hash)) return { ok: false, error: "hash must be the sha256 of the uploaded file" };
  if (typeof raw.kind !== "string" || !KINDS.has(raw.kind)) return { ok: false, error: "kind must be photo, video or document" };
  if (typeof raw.meta !== "string" || raw.meta.length < 8 || raw.meta.length > MAX_META_CHARS || !BASE64.test(raw.meta)) {
    return { ok: false, error: "meta must be base64 of at most 2048 characters" };
  }
  if (typeof raw.signature !== "string" || !SIGNATURE.test(raw.signature)) return { ok: false, error: "invalid signature" };
  return { ok: true, value: { hash, kind: raw.kind, meta: raw.meta, signature: raw.signature } };
}

export async function metaDigest(meta: string): Promise<string> {
  const bytes = new TextEncoder().encode(meta);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signerOf(orderId: number, input: EvidenceInput): Promise<string | null> {
  try {
    const signer = await recoverMessageAddress({
      message: buildEvidenceMessage(orderId, input.hash, await metaDigest(input.meta)),
      signature: input.signature as `0x${string}`,
    });
    return signer.toLowerCase();
  } catch {
    return null;
  }
}

export type RegisterOutcome =
  | { ok: true; created: boolean }
  | { ok: false; status: 400 | 403 | 404 | 409 | 429; error: string };

export async function registerEvidence(
  db: D1Database,
  orderId: number,
  uploader: string,
  input: EvidenceInput,
  access: EvidenceAccess,
  nowSeconds: number,
): Promise<RegisterOutcome> {
  if (access.role === "juror") return { ok: false, status: 403, error: "jurors cannot upload evidence" };
  if (!EVIDENCE_STATUSES.has(access.status)) return { ok: false, status: 409, error: "the order does not accept evidence in its current state" };
  if ((await signerOf(orderId, input)) !== uploader) return { ok: false, status: 400, error: "signature does not match your wallet" };

  const file = await db
    .prepare("SELECT size FROM files WHERE owner = ? AND hash = ? AND kind = 'evidence'")
    .bind(uploader, input.hash)
    .first<{ size: number }>();
  if (!file) return { ok: false, status: 404, error: "upload the encrypted file first" };

  const existing = await db.prepare("SELECT uploader FROM evidence WHERE order_id = ? AND hash = ?").bind(orderId, input.hash).first<{ uploader: string }>();
  if (existing) return existing.uploader === uploader ? { ok: true, created: false } : { ok: false, status: 409, error: "hash already registered" };

  const count = await db
    .prepare("SELECT COUNT(*) AS total FROM evidence WHERE order_id = ? AND uploader = ?")
    .bind(orderId, uploader)
    .first<{ total: number }>();
  if ((count?.total ?? 0) >= MAX_ITEMS_PER_UPLOADER) return { ok: false, status: 429, error: "too many evidence items for this order" };

  await db.batch([
    db
      .prepare("INSERT INTO evidence (order_id, hash, uploader, kind, meta, signature, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(orderId, input.hash, uploader, input.kind, input.meta, input.signature, file.size, nowSeconds),
    db.prepare("UPDATE files SET linked = 1 WHERE owner = ? AND hash = ?").bind(uploader, input.hash),
  ]);
  return { ok: true, created: true };
}

interface EvidenceRow {
  hash: string;
  uploader: string;
  kind: string;
  meta: string;
  signature: string;
  size: number;
  created_at: number;
  wrapped: string | null;
}

export async function listEvidence(db: D1Database, orderId: number, address: string, access: EvidenceAccess) {
  const { results } = await db
    .prepare(
      `SELECT e.hash AS hash, e.uploader AS uploader, e.kind AS kind, e.meta AS meta, e.signature AS signature,
              e.size AS size, e.created_at AS created_at, k.wrapped AS wrapped
       FROM evidence e LEFT JOIN evidence_keys k
         ON k.order_id = e.order_id AND k.hash = e.hash AND k.recipient = ?
       WHERE e.order_id = ? ORDER BY e.created_at, e.hash`,
    )
    .bind(address, orderId)
    .all<EvidenceRow>();
  return results
    .filter((row) => access.role !== "juror" || row.wrapped !== null)
    .map((row) => ({
      hash: row.hash,
      uploader: row.uploader,
      kind: row.kind,
      meta: row.meta,
      signature: row.signature,
      size: row.size,
      createdAt: row.created_at,
      wrappedKey: row.wrapped,
    }));
}

export async function canDownload(db: D1Database, orderId: number, hash: string, address: string, access: EvidenceAccess) {
  const item = await db.prepare("SELECT uploader FROM evidence WHERE order_id = ? AND hash = ?").bind(orderId, hash).first<{ uploader: string }>();
  if (!item) return null;
  if (access.role !== "juror") return item;
  const key = await db
    .prepare("SELECT 1 AS found FROM evidence_keys WHERE order_id = ? AND hash = ? AND recipient = ?")
    .bind(orderId, hash, address)
    .first();
  return key ? item : null;
}

export type KeyOutcome = { ok: true } | { ok: false; status: 400 | 403 | 404; error: string };

export async function shareKey(
  db: D1Database,
  orderId: number,
  hash: string,
  sharer: string,
  access: EvidenceAccess,
  body: unknown,
  nowSeconds: number,
): Promise<KeyOutcome> {
  if (access.role === "juror") return { ok: false, status: 403, error: "jurors cannot share keys" };
  const raw = (body ?? {}) as { recipient?: unknown; wrapped?: unknown };
  const recipient = typeof raw.recipient === "string" ? raw.recipient.toLowerCase() : "";
  if (!/^0x[0-9a-f]{40}$/.test(recipient)) return { ok: false, status: 400, error: "invalid recipient" };
  if (typeof raw.wrapped !== "string" || raw.wrapped.length < 8 || raw.wrapped.length > MAX_WRAPPED_CHARS || !BASE64.test(raw.wrapped)) {
    return { ok: false, status: 400, error: "wrapped must be base64 of at most 512 characters" };
  }
  const item = await db.prepare("SELECT 1 AS found FROM evidence WHERE order_id = ? AND hash = ?").bind(orderId, hash).first();
  if (!item) return { ok: false, status: 404, error: "evidence not found" };

  const other = sharer === access.payer ? access.payee : access.payer;
  const isParty = recipient === other || recipient === sharer;
  const isJuror = isParty
    ? false
    : Boolean(
        await db
          .prepare(
            `SELECT 1 AS found FROM case_jurors j JOIN order_cases o ON o.case_id = j.case_id
             WHERE o.order_id = ? AND j.juror = ? LIMIT 1`,
          )
          .bind(orderId, recipient)
          .first(),
      );
  if (!isParty && !isJuror) return { ok: false, status: 403, error: "the recipient is not the other party or a juror of this order" };

  await db
    .prepare(
      `INSERT INTO evidence_keys (order_id, hash, recipient, wrapped, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(order_id, hash, recipient) DO UPDATE SET wrapped = excluded.wrapped, created_at = excluded.created_at`,
    )
    .bind(orderId, hash, recipient, raw.wrapped, nowSeconds)
    .run();
  return { ok: true };
}
