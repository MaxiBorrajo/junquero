import { isAddress } from "viem";
import type { EventHandler, StreamEvent } from "./eventStream";

const parse = <T>(args: string | null): T | null => {
  if (!args) return null;
  try {
    return JSON.parse(args) as T;
  } catch {
    return null;
  }
};

// Anota cada comprobante reclamado para mostrarlo en el perfil de quien trabajó y en el detalle del trabajo.
export const receiptsHandler: EventHandler = (db: D1Database, events: StreamEvent[]) => {
  const statements: D1PreparedStatement[] = [];
  for (const event of events) {
    if (event.name !== "ReceiptClaimed" || event.order_id === null) continue;
    const args = parse<{ payee?: string; category?: string | number; month?: string | number }>(event.args);
    const category = Number(args?.category);
    const month = Number(args?.month);
    if (!args?.payee || !isAddress(args.payee) || !Number.isInteger(category) || !Number.isInteger(month)) continue;
    statements.push(db.prepare("INSERT OR IGNORE INTO receipts (order_id, payee, category, month) VALUES (?, ?, ?, ?)").bind(event.order_id, args.payee.toLowerCase(), category, month));
  }
  return statements;
};

export interface ReceiptView {
  orderId: number;
  category: number;
  month: number;
  // Nombre de la changa (el de la publicación, que ya es público) y cuándo se cerró y pagó.
  title: string;
  closedAt: number | null;
}

export const RECEIPTS_PAGE = 100;

// Los comprobantes de una persona, del trabajo cerrado más reciente al más antiguo.
export async function receiptsOf(db: D1Database, address: string, limit = RECEIPTS_PAGE): Promise<ReceiptView[]> {
  const { results } = await db
    .prepare(
      `SELECT r.order_id, r.category, r.month, json_extract(c.spec, '$.title') AS title,
              (SELECT MAX(e.block_timestamp) FROM events e WHERE e.order_id = r.order_id AND e.name = 'OrderSettled') AS closed_at
       FROM receipts r LEFT JOIN changas c ON c.order_id = r.order_id
       WHERE r.payee = ? ORDER BY r.order_id DESC LIMIT ?`,
    )
    .bind(address.toLowerCase(), limit)
    .all<{ order_id: number; category: number; month: number; title: string | null; closed_at: number | null }>();
  return results.map((row) => ({ orderId: row.order_id, category: row.category, month: row.month, title: row.title ?? "", closedAt: row.closed_at }));
}

export async function receiptsCount(db: D1Database, address: string): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS total FROM receipts WHERE payee = ?").bind(address.toLowerCase()).first<{ total: number }>();
  return row?.total ?? 0;
}

export interface Closing {
  ratings: { index: number | null; rating: number }[];
  receipt: { category: number; month: number } | null;
}

// Cómo se cerró un trabajo: la calificación (o las de cada hito) y si quien lo hizo reclamó su comprobante. Solo lo ven las dos partes.
export async function closingFor(db: D1Database, orderId: number, address: string): Promise<{ ok: true; closing: Closing } | { ok: false }> {
  const me = address.toLowerCase();
  const parties = await db.prepare("SELECT payer, payee FROM order_parties WHERE order_id = ?").bind(orderId).first<{ payer: string | null; payee: string | null }>();
  if (!parties || (parties.payer?.toLowerCase() !== me && parties.payee?.toLowerCase() !== me)) return { ok: false };
  const ratings = await db.prepare("SELECT idx, rating FROM payee_ratings WHERE order_id = ? ORDER BY idx").bind(orderId).all<{ idx: number; rating: number }>();
  const receipt = await db.prepare("SELECT category, month FROM receipts WHERE order_id = ?").bind(orderId).first<{ category: number; month: number }>();
  return {
    ok: true,
    closing: {
      ratings: ratings.results.map((row) => ({ index: row.idx < 0 ? null : row.idx, rating: row.rating })),
      receipt: receipt ?? null,
    },
  };
}
