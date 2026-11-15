import { isAddress } from "viem";
import type { EventHandler, StreamEvent } from "./eventStream";

export type ChatEventKind =
  | "proposed" | "accepted" | "rejected" | "cancelled" | "expired"
  | "applied" | "withdrawn" | "dismissed"
  | "agreed" | "checkedin" | "delivered" | "settled"
  | "evidence" | "approved" | "review_extended" | "changes_requested"
  | "topped_up" | "order_cancelled" | "dispute_opened" | "dispute_resolved"
  | "milestone_delivered" | "milestone_paid" | "progress" | "terminated" | "abandoned";

type Data = Record<string, string | number> | null;

const nowSql = "CAST(strftime('%s', 'now') AS INTEGER)";

// La postulación de la persona que está (o estuvo) en el acuerdo de una changa.
const applicationOf = "(SELECT a.id FROM applications a JOIN changas c ON c.id = a.changa_id WHERE c.order_id = ? AND a.applicant = ?)";

// Una acción de la propuesta de acuerdo (mandar, aceptar, rechazar, cancelar). Puede repetirse, así que cada una lleva su hora como referencia.
export function recordAgreementEvent(db: D1Database, kind: ChatEventKind, orderId: number, payee: string, actor: string, nowSeconds: number) {
  return db
    .prepare(`INSERT OR IGNORE INTO chat_events (application_id, kind, actor, ref, created_at) SELECT ${applicationOf}, ?, ?, ?, ? WHERE ${applicationOf} IS NOT NULL`)
    .bind(orderId, payee.toLowerCase(), kind, actor.toLowerCase(), crypto.randomUUID(), nowSeconds, orderId, payee.toLowerCase());
}

