import { isAddress } from "viem";
import type { EventHandler, StreamEvent } from "./eventStream";

export type ChatEventKind = "proposed" | "accepted" | "rejected" | "cancelled" | "agreed" | "checkedin" | "delivered" | "settled";

const nowSql = "CAST(strftime('%s', 'now') AS INTEGER)";

// La postulación de la persona que está (o estuvo) en el acuerdo de una changa.
const applicationOf = "(SELECT a.id FROM applications a JOIN changas c ON c.id = a.changa_id WHERE c.order_id = ? AND a.applicant = ?)";

// Una acción de la propuesta de acuerdo (mandar, aceptar, rechazar, cancelar). Puede repetirse, así que cada una lleva su hora como referencia.
export function recordAgreementEvent(db: D1Database, kind: ChatEventKind, orderId: number, payee: string, actor: string, nowSeconds: number) {
  return db
    .prepare(`INSERT OR IGNORE INTO chat_events (application_id, kind, actor, ref, created_at) SELECT ${applicationOf}, ?, ?, ?, ? WHERE ${applicationOf} IS NOT NULL`)
    .bind(orderId, payee.toLowerCase(), kind, actor.toLowerCase(), String(nowSeconds), nowSeconds, orderId, payee.toLowerCase());
}

const parse = <T>(args: string | null): T | null => {
  if (!args) return null;
  try {
    return JSON.parse(args) as T;
  } catch {
    return null;
  }
};

// Lo que pasa en la cadena (acordado, llegó, entregó, cobró) también queda en el chat. Cada hecho se anota una sola vez.
export const chatEventsHandler: EventHandler = (db: D1Database, events: StreamEvent[]) => {
  const statements: D1PreparedStatement[] = [];
  const insert = (kind: ChatEventKind, orderId: number, payee: string, actor: string) =>
    db
      .prepare(`INSERT OR IGNORE INTO chat_events (application_id, kind, actor, ref, created_at) SELECT ${applicationOf}, ?, ?, '', ${nowSql} WHERE ${applicationOf} IS NOT NULL`)
      .bind(orderId, payee, kind, actor, orderId, payee);
  for (const event of events) {
    if (event.order_id === null) continue;
    if (event.name === "OrderAgreed") {
      const args = parse<{ payer?: string; payee?: string }>(event.args);
      if (args?.payee && isAddress(args.payee)) statements.push(insert("agreed", event.order_id, args.payee.toLowerCase(), (args.payer ?? args.payee).toLowerCase()));
      continue;
    }
    if (event.name !== "OrderCheckedIn" && event.name !== "OrderDelivered" && event.name !== "OrderSettled") continue;
    const kind: ChatEventKind = event.name === "OrderCheckedIn" ? "checkedin" : event.name === "OrderDelivered" ? "delivered" : "settled";
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO chat_events (application_id, kind, actor, ref, created_at)
           SELECT a.id, ?, p.payee, '', ${nowSql} FROM order_parties p JOIN changas c ON c.order_id = p.order_id JOIN applications a ON a.changa_id = c.id AND a.applicant = p.payee
           WHERE p.order_id = ? AND p.payee IS NOT NULL`,
        )
        .bind(kind, event.order_id),
    );
  }
  return statements;
};

export async function listChatEvents(db: D1Database, applicationId: number) {
  const { results } = await db
    .prepare("SELECT id, kind, actor, created_at FROM chat_events WHERE application_id = ? ORDER BY id LIMIT 200")
    .bind(applicationId)
    .all<{ id: number; kind: string; actor: string; created_at: number }>();
  return results.map((row) => ({ id: row.id, kind: row.kind, actor: row.actor, createdAt: row.created_at }));
}
