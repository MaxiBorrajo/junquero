import { isAddress } from "viem";
import type { EventHandler, StreamEvent } from "./eventStream";
import { EXPO_BATCH, sendAll, type Fetcher, type PushMessage, type PushTicket } from "./push";

export const MAX_ATTEMPTS = 5;
export const MAX_TOKENS_PER_ADDRESS = 5;
const REMINDER_LEAD_SECONDS = 3600;
const JURY_LEAD_SECONDS = 7200;

interface Template {
  title: string;
  body: string;
  priority: "default" | "high";
}

export const TEMPLATES: Record<string, Template> = {
  application_new: { title: "Nueva postulación", body: "Alguien se postuló a tu changa.", priority: "high" },
  agreement_proposed: { title: "Te eligieron", body: "Te eligieron para una changa. Confirmá el acuerdo.", priority: "high" },
  agreed: { title: "Changa acordada", body: "Quedó acordada. Abrí la app para ver los detalles.", priority: "high" },
  chat: { title: "Mensaje nuevo", body: "Tenés un mensaje nuevo.", priority: "default" },
  delivered: { title: "Entrega registrada", body: "Revisá el trabajo: si no respondés a tiempo, se aprueba solo.", priority: "high" },
  cancelled: { title: "Changa cancelada", body: "Una de tus changas fue cancelada.", priority: "high" },
  settled: { title: "Pago liberado", body: "Se liberó el pago de una changa.", priority: "default" },
  reminder_start: { title: "Tu changa es pronto", body: "Tenés una changa en una hora.", priority: "high" },
  dispute_opened: { title: "Abrieron un reclamo", body: "Tenés un plazo limitado para responder. Abrí la app ahora.", priority: "high" },
  jury_drawn: { title: "Te sortearon como jurado", body: "Tenés plazos para actuar. Abrí la app ahora.", priority: "high" },
  jury_deadline: { title: "Plazo de jurado por vencer", body: "Si no actuás a tiempo podés perder tu depósito.", priority: "high" },
  selfie_approved: { title: "Verificación aprobada", body: "Ya podés postularte a changas.", priority: "default" },
  selfie_rejected: { title: "Revisá tu selfie", body: "No pudimos verificarla. Probá de nuevo con buena luz.", priority: "default" },
};

const nowSql = "CAST(strftime('%s', 'now') AS INTEGER)";

export function queueNotification(db: D1Database, address: string, kind: string, ref: string, dueAt = 0, nowSeconds?: number) {
  const created = nowSeconds === undefined ? null : nowSeconds;
  return db
    .prepare(
      `INSERT OR IGNORE INTO notifications (address, kind, ref, due_at, created_at)
       VALUES (?, ?, ?, ?, COALESCE(?, ${nowSql}))`,
    )
    .bind(address.toLowerCase(), kind, ref, dueAt, created);
}

const parse = <T>(args: string | null): T | null => {
  if (!args) return null;
  try {
    return JSON.parse(args) as T;
  } catch {
    return null;
  }
};

const insertFromChanga = (db: D1Database, kind: string, orderId: number, role: "owner" | "chosen", dueSql = "0") =>
  db.prepare(
    role === "owner"
      ? `INSERT OR IGNORE INTO notifications (address, kind, ref, due_at, created_at)
         SELECT owner, ?, CAST(order_id AS TEXT), ${dueSql}, ${nowSql} FROM changas WHERE order_id = ?`
      : `INSERT OR IGNORE INTO notifications (address, kind, ref, due_at, created_at)
         SELECT a.applicant, ?, CAST(c.order_id AS TEXT), ${dueSql}, ${nowSql}
         FROM applications a JOIN changas c ON c.id = a.changa_id WHERE c.order_id = ? AND a.status = 'chosen'`,
  ).bind(kind, orderId);

const reminderDue = `json_extract(spec, '$.startsAt') - ${REMINDER_LEAD_SECONDS}`;

