import { getAddress, isHex, verifyTypedData, type Address, type Hex } from "viem";
import { escrowDomain } from "./agreements";
import { queueNotification } from "./notifications";

export const MIN_RELEASE_SECONDS = 60;
export const MAX_RELEASE_SECONDS = 7 * 24 * 3600;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;

export const releaseTypes = {
  Release: [
    { name: "orderId", type: "uint256" },
    { name: "payee", type: "address" },
    { name: "amount", type: "uint128" },
    { name: "rating", type: "uint8" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "expiry", type: "uint40" },
  ],
} as const;

export const milestoneReleaseTypes = {
  MilestoneRelease: [
    { name: "orderId", type: "uint256" },
    { name: "index", type: "uint8" },
    { name: "amount", type: "uint128" },
    { name: "rating", type: "uint8" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "expiry", type: "uint40" },
  ],
} as const;

export interface ReleaseInput {
  index: number | null;
  amount: string;
  rating: number;
  evidenceHash: Hex;
  expiry: number;
  signature: Hex;
}

export type ReleaseParse = { ok: true; value: ReleaseInput } | { ok: false; error: string };

export function parseRelease(body: unknown): ReleaseParse {
  if (typeof body !== "object" || body === null) return { ok: false, error: "body must be an object" };
  const raw = body as Record<string, unknown>;
  const index = raw.index === undefined || raw.index === null ? null : raw.index;
  if (index !== null && (!Number.isInteger(index) || (index as number) < 0 || (index as number) > 19)) return { ok: false, error: "invalid index" };
  if (typeof raw.amount !== "string" || !/^[1-9][0-9]{0,38}$/.test(raw.amount)) return { ok: false, error: "invalid amount" };
  if (!Number.isInteger(raw.rating) || (raw.rating as number) < 1 || (raw.rating as number) > 5) return { ok: false, error: "rating must be between 1 and 5" };
  if (typeof raw.evidenceHash !== "string" || !HEX32.test(raw.evidenceHash)) return { ok: false, error: "invalid evidenceHash" };
  if (!Number.isSafeInteger(raw.expiry)) return { ok: false, error: "invalid expiry" };
  if (typeof raw.signature !== "string" || !isHex(raw.signature)) return { ok: false, error: "invalid signature" };
  return { ok: true, value: { index: index as number | null, amount: raw.amount, rating: raw.rating as number, evidenceHash: raw.evidenceHash as Hex, expiry: raw.expiry as number, signature: raw.signature } };
}

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; status: 400 | 403 | 404 | 409; error: string };

interface Parties {
  payer: string | null;
  payee: string | null;
  status: string | null;
  price: string | null;
}

async function partiesOf(db: D1Database, orderId: number): Promise<Parties | null> {
  return db
    .prepare(
      `SELECT p.payer AS payer, p.payee AS payee, c.status AS status, c.amount AS price
       FROM order_parties p LEFT JOIN changas c ON c.order_id = p.order_id WHERE p.order_id = ?`,
    )
    .bind(orderId)
    .first<Parties>();
}

export async function submitRelease(db: D1Database, orderId: number, payer: string, input: ReleaseInput, nowSeconds: number): Promise<ActionResult> {
  const parties = await partiesOf(db, orderId);
  if (!parties || !parties.payee) return { ok: false, status: 404, error: "order not found" };
  if (parties.payer !== payer) return { ok: false, status: 403, error: "only who published can approve" };
  const milestone = input.index !== null;
  if (milestone ? parties.status !== "agreed" : parties.status !== "delivered") return { ok: false, status: 409, error: "the order is not waiting for approval" };
  if (input.expiry < nowSeconds + MIN_RELEASE_SECONDS || input.expiry > nowSeconds + MAX_RELEASE_SECONDS) return { ok: false, status: 400, error: "expiry out of range" };

  const valid = milestone
    ? await verifyTypedData({
        address: getAddress(payer),
        domain: escrowDomain,
        types: milestoneReleaseTypes,
        primaryType: "MilestoneRelease",
        message: { orderId: BigInt(orderId), index: input.index!, amount: BigInt(input.amount), rating: input.rating, evidenceHash: input.evidenceHash, expiry: input.expiry },
        signature: input.signature,
      }).catch(() => false)
    : await verifyTypedData({
        address: getAddress(payer),
        domain: escrowDomain,
        types: releaseTypes,
        primaryType: "Release",
        message: { orderId: BigInt(orderId), payee: getAddress(parties.payee) as Address, amount: BigInt(input.amount), rating: input.rating, evidenceHash: input.evidenceHash, expiry: input.expiry },
        signature: input.signature,
      }).catch(() => false);
  if (!valid) return { ok: false, status: 400, error: "invalid signature" };

  await db
    .prepare(
      `INSERT INTO releases (order_id, idx, payee, amount, rating, evidence_hash, expiry, signature, milestone, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(order_id, idx) DO UPDATE SET amount = excluded.amount, rating = excluded.rating, evidence_hash = excluded.evidence_hash,
         expiry = excluded.expiry, signature = excluded.signature, milestone = excluded.milestone, created_at = excluded.created_at`,
    )
    .bind(orderId, input.index ?? 0, parties.payee, input.amount, input.rating, input.evidenceHash.toLowerCase(), input.expiry, input.signature, milestone ? 1 : 0, nowSeconds)
    .run();
  await queueNotification(db, parties.payee, "release_ready", String(orderId), 0, nowSeconds).run();
  return { ok: true };
}

export interface ReleaseView {
  index: number | null;
  payee: string;
  amount: string;
  rating: number;
  evidenceHash: string;
  expiry: number;
  signature: string;
}

export async function readRelease(db: D1Database, orderId: number, address: string, nowSeconds: number): Promise<ActionResult<{ release: ReleaseView | null }>> {
  const parties = await partiesOf(db, orderId);
  if (!parties || (parties.payee !== address && parties.payer !== address)) return { ok: false, status: 404, error: "order not found" };
  const row = await db
    .prepare("SELECT idx, payee, amount, rating, evidence_hash, expiry, signature, milestone FROM releases WHERE order_id = ? AND expiry >= ? ORDER BY idx DESC LIMIT 1")
    .bind(orderId, nowSeconds)
    .first<{ idx: number; payee: string; amount: string; rating: number; evidence_hash: string; expiry: number; signature: string; milestone: number }>();
  if (!row) return { ok: true, release: null };
  return {
    ok: true,
    release: { index: row.milestone === 1 ? row.idx : null, payee: row.payee, amount: row.amount, rating: row.rating, evidenceHash: row.evidence_hash, expiry: row.expiry, signature: row.signature },
  };
}

export async function cancelRelease(db: D1Database, orderId: number, payer: string): Promise<ActionResult> {
  const parties = await partiesOf(db, orderId);
  if (!parties || parties.payer !== payer) return { ok: false, status: 404, error: "order not found" };
  await db.prepare("DELETE FROM releases WHERE order_id = ?").bind(orderId).run();
  return { ok: true };
}

export async function purgeReleases(db: D1Database, nowSeconds: number): Promise<void> {
  await db.prepare("DELETE FROM releases WHERE expiry < ?").bind(nowSeconds - 24 * 3600).run();
}
