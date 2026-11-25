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
  // Si el comprobante lo emitió quien publicó al calificar (true) o lo reclamó a mano quien trabajó (false, sin nota ni comentario).
  rated: boolean;
  rating: number | null;
  // Texto del comentario público, solo si coincide con la huella que quedó en el comprobante.
  comment: string | null;
  commentHash: string | null;
  // Nombre público de quien calificó (nunca su dirección).
  payerName: string | null;
  remote: boolean;
}

export const RECEIPTS_PAGE = 100;

// Los comprobantes de una persona, del trabajo cerrado más reciente al más antiguo.
export async function receiptsOf(db: D1Database, address: string, limit = RECEIPTS_PAGE): Promise<ReceiptView[]> {
  const { results } = await db
    .prepare(
      `SELECT r.order_id, r.category, r.month, json_extract(c.spec, '$.title') AS title, c.modality AS modality,
              (SELECT MAX(e.block_timestamp) FROM events e WHERE e.order_id = r.order_id AND e.name = 'OrderSettled') AS closed_at,
              (SELECT json_extract(m.args, '$.rating') FROM events m WHERE m.order_id = r.order_id AND m.name = 'ReceiptMinted' LIMIT 1) AS rating,
              (SELECT json_extract(m.args, '$.commentHash') FROM events m WHERE m.order_id = r.order_id AND m.name = 'ReceiptMinted' LIMIT 1) AS comment_hash,
              (SELECT p.name FROM events m JOIN profiles p ON p.address = lower(json_extract(m.args, '$.payer'))
                 WHERE m.order_id = r.order_id AND m.name = 'ReceiptMinted' LIMIT 1) AS payer_name,
              (SELECT k.text FROM rating_comments k WHERE k.order_id = r.order_id) AS comment_text,
              (SELECT k.hash FROM rating_comments k WHERE k.order_id = r.order_id) AS comment_text_hash
       FROM receipts r LEFT JOIN changas c ON c.order_id = r.order_id
       WHERE r.payee = ? ORDER BY r.order_id DESC LIMIT ?`,
    )
    .bind(address.toLowerCase(), limit)
    .all<{
      order_id: number;
      category: number;
      month: number;
      title: string | null;
      modality: string | null;
      closed_at: number | null;
      rating: number | string | null;
      comment_hash: string | null;
      payer_name: string | null;
      comment_text: string | null;
      comment_text_hash: string | null;
    }>();
  const zero = `0x${"0".repeat(64)}`;
  return results.map((row) => {
    const onChain = row.comment_hash ? row.comment_hash.toLowerCase() : null;
    const matches = onChain !== null && onChain !== zero && row.comment_text_hash !== null && row.comment_text_hash.toLowerCase() === onChain;
    return {
      orderId: row.order_id,
      category: row.category,
      month: row.month,
      title: row.title ?? "",
      closedAt: row.closed_at,
      rated: row.rating !== null,
      rating: row.rating === null ? null : Number(row.rating),
      comment: matches ? row.comment_text : null,
      commentHash: onChain === null || onChain === zero ? null : onChain,
      payerName: row.payer_name,
      remote: row.modality === "remote",
    };
  });
}

export async function receiptsCount(db: D1Database, address: string): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS total FROM receipts WHERE payee = ?").bind(address.toLowerCase()).first<{ total: number }>();
  return row?.total ?? 0;
}

export interface Closing {
  ratings: { index: number | null; rating: number }[];
  receipt: { category: number; month: number } | null;
  // El trabajo se cerró con un reclamo chico (reparto 50/50 sin jurado): no da comprobante.
  smallDispute: boolean;
  // Cómo se resolvió el reclamo que cerró el trabajo, si lo hubo: qué parte del pago fue a quien hizo el trabajo (0 a 10000) y si
  // se resolvió porque quien debía responder no lo hizo a tiempo.
  dispute: { payeeShareBps: number; byDefault: boolean } | null;
}

// Cómo se cerró un trabajo: la calificación (o las de cada hito) y si quien lo hizo reclamó su comprobante. Solo lo ven las dos partes.
export async function closingFor(db: D1Database, orderId: number, address: string): Promise<{ ok: true; closing: Closing } | { ok: false }> {
  const me = address.toLowerCase();
  const parties = await db.prepare("SELECT payer, payee FROM order_parties WHERE order_id = ?").bind(orderId).first<{ payer: string | null; payee: string | null }>();
  if (!parties || (parties.payer?.toLowerCase() !== me && parties.payee?.toLowerCase() !== me)) return { ok: false };
  const ratings = await db.prepare("SELECT idx, rating FROM payee_ratings WHERE order_id = ? ORDER BY idx").bind(orderId).all<{ idx: number; rating: number }>();
  const receipt = await db.prepare("SELECT category, month FROM receipts WHERE order_id = ?").bind(orderId).first<{ category: number; month: number }>();
  // Solo cuenta el reclamo chico que cerró el trabajo: en una changa sin hitos, cualquiera; en una con hitos, el del último, que
  // se reconoce porque cierra la changa en la misma transacción (OrderSettled). Un reclamo chico en un hito intermedio no quita el comprobante.
  const small = await db
    .prepare(
      `SELECT 1 AS found FROM events d
       WHERE d.order_id = ?1 AND d.name = 'DisputeOpened' AND CAST(json_extract(d.args, '$.caseId') AS INTEGER) = 0
         AND (NOT EXISTS (SELECT 1 FROM events m WHERE m.order_id = d.order_id AND m.name = 'MilestonesAgreed')
              OR EXISTS (SELECT 1 FROM events s WHERE s.order_id = d.order_id AND s.name = 'OrderSettled' AND s.tx_hash = d.tx_hash))
       LIMIT 1`,
    )
    .bind(orderId)
    .first<{ found: number }>();
  const resolved = await db
    .prepare(
      `SELECT json_extract(d.args, '$.payeeShareBps') AS share,
              EXISTS (SELECT 1 FROM events x WHERE x.name = 'ResolvedByDefault' AND x.tx_hash = d.tx_hash) AS by_default
       FROM events d
       WHERE d.order_id = ?1 AND d.name = 'DisputeResolved'
         AND (NOT EXISTS (SELECT 1 FROM events m WHERE m.order_id = d.order_id AND m.name = 'MilestonesAgreed')
              OR EXISTS (SELECT 1 FROM events s WHERE s.order_id = d.order_id AND s.name = 'OrderSettled' AND s.tx_hash = d.tx_hash))
       ORDER BY d.block_number DESC, d.log_index DESC LIMIT 1`,
    )
    .bind(orderId)
    .first<{ share: number | string | null; by_default: number }>();
  return {
    ok: true,
    closing: {
      smallDispute: small !== null,
      dispute: resolved && resolved.share !== null ? { payeeShareBps: Number(resolved.share), byDefault: resolved.by_default === 1 } : null,
      ratings: ratings.results.map((row) => ({ index: row.idx < 0 ? null : row.idx, rating: row.rating })),
      receipt: receipt ?? null,
    },
  };
}
