import { keccak256, toBytes } from "viem";
import { detectContact } from "../../app/src/lib/contactGuard";
import { DEFAULT_STYLE, receiptCardSvg, WEB_FONTS, type CardData } from "../../app/src/receipts/cardSvg";

export const COMMENT_MAX = 280;
export const RUBROS = ["Hogar", "Jardín", "Mudanzas", "Limpieza", "Oficios", "Tecnología", "Diseño", "Traducción", "Otros"] as const;
const ZERO_HASH = `0x${"0".repeat(64)}`;

type Failure = { ok: false; status: 400 | 403 | 404; error: string };

// Año y mes (aaaamm, UTC) de un instante: la misma regla que usa el contrato para el mes del comprobante.
export function monthOfTimestamp(seconds: number): number {
  const date = new Date(seconds * 1000);
  return date.getUTCFullYear() * 100 + date.getUTCMonth() + 1;
}

export function validateComment(body: unknown): { ok: true; text: string } | Failure {
  if (typeof body !== "object" || body === null) return { ok: false, status: 400, error: "invalid body" };
  const { text } = body as { text?: unknown };
  if (typeof text !== "string") return { ok: false, status: 400, error: "text required" };
  const clean = text.trim();
  if (clean.length < 1 || clean.length > COMMENT_MAX) return { ok: false, status: 400, error: `text must have between 1 and ${COMMENT_MAX} characters` };
  // El comentario es público: no puede traer teléfonos, mails ni enlaces (la misma regla que el chat antes del acuerdo).
  if (detectContact(clean)) return { ok: false, status: 400, error: "contact data not allowed" };
  return { ok: true, text: clean };
}

// Guarda el comentario con el que quien publicó acompaña su nota. Se manda antes de firmar la liberación: la huella va dentro de la firma y
// después se verifica contra el comprobante emitido. Solo lo puede mandar quien publicó la orden.
export async function saveRatingComment(db: D1Database, orderId: number, caller: string, text: string, nowSeconds: number): Promise<{ ok: true; hash: string } | Failure> {
  const parties = await db.prepare("SELECT payer FROM order_parties WHERE order_id = ?").bind(orderId).first<{ payer: string | null }>();
  if (!parties) return { ok: false, status: 404, error: "order not found" };
  if (!parties.payer || parties.payer.toLowerCase() !== caller.toLowerCase()) return { ok: false, status: 403, error: "only who published can comment" };
  const hash = keccak256(toBytes(text));
  await db
    .prepare(
      `INSERT INTO rating_comments (order_id, payer, hash, text, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(order_id) DO UPDATE SET payer = excluded.payer, hash = excluded.hash, text = excluded.text, created_at = excluded.created_at`,
    )
    .bind(orderId, caller.toLowerCase(), hash, text, nowSeconds)
    .run();
  return { ok: true, hash };
}

export interface ReceiptMeta {
  card: CardData;
  title: string;
  comment: string | null;
}

interface MintedRow {
  args: string;
  block_timestamp: number;
  spec: string | null;
  category: number | null;
  modality: string | null;
  month: number | null;
  payer_name: string | null;
  comment_text: string | null;
  comment_hash: string | null;
}

// Todo lo que muestra el comprobante de una orden, o null si todavía no se emitió (no hay evento ReceiptMinted). Lo único que sale de la
// cadena es la nota, la huella del comentario y la ficha; el texto, el título y el nombre son los públicos del servidor.
export async function receiptMeta(db: D1Database, orderId: number): Promise<ReceiptMeta | null> {
  const row = await db
    .prepare(
      `SELECT m.args AS args, m.block_timestamp AS block_timestamp, c.spec AS spec, c.category AS category, c.modality AS modality,
              (SELECT r.month FROM receipts r WHERE r.order_id = m.order_id) AS month,
              (SELECT p.name FROM profiles p WHERE p.address = lower(json_extract(m.args, '$.payer'))) AS payer_name,
              k.text AS comment_text, k.hash AS comment_hash
       FROM events m
       LEFT JOIN changas c ON c.order_id = m.order_id OR lower(c.spec_hash) = lower(json_extract(m.args, '$.specHash'))
       LEFT JOIN rating_comments k ON k.order_id = m.order_id
       WHERE m.order_id = ? AND m.name = 'ReceiptMinted'
       ORDER BY m.block_number DESC, m.log_index DESC LIMIT 1`,
    )
    .bind(orderId)
    .first<MintedRow>();
  if (!row) return null;
  const args = JSON.parse(row.args) as { rating?: string | number; commentHash?: string };
  const rating = Number(args.rating);
  let title = "";
  try {
    title = row.spec ? ((JSON.parse(row.spec) as { title?: string }).title ?? "") : "";
  } catch {
    title = "";
  }
  const onChain = (args.commentHash ?? ZERO_HASH).toLowerCase();
  // El texto solo se muestra si coincide con la huella que firmó quien publicó y quedó en el comprobante.
  const comment = row.comment_text && row.comment_hash && onChain !== ZERO_HASH && row.comment_hash.toLowerCase() === onChain ? row.comment_text : null;
  const category = row.category ?? 8;
  return {
    title,
    comment,
    card: {
      orderId,
      title: title || "Changa",
      category,
      categoryName: RUBROS[category] ?? "Otros",
      remote: row.modality === "remote",
      rating: Number.isFinite(rating) ? rating : 0,
      month: row.month ?? monthOfTimestamp(row.block_timestamp),
      payerName: row.payer_name,
    },
  };
}

export const receiptSvg = (meta: ReceiptMeta): string => receiptCardSvg(meta.card, DEFAULT_STYLE, WEB_FONTS);

// Los datos del comprobante en el formato que leen las billeteras y los mercados de NFT (ERC-721). No lleva el monto.
export function receiptJson(meta: ReceiptMeta, origin: string) {
  const { card } = meta;
  const attributes: { trait_type: string; value: string | number }[] = [
    { trait_type: "Rubro", value: card.categoryName },
    { trait_type: "Mes", value: card.month },
    { trait_type: "Nota", value: card.rating },
    { trait_type: "Modalidad", value: card.remote ? "A distancia" : "Presencial" },
  ];
  if (meta.comment) attributes.push({ trait_type: "Comentario", value: meta.comment });
  return {
    name: `Comprobante: ${meta.title || "Changa"}`,
    description: "Comprobante intransferible de un trabajo cerrado en Junquero con pago protegido. Lo emite quien publicó el trabajo al calificarlo.",
    image: `${origin}/receipts/${card.orderId}.svg`,
    attributes,
  };
}