function reminderFor(db: D1Database, orderId: number, payee: string) {
  const when = `AND json_extract(spec, '$.startsAt') - ${REMINDER_LEAD_SECONDS} > ${nowSql}`;
  return [
    db
      .prepare(
        `INSERT OR IGNORE INTO notifications (address, kind, ref, due_at, created_at)
         SELECT owner, 'reminder_start', CAST(order_id AS TEXT), ${reminderDue}, ${nowSql} FROM changas WHERE order_id = ? ${when}`,
      )
      .bind(orderId),
    db
      .prepare(
        `INSERT OR IGNORE INTO notifications (address, kind, ref, due_at, created_at)
         SELECT ?, 'reminder_start', CAST(order_id AS TEXT), ${reminderDue}, ${nowSql} FROM changas WHERE order_id = ? ${when}`,
      )
      .bind(payee.toLowerCase(), orderId),
  ];
}

export const notificationsHandler: EventHandler = (db: D1Database, events: StreamEvent[]) => {
  const statements: D1PreparedStatement[] = [];
  for (const event of events) {
    if (event.name === "OrderAgreed" && event.order_id !== null) {
      const payee = parse<{ payee?: string }>(event.args)?.payee;
      if (!payee || !isAddress(payee)) continue;
      statements.push(queueNotification(db, payee, "agreed", String(event.order_id)), ...reminderFor(db, event.order_id, payee));
    } else if (event.name === "OrderDelivered" && event.order_id !== null) {
      statements.push(insertFromChanga(db, "delivered", event.order_id, "owner"));
    } else if (event.name === "OrderCancelled" && event.order_id !== null) {
      statements.push(insertFromChanga(db, "cancelled", event.order_id, "owner"), insertFromChanga(db, "cancelled", event.order_id, "chosen"));
    } else if (event.name === "OrderSettled" && event.order_id !== null) {
      const payee = parse<{ payee?: string }>(event.args)?.payee;
      if (payee && isAddress(payee)) statements.push(queueNotification(db, payee, "settled", String(event.order_id)));
    } else if (event.name === "CaseOpened" && event.order_id !== null) {
      const claimant = parse<{ claimant?: string }>(event.args)?.claimant;
      if (claimant && isAddress(claimant)) {
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO notifications (address, kind, ref, due_at, created_at)
               SELECT CASE WHEN payer = ?1 THEN payee ELSE payer END, 'dispute_opened', CAST(order_id AS TEXT), 0, ${nowSql}
               FROM order_parties WHERE order_id = ?2 AND payer IS NOT NULL AND payee IS NOT NULL`,
            )
            .bind(claimant.toLowerCase(), event.order_id),
        );
      }
    } else if (event.name === "JuryDrawn" && event.case_id !== null) {
      const drawn = parse<{ jurors?: string[]; commitEnd?: number | string; revealEnd?: number | string }>(event.args);
      const caseId = event.case_id;
      const commitEnd = Number(drawn?.commitEnd);
      const revealEnd = Number(drawn?.revealEnd);
      for (const juror of drawn?.jurors ?? []) {
        if (!isAddress(juror)) continue;
        statements.push(queueNotification(db, juror, "jury_drawn", String(caseId)));
        if (Number.isFinite(commitEnd)) statements.push(queueNotification(db, juror, "jury_deadline", `${caseId}:commit`, commitEnd - JURY_LEAD_SECONDS));
        if (Number.isFinite(revealEnd)) statements.push(queueNotification(db, juror, "jury_deadline", `${caseId}:reveal`, revealEnd - JURY_LEAD_SECONDS));
      }
    } else if ((event.name === "VoteCommitted" || event.name === "VoteRevealed") && event.case_id !== null) {
      const juror = parse<{ juror?: string }>(event.args)?.juror;
      if (!juror || !isAddress(juror)) continue;
      const phase = event.name === "VoteCommitted" ? "commit" : "reveal";
      statements.push(
        db
          .prepare("DELETE FROM notifications WHERE address = ? AND kind = 'jury_deadline' AND ref = ? AND sent_at IS NULL")
          .bind(juror.toLowerCase(), `${event.case_id}:${phase}`),
      );
    } else if ((event.name === "VerdictReached" || event.name === "CaseDecided") && event.case_id !== null) {
      statements.push(
        db.prepare("DELETE FROM notifications WHERE kind = 'jury_deadline' AND ref LIKE ? AND sent_at IS NULL").bind(`${event.case_id}:%`),
      );
    }
  }
  return statements;
};

interface DueRow {
  id: number;
  address: string;
  kind: string;
  ref: string;
  token: string | null;
}

export interface DeliveryResult {
  sent: number;
  dropped: number;
  retried: number;
  invalidTokens: number;
}

export async function deliverDue(db: D1Database, fetcher: Fetcher, nowSeconds: number, limit = EXPO_BATCH): Promise<DeliveryResult> {
  const result: DeliveryResult = { sent: 0, dropped: 0, retried: 0, invalidTokens: 0 };
  const { results } = await db
    .prepare(
      `SELECT n.id AS id, n.address AS address, n.kind AS kind, n.ref AS ref, t.token AS token
       FROM (SELECT * FROM notifications WHERE sent_at IS NULL AND due_at <= ? ORDER BY due_at, id LIMIT ?) n
       LEFT JOIN push_tokens t ON t.address = n.address`,
    )
    .bind(nowSeconds, limit)
    .all<DueRow>();
  if (!results.length) return result;

  const messages: { notificationId: number; message: PushMessage }[] = [];
  const noDevice = new Set<number>();
  const withDevice = new Set<number>();
  for (const row of results) {
    const template = TEMPLATES[row.kind];
    if (!template || !row.token) {
      noDevice.add(row.id);
      continue;
    }
    withDevice.add(row.id);
    messages.push({
      notificationId: row.id,
      message: { to: row.token, title: template.title, body: template.body, data: { kind: row.kind, ref: row.ref }, priority: template.priority, sound: "default", channelId: "default" },
    });
  }
  for (const id of withDevice) noDevice.delete(id);

  const tickets = await sendAll(fetcher, messages.map((item) => item.message));
  const statements: D1PreparedStatement[] = [];
  const mark = (id: number) => db.prepare("UPDATE notifications SET sent_at = ? WHERE id = ?").bind(nowSeconds, id);

  for (const id of noDevice) {
    statements.push(mark(id));
    result.dropped += 1;
  }

  const outcomes = new Map<number, (PushTicket | null)[]>();
  const dead = new Set<string>();
  messages.forEach((item, index) => {
    const ticket = tickets[index];
    outcomes.set(item.notificationId, [...(outcomes.get(item.notificationId) ?? []), ticket]);
    if (ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered") dead.add(item.message.to);
  });

  for (const [id, list] of outcomes) {
    if (list.some((ticket) => ticket?.status === "ok")) {
      statements.push(mark(id));
      result.sent += 1;
    } else if (list.every((ticket) => ticket === null)) {
      statements.push(
        db.prepare("UPDATE notifications SET attempts = attempts + 1, sent_at = CASE WHEN attempts + 1 >= ? THEN ? ELSE NULL END WHERE id = ?").bind(MAX_ATTEMPTS, nowSeconds, id),
      );
      result.retried += 1;
    } else {
      statements.push(mark(id));
      result.dropped += 1;
    }
  }
  for (const token of dead) {
    statements.push(db.prepare("DELETE FROM push_tokens WHERE token = ?").bind(token));
    result.invalidTokens += 1;
  }
  if (statements.length) await db.batch(statements);
  return result;
}

export async function registerToken(db: D1Database, address: string, token: string, platform: string, nowSeconds: number) {
  await db.batch([
    db
      .prepare(
        `INSERT INTO push_tokens (token, address, platform, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET address = excluded.address, platform = excluded.platform, updated_at = excluded.updated_at`,
      )
      .bind(token, address, platform, nowSeconds),
    db
      .prepare(
        `DELETE FROM push_tokens WHERE address = ? AND token NOT IN
           (SELECT token FROM push_tokens WHERE address = ? ORDER BY updated_at DESC, token LIMIT ?)`,
      )
      .bind(address, address, MAX_TOKENS_PER_ADDRESS),
  ]);
}

export const removeToken = async (db: D1Database, address: string, token: string) => {
  const result = await db.prepare("DELETE FROM push_tokens WHERE address = ? AND token = ?").bind(address, token).run();
  return (result.meta?.changes ?? 0) > 0;
};

export async function purgeSentNotifications(db: D1Database, nowSeconds: number, retentionSeconds: number) {
  await db.prepare("DELETE FROM notifications WHERE sent_at IS NOT NULL AND sent_at < ?").bind(nowSeconds - retentionSeconds).run();
}
