import type { EventHandler, StreamEvent } from "./eventStream";
import { cellOf, toMilli } from "./geo";
import type { Spec } from "./spec";
import type { Hex } from "viem";

export const MAX_DRAFTS = 20;
export const DRAFT_TTL_SECONDS = 24 * 3600;
const DEFAULT_DECIMALS = 6;

const STATUS_BY_EVENT: Record<string, string> = {
  OrderReserved: "reserved",
  ReservationWithdrawn: "open",
  OrderAgreed: "agreed",
  OrderDelivered: "delivered",
  OrderSettled: "settled",
  OrderCancelled: "cancelled",
  OrderTerminated: "settled",
  DisputeOpened: "disputed",
  DisputeResolved: "settled",
  OrderAbandoned: "open",
};

export interface ChangaRow {
  id: number;
  owner: string;
  spec_hash: string;
  spec: string;
  order_id: number | null;
  token: string | null;
  amount: string | null;
  status: string;
  created_at: number;
}

export interface ListFilters {
  bbox?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  remote: boolean;
  category?: number;
  minAmountMicro?: number;
  maxAmountMicro?: number;
  before?: number;
  limit: number;
}

export function amountMicro(amount: string, decimals: number): number {
  const extra = decimals - DEFAULT_DECIMALS;
  const value = BigInt(amount);
  const micro = extra > 0 ? value / 10n ** BigInt(extra) : value * 10n ** BigInt(-extra);
  return micro > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(micro);
}

export const presentChanga = (row: ChangaRow) => ({
  id: row.id,
  owner: row.owner,
  specHash: row.spec_hash,
  spec: JSON.parse(row.spec) as Spec,
  orderId: row.order_id,
  token: row.token,
  amount: row.amount,
  status: row.status,
  createdAt: row.created_at,
});

export async function saveDraft(
  db: D1Database,
  owner: string,
  spec: Spec,
  canonical: string,
  hash: Hex,
  nowSeconds: number,
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const existing = await db
    .prepare("SELECT id FROM changas WHERE owner = ? AND spec_hash = ?")
    .bind(owner, hash)
    .first();
  if (existing) return { ok: true, created: false };

  const pending = await db
    .prepare("SELECT COUNT(*) AS total FROM changas WHERE owner = ? AND order_id IS NULL AND created_at > ?")
    .bind(owner, nowSeconds - DRAFT_TTL_SECONDS)
    .first<{ total: number }>();
  if ((pending?.total ?? 0) >= MAX_DRAFTS) return { ok: false, error: "too many unpublished drafts" };

  const lat = spec.area ? toMilli(spec.area.lat) : null;
  const lng = spec.area ? toMilli(spec.area.lng) : null;
  await db
    .prepare(
      `INSERT INTO changas (owner, spec_hash, spec, category, modality, lat_e3, lng_e3, cell_lat, cell_lng, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      owner,
      hash,
      canonical,
      spec.category,
      spec.modality,
      lat,
      lng,
      lat === null ? null : cellOf(lat),
      lng === null ? null : cellOf(lng),
      nowSeconds,
    )
    .run();
  return { ok: true, created: true };
}

export async function listOpen(db: D1Database, filters: ListFilters): Promise<ChangaRow[]> {
  const where = ["status = 'open'", "hidden = 0"];
  const values: (string | number)[] = [];
  if (filters.remote) {
    where.push("modality = 'remote'");
  } else if (filters.bbox) {
    const minLat = toMilli(filters.bbox.minLat);
    const maxLat = toMilli(filters.bbox.maxLat);
    const minLng = toMilli(filters.bbox.minLng);
    const maxLng = toMilli(filters.bbox.maxLng);
    where.push("cell_lat BETWEEN ? AND ?", "cell_lng BETWEEN ? AND ?", "lat_e3 BETWEEN ? AND ?", "lng_e3 BETWEEN ? AND ?");
    values.push(cellOf(minLat), cellOf(maxLat), cellOf(minLng), cellOf(maxLng), minLat, maxLat, minLng, maxLng);
  }
  if (filters.category !== undefined) {
    where.push("category = ?");
    values.push(filters.category);
  }
  if (filters.minAmountMicro !== undefined) {
    where.push("amount_micro >= ?");
    values.push(filters.minAmountMicro);
  }
  if (filters.maxAmountMicro !== undefined) {
    where.push("amount_micro <= ?");
    values.push(filters.maxAmountMicro);
  }
  if (filters.before !== undefined) {
    where.push("id < ?");
    values.push(filters.before);
  }
  const { results } = await db
    .prepare(
      `SELECT id, owner, spec_hash, spec, order_id, token, amount, status, created_at
       FROM changas WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ?`,
    )
    .bind(...values, filters.limit)
    .all<ChangaRow>();
  return results;
}

export async function getPublished(db: D1Database, specHash: string): Promise<ChangaRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, owner, spec_hash, spec, order_id, token, amount, status, created_at
       FROM changas WHERE spec_hash = ? AND order_id IS NOT NULL AND hidden = 0 ORDER BY id DESC LIMIT 5`,
    )
    .bind(specHash)
    .all<ChangaRow>();
  return results;
}