// Un hecho de la postulación misma (postularse, bajarse, ser descartada).
export function recordApplicationEvent(db: D1Database, kind: ChatEventKind, applicationId: number, actor: string, nowSeconds: number, data: Data = null) {
  return db
    .prepare("INSERT OR IGNORE INTO chat_events (application_id, kind, actor, ref, created_at, data) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(applicationId, kind, actor.toLowerCase(), crypto.randomUUID(), nowSeconds, data ? JSON.stringify(data) : null);
}

// Un hecho del trabajo acordado que ocurre fuera de la cadena (subir pruebas, aprobar): va al chat de quien trabaja.
export function recordOrderEvent(db: D1Database, kind: ChatEventKind, orderId: number, actor: string, ref: string, nowSeconds: number, data: Data = null) {
  return db
    .prepare(
      `INSERT OR IGNORE INTO chat_events (application_id, kind, actor, ref, created_at, data)
       SELECT a.id, ?, ?, ?, ?, ? FROM order_parties p JOIN changas c ON c.order_id = p.order_id JOIN applications a ON a.changa_id = c.id AND a.applicant = p.payee
       WHERE p.order_id = ? AND p.payee IS NOT NULL`,
    )
    .bind(kind, actor.toLowerCase(), ref, nowSeconds, data ? JSON.stringify(data) : null, orderId);
}

const parse = <T>(args: string | null): T | null => {
  if (!args) return null;
  try {
    return JSON.parse(args) as T;
  } catch {
    return null;
  }
};

type Actor = "payee" | "payer" | "system" | { address: string };

// Qué hechos de la cadena se anotan en el chat, quién los hizo y qué datos chicos llevan.
// `repeats`: pueden pasar varias veces en un mismo trabajo, así que cada uno se identifica por su bloque.
const CHAIN: Record<string, { kind: ChatEventKind; actor: (args: Record<string, string> | null) => Actor; data?: (args: Record<string, string>) => Data; repeats?: boolean }> = {
  OrderCheckedIn: { kind: "checkedin", actor: () => "payee" },
  OrderDelivered: { kind: "delivered", actor: () => "payee" },
  OrderSettled: { kind: "settled", actor: () => "payee", data: (a) => ({ paid: a.paid ?? "0", rating: a.rating ?? "0" }) },
  ReviewExtended: { kind: "review_extended", actor: () => "payer" },
  ChangesRequested: { kind: "changes_requested", actor: () => "payer", repeats: true },
  OrderToppedUp: { kind: "topped_up", actor: () => "payer", data: (a) => ({ added: a.added ?? "0" }), repeats: true },
  OrderCancelled: { kind: "order_cancelled", actor: (a) => (a?.by && isAddress(a.by) ? { address: a.by.toLowerCase() } : "system"), data: (a) => ({ refunded: a.refunded ?? "0" }) },
  DisputeOpened: { kind: "dispute_opened", actor: (a) => (a?.claimant && isAddress(a.claimant) ? { address: a.claimant.toLowerCase() } : "system") },
  DisputeResolved: { kind: "dispute_resolved", actor: () => "system", data: (a) => ({ payeeShareBps: a.payeeShareBps ?? "0" }) },
  MilestoneDelivered: { kind: "milestone_delivered", actor: () => "payee", data: (a) => ({ index: Number(a.index ?? 0) }), repeats: true },
  MilestonePaid: { kind: "milestone_paid", actor: () => "payer", data: (a) => ({ index: Number(a.index ?? 0), paid: a.paid ?? "0", rating: a.rating ?? "0" }), repeats: true },
  ProgressReported: { kind: "progress", actor: () => "payee", data: (a) => ({ index: Number(a.index ?? 0), progressBps: Number(a.progressBps ?? 0) }), repeats: true },
  OrderTerminated: { kind: "terminated", actor: (a) => (a?.by && isAddress(a.by) ? { address: a.by.toLowerCase() } : "payer") },
  OrderAbandoned: { kind: "abandoned", actor: (a) => (a?.by && isAddress(a.by) ? { address: a.by.toLowerCase() } : "payee") },
};

// Lo que pasa en la cadena también queda en el chat. Cada hecho se anota una sola vez.
export const chatEventsHandler: EventHandler = (db: D1Database, events: StreamEvent[]) => {
  const statements: D1PreparedStatement[] = [];
  for (const event of events) {
    if (event.order_id === null) continue;
    if (event.name === "OrderAgreed") {
      const args = parse<{ payee?: string }>(event.args);
      if (args?.payee && isAddress(args.payee)) {
        const payee = args.payee.toLowerCase();
        statements.push(
          db
            .prepare(`INSERT OR IGNORE INTO chat_events (application_id, kind, actor, ref, created_at) SELECT ${applicationOf}, 'agreed', ?, '', ${nowSql} WHERE ${applicationOf} IS NOT NULL`)
            .bind(event.order_id, payee, payee, event.order_id, payee),
        );
      }
      continue;
    }
    const rule = CHAIN[event.name];
    if (!rule) continue;
    const args = parse<Record<string, string>>(event.args);
    const actor = rule.actor(args);
    const data = rule.data && args ? rule.data(args) : rule.data ? rule.data({}) : null;
    const ref = rule.repeats ? `${event.block_number}:${event.log_index}` : "";
    const actorSql = actor === "payee" ? "p.payee" : actor === "payer" ? "COALESCE(p.payer, '')" : actor === "system" ? "''" : "?";
    const binds: (string | number | null)[] = [rule.kind];
    if (typeof actor === "object") binds.push(actor.address);
    binds.push(ref, data ? JSON.stringify(data) : null, event.order_id);
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO chat_events (application_id, kind, actor, ref, created_at, data)
           SELECT a.id, ?, ${actorSql}, ?, ${nowSql}, ? FROM order_parties p JOIN changas c ON c.order_id = p.order_id JOIN applications a ON a.changa_id = c.id AND a.applicant = p.payee
           WHERE p.order_id = ? AND p.payee IS NOT NULL`,
        )
        .bind(...binds),
    );
  }
  return statements;
};

export async function listChatEvents(db: D1Database, applicationId: number) {
  const { results } = await db
    .prepare("SELECT id, kind, actor, created_at, data FROM chat_events WHERE application_id = ? ORDER BY created_at, id LIMIT 300")
    .bind(applicationId)
    .all<{ id: number; kind: string; actor: string; created_at: number; data: string | null }>();
  return results.map((row) => ({ id: row.id, kind: row.kind, actor: row.actor, createdAt: row.created_at, data: row.data ? (JSON.parse(row.data) as object) : null }));
}
