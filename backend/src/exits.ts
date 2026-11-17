import type { EventHandler, StreamEvent } from "./eventStream";

export const REASON_MIN = 10;
export const REASON_MAX = 500;
export type ExitKind = "abandoned" | "terminated";

export function validateExit(body: unknown): { ok: true; kind: ExitKind; reason: string } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid body" };
  const { kind, reason } = body as { kind?: unknown; reason?: unknown };
  if (kind !== "abandoned" && kind !== "terminated") return { ok: false, error: "invalid kind" };
  if (typeof reason !== "string") return { ok: false, error: "reason required" };
  const text = reason.trim();
  if (text.length < REASON_MIN || text.length > REASON_MAX) return { ok: false, error: `reason must have between ${REASON_MIN} and ${REASON_MAX} characters` };
  return { ok: true, kind, reason: text };
}

// Solo quien hace el hecho puede justificarlo: el prestador deja el trabajo, quien publica lo termina.
export async function saveExitReason(db: D1Database, orderId: number, caller: string, kind: ExitKind, reason: string, nowSeconds: number): Promise<{ ok: true } | { ok: false; status: 403 | 404; error: string }> {
  const parties = await db.prepare("SELECT payer, payee FROM order_parties WHERE order_id = ?").bind(orderId).first<{ payer: string | null; payee: string | null }>();
  if (!parties) return { ok: false, status: 404, error: "order not found" };
  const expected = kind === "abandoned" ? parties.payee : parties.payer;
  if (!expected || expected !== caller) return { ok: false, status: 403, error: "only the person doing this can justify it" };
  await db.prepare("INSERT INTO exit_reasons (order_id, kind, actor, reason, created_at) VALUES (?, ?, ?, ?, ?)").bind(orderId, kind, caller, reason, nowSeconds).run();
  return { ok: true };
}

// Las dos partes (y quienes se postularon) leen los motivos de ese trabajo.
export async function listExitReasons(db: D1Database, orderId: number, caller: string) {
  const allowed = await db
    .prepare(
      `SELECT 1 AS ok FROM changas c WHERE c.order_id = ?1 AND (c.owner = ?2
         OR EXISTS (SELECT 1 FROM applications a WHERE a.changa_id = c.id AND a.applicant = ?2)
         OR EXISTS (SELECT 1 FROM order_parties p WHERE p.order_id = c.order_id AND (p.payer = ?2 OR p.payee = ?2)))`,
    )
    .bind(orderId, caller)
    .first();
  if (!allowed) return null;
  const { results } = await db.prepare("SELECT kind, actor, reason, created_at FROM exit_reasons WHERE order_id = ? ORDER BY created_at DESC, id DESC LIMIT 20").bind(orderId).all<{ kind: string; actor: string; reason: string; created_at: number }>();
  return results.map((row) => ({ kind: row.kind, actor: row.actor, reason: row.reason, createdAt: row.created_at }));
}

// Anota quién dejó cada trabajo, para el historial público.
export const abandonmentsHandler: EventHandler = (db: D1Database, events: StreamEvent[]) =>
  events
    .filter((event) => event.name === "OrderAbandoned" && event.order_id !== null)
    .map((event) =>
      db
        .prepare("INSERT OR IGNORE INTO abandonments (order_id, payee, block_number, log_index) SELECT order_id, payee, ?, ? FROM order_parties WHERE order_id = ? AND payee IS NOT NULL")
        .bind(event.block_number, event.log_index, event.order_id),
    );

export async function abandonedCount(db: D1Database, address: string): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM abandonments WHERE payee = ?").bind(address).first<{ n: number }>();
  return row?.n ?? 0;
}

// Qué hitos del plan vigente se cerraron por un reclamo (el contrato los marca "pagados" igual) y qué parte cobró quien trabajó.
// Un hito pagado de forma normal emite `MilestonePaid`; el resuelto por reclamo no, y siempre es el que tocaba (el primero sin cerrar).
export function disputedMilestonesFrom(events: { name: string; args: string | null }[]): { index: number; payeeShareBps: number }[] {
  const closed = new Set<number>();
  let disputed: { index: number; payeeShareBps: number }[] = [];
  for (const event of events) {
    let args: { index?: string | number; payeeShareBps?: string | number } = {};
    try {
      args = event.args ? JSON.parse(event.args) : {};
    } catch {
      args = {};
    }
    if (event.name === "OrderAgreed" || event.name === "OrderAbandoned") {
      closed.clear();
      disputed = [];
    } else if (event.name === "MilestonePaid") {
      closed.add(Number(args.index));
    } else if (event.name === "DisputeResolved") {
      let index = 0;
      while (closed.has(index)) index += 1;
      closed.add(index);
      disputed.push({ index, payeeShareBps: Number(args.payeeShareBps ?? 0) });
    }
  }
  return disputed;
}

export async function disputedMilestones(db: D1Database, orderId: number, caller: string) {
  const allowed = await db
    .prepare(
      `SELECT 1 AS ok FROM changas c WHERE c.order_id = ?1 AND (c.owner = ?2
         OR EXISTS (SELECT 1 FROM order_parties p WHERE p.order_id = c.order_id AND (p.payer = ?2 OR p.payee = ?2)))`,
    )
    .bind(orderId, caller)
    .first();
  if (!allowed) return null;
  const { results } = await db
    .prepare("SELECT name, args FROM events WHERE order_id = ? AND name IN ('OrderAgreed', 'OrderAbandoned', 'MilestonePaid', 'DisputeResolved') ORDER BY block_number, log_index")
    .bind(orderId)
    .all<{ name: string; args: string | null }>();
  return disputedMilestonesFrom(results);
}