export async function listByOwner(db: D1Database, owner: string, limit: number): Promise<ChangaRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, owner, spec_hash, spec, order_id, token, amount, status, created_at
       FROM changas WHERE owner = ? ORDER BY id DESC LIMIT ?`,
    )
    .bind(owner, limit)
    .all<ChangaRow>();
  return results;
}

interface CreatedArgs {
  payer?: string;
  token?: string;
  amount?: string;
  specHash?: string;
}

export function createChangasHandler(decimalsByToken: ReadonlyMap<string, number>): EventHandler {
  const [groupToken, groupDecimals] = [...decimalsByToken.entries()][0] ?? ["", DEFAULT_DECIMALS];
  return (db: D1Database, events: StreamEvent[]) => {
    const statements: D1PreparedStatement[] = [];
    for (const event of events) {
      if (event.order_id === null) continue;
      if (event.name === "OrderCreated" && event.args) {
        const args = JSON.parse(event.args) as CreatedArgs;
        if (!args.payer || !args.specHash || !args.token || !args.amount) continue;
        const decimals = decimalsByToken.get(args.token.toLowerCase()) ?? DEFAULT_DECIMALS;
        statements.push(
          db
            .prepare(
              `UPDATE changas SET order_id = ?, token = ?, amount = ?, amount_micro = ?, status = 'open'
               WHERE owner = ? AND spec_hash = ? AND order_id IS NULL`,
            )
            .bind(
              event.order_id,
              args.token.toLowerCase(),
              args.amount,
              amountMicro(args.amount, decimals),
              args.payer.toLowerCase(),
              args.specHash.toLowerCase(),
            ),
        );
        continue;
      }
      if (event.name === "GroupCreated" && event.args) {
        const args = JSON.parse(event.args) as { creator?: string; target?: string; deadline?: string | number };
        if (!args.creator || !args.target || args.deadline === undefined) continue;
        statements.push(
          db
            .prepare(
              `UPDATE changas SET order_id = ?, token = ?, amount = ?, amount_micro = ?, status = 'funding'
               WHERE owner = ? AND order_id IS NULL AND json_extract(spec, '$.group.target') = ?
                 AND json_extract(spec, '$.group.fundingDeadline') = ?`,
            )
            .bind(event.order_id, groupToken, args.target, amountMicro(args.target, groupDecimals), args.creator.toLowerCase(), args.target, Number(args.deadline)),
        );
        continue;
      }
      if (event.name === "FundingCompleted") {
        statements.push(db.prepare("UPDATE changas SET status = 'open' WHERE order_id = ? AND status = 'funding'").bind(event.order_id));
        continue;
      }
      if (event.name === "ContributionWithdrawn") {
        statements.push(db.prepare("UPDATE changas SET status = 'funding' WHERE order_id = ? AND status = 'open'").bind(event.order_id));
        continue;
      }
      if (event.name === "FundingRefunded") {
        statements.push(db.prepare("UPDATE changas SET status = 'cancelled' WHERE order_id = ?").bind(event.order_id));
        continue;
      }
      const status = STATUS_BY_EVENT[event.name];
      if (status) statements.push(db.prepare("UPDATE changas SET status = ? WHERE order_id = ?").bind(status, event.order_id));
    }
    return statements;
  };
}

export async function purgeStaleDrafts(db: D1Database, nowSeconds: number): Promise<void> {
  await db
    .prepare("DELETE FROM changas WHERE order_id IS NULL AND created_at < ?")
    .bind(nowSeconds - DRAFT_TTL_SECONDS)
    .run();
}
