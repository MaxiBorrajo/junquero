import { isAddress } from "viem";
import type { EventHandler, StreamEvent } from "./eventStream";
import { EXPO_BATCH, sendAll, type Fetcher, type PushMessage, type PushTicket } from "./push";

export const MAX_ATTEMPTS = 5;
export const MAX_TOKENS_PER_ADDRESS = 5;
const REMINDER_LEAD_SECONDS = 3600;
const JURY_LEAD_SECONDS = 7200;
// Aviso de "revelá antes de que termine" para el número del sorteo: los plazos son cortos, así que va más cerca del cierre.
const REVEAL_LEAD_SECONDS = 600;

interface Template {
  title: string;
  body: string;
  priority: "default" | "high";
}

export const TEMPLATES: Record<string, Template> = {
  application_new: { title: "Nueva postulación", body: "Alguien se postuló a tu trabajo. Entrá a ver su perfil y elegí a quién querés.", priority: "high" },
  agreement_proposed: { title: "Te eligieron", body: "Te eligieron para un trabajo. Revisá el acuerdo y aceptalo.", priority: "high" },
  published: { title: "Trabajo publicado", body: "Tu trabajo ya está confirmado y aparece en el mapa. Te avisamos cuando alguien se postule.", priority: "default" },
  group_published: { title: "Trabajo grupal publicado", body: "Tu trabajo grupal ya puede recibir aportes. Compartilo para juntar la meta.", priority: "default" },
  agreed: { title: "Trabajo acordado", body: "Quedó acordado y el pago está en garantía. Abrí el trabajo para ver fecha, lugar y chat.", priority: "high" },
  chat: { title: "Mensaje nuevo", body: "Te escribieron por un trabajo. Entrá a leer y responder.", priority: "default" },
  delivered: { title: "Trabajo terminado", body: "Marcaron el trabajo como terminado. Revisalo y aprobalo: si no respondés a tiempo, se aprueba solo.", priority: "high" },
  cancelled: { title: "Trabajo cancelado", body: "Cancelaron un trabajo tuyo. Abrilo para ver cómo queda el pago.", priority: "high" },
  abandoned: { title: "Dejaron tu trabajo", body: "Quien hacía tu trabajo lo dejó. Volvió a publicarse con lo que quedó en garantía: elegí a otra persona.", priority: "high" },
  terminated: { title: "Terminaron tu trabajo", body: "Terminaron el trabajo antes de tiempo. Abrilo para ver cuánto cobraste y cómo quedó el pago.", priority: "high" },
  settled: { title: "Pago liberado", body: "Se liberó el pago de un trabajo. Calificá a la otra persona desde el trabajo.", priority: "default" },
  reminder_start: { title: "Tu trabajo es pronto", body: "Tenés un trabajo en una hora. Abrilo para ver el lugar y cuando llegues, tocá Llegué.", priority: "high" },
  checked_in: { title: "Llegó quien hace tu trabajo", body: "Avisó que llegó al lugar. Salí a recibirlo y abrí el trabajo para ver los detalles.", priority: "high" },
  evidence_uploaded: { title: "Subieron pruebas", body: "Subieron pruebas de tu trabajo. Entrá a revisarlas.", priority: "default" },
  release_ready: { title: "Aprobaron tu trabajo", body: "Ya podés cobrar. Abrí el trabajo y confirmá el cobro.", priority: "high" },
  jury_reveal: { title: "Revelá tu número del sorteo", body: "Ya podés revelar tu número del sorteo de jurados. Entrá a Reclamos y tocá Revelar antes de que termine el plazo: si no, quedás afuera.", priority: "high" },
  case_evidence: { title: "Ya hay jurados", body: "Se sortearon los jurados de tu reclamo. Abrilo para compartirles tus pruebas.", priority: "high" },
  jury_not_drawn: { title: "No te tocó en este reclamo", body: "Revelaste tu número del sorteo pero no resultaste elegido en el sorteo. Tu garantía queda libre. Gracias por anotarte.", priority: "default" },
  jury_open: { title: "Reclamo buscando jurados", body: "Hay un reclamo que busca jurados. Si cumplís los requisitos, entrá a Reclamos y anotate.", priority: "default" },
  dispute_resolved: { title: "Se resolvió un reclamo", body: "Se resolvió el reclamo de un trabajo. Abrilo para ver cómo quedó el pago.", priority: "high" },
  dispute_small: { title: "Abrieron un reclamo", body: "Abrieron un reclamo por un trabajo chico y el pago se repartió 50/50, sin jurado. Abrí el trabajo para ver cuánto cobraste.", priority: "high" },
  dispute_opened: { title: "Abrieron un reclamo", body: "Tenés un plazo limitado para responder. Entrá al trabajo ahora.", priority: "high" },
  jury_drawn: { title: "Te sortearon como jurado", body: "Tenés plazos para votar. Entrá al reclamo ahora.", priority: "high" },
  jury_deadline: { title: "Plazo de jurado por vencer", body: "Si no actuás a tiempo podés perder tu depósito. Entrá al reclamo ahora.", priority: "high" },
  selfie_approved: { title: "Verificación aprobada", body: "Ya podés postularte a trabajos. Buscá uno en el mapa.", priority: "default" },
  selfie_rejected: { title: "Revisá tu selfie", body: "No pudimos verificarla. Sacate otra con buena luz desde tu perfil.", priority: "default" },
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

// `except` es quien hizo la acción: a esa persona no se le avisa de lo que acaba de hacer ella misma.
const insertFromChanga = (db: D1Database, kind: string, orderId: number, role: "owner" | "chosen", dueSql = "0", except = "") =>
  db.prepare(
    role === "owner"
      ? `INSERT OR IGNORE INTO notifications (address, kind, ref, due_at, created_at)
         SELECT owner, ?, CAST(order_id AS TEXT), ${dueSql}, ${nowSql} FROM changas WHERE order_id = ? AND lower(owner) != ?`
      : `INSERT OR IGNORE INTO notifications (address, kind, ref, due_at, created_at)
         SELECT a.applicant, ?, CAST(c.order_id AS TEXT), ${dueSql}, ${nowSql}
         FROM applications a JOIN changas c ON c.id = a.changa_id WHERE c.order_id = ? AND a.status = 'chosen' AND lower(a.applicant) != ?`,
  ).bind(kind, orderId, except);

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
    if (event.name === "OrderCreated" && event.order_id !== null) {
      const payer = parse<{ payer?: string }>(event.args)?.payer;
      if (payer && isAddress(payer)) statements.push(queueNotification(db, payer, "published", String(event.order_id)));
    } else if (event.name === "GroupCreated" && event.order_id !== null) {
      const creator = parse<{ creator?: string }>(event.args)?.creator;
      if (creator && isAddress(creator)) statements.push(queueNotification(db, creator, "group_published", String(event.order_id)));
    } else if (event.name === "OrderAgreed" && event.order_id !== null) {
      const payee = parse<{ payee?: string }>(event.args)?.payee;
      if (!payee || !isAddress(payee)) continue;
      statements.push(queueNotification(db, payee, "agreed", String(event.order_id)), ...reminderFor(db, event.order_id, payee));
    } else if (event.name === "OrderCheckedIn" && event.order_id !== null) {
      statements.push(insertFromChanga(db, "checked_in", event.order_id, "owner"));
    } else if (event.name === "OrderDelivered" && event.order_id !== null) {
      statements.push(insertFromChanga(db, "delivered", event.order_id, "owner"));
    } else if (event.name === "OrderCancelled" && event.order_id !== null) {
      const by = (parse<{ by?: string }>(event.args)?.by ?? "").toLowerCase();
      statements.push(insertFromChanga(db, "cancelled", event.order_id, "owner", "0", by), insertFromChanga(db, "cancelled", event.order_id, "chosen", "0", by));
    } else if (event.name === "OrderAbandoned" && event.order_id !== null) {
      statements.push(insertFromChanga(db, "abandoned", event.order_id, "owner"));
    } else if (event.name === "OrderTerminated" && event.order_id !== null) {
      statements.push(insertFromChanga(db, "terminated", event.order_id, "chosen"));
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
        // A quienes ya depositaron garantía (salvo las partes) se les avisa que hay un reclamo buscando jurados. Si cumplen o no
        // los requisitos lo ve cada uno en la pantalla de Reclamos.
        const caseId = event.case_id ?? Number(parse<{ caseId?: string }>(event.args)?.caseId);
        if (Number.isFinite(caseId)) {
          statements.push(
            db
              .prepare(
                `INSERT OR IGNORE INTO notifications (address, kind, ref, due_at, created_at)
                 SELECT DISTINCT lower(json_extract(e.args, '$.juror')), 'jury_open', CAST(CAST(?1 AS INTEGER) AS TEXT), 0, ${nowSql}
                 FROM events e
                 WHERE e.name = 'Staked' AND json_extract(e.args, '$.juror') IS NOT NULL
                   AND lower(json_extract(e.args, '$.juror')) NOT IN (
                     SELECT lower(payer) FROM order_parties WHERE order_id = ?2 AND payer IS NOT NULL
                     UNION SELECT lower(payee) FROM order_parties WHERE order_id = ?2 AND payee IS NOT NULL)`,
              )
              .bind(caseId, event.order_id),
          );
        }
      }
    } else if (event.name === "DisputeResolved" && event.order_id !== null) {
      // Un reclamo con jurado (o resuelto por falta de respuesta) tiene costo de arbitraje; el chico no. A las dos partes les avisa lo mismo
      // porque el resultado se ve en el trabajo.
      const cost = parse<{ arbitrationCost?: string | number }>(event.args)?.arbitrationCost;
      if (cost !== undefined && BigInt(cost) > 0n) {
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO notifications (address, kind, ref, due_at, created_at)
               SELECT party, 'dispute_resolved', CAST(CAST(?1 AS INTEGER) AS TEXT), 0, ${nowSql}
               FROM (SELECT payer AS party FROM order_parties WHERE order_id = ?1 UNION SELECT payee FROM order_parties WHERE order_id = ?1)
               WHERE party IS NOT NULL`,
            )
            .bind(event.order_id),
        );
      }
    } else if (event.name === "DisputeOpened" && event.order_id !== null) {
      // Los reclamos con jurado avisan con CaseOpened. El de una changa chica se resuelve en el mismo momento y no abre caso: caseId 0.
      const args = parse<{ claimant?: string; caseId?: string | number }>(event.args);
      if (args?.claimant && isAddress(args.claimant) && args.caseId !== undefined && Number(args.caseId) === 0) {
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO notifications (address, kind, ref, due_at, created_at)
               SELECT CASE WHEN payer = ?1 THEN payee ELSE payer END, 'dispute_small', CAST(order_id AS TEXT), 0, ${nowSql}
               FROM order_parties WHERE order_id = ?2 AND payer IS NOT NULL AND payee IS NOT NULL`,
            )
            .bind(args.claimant.toLowerCase(), event.order_id),
        );
      }
    } else if (event.name === "SeedCommitted" && event.case_id !== null) {
      // Quien se anota tiene que volver a revelar su número del sorteo cuando cierra la anotación. Se le avisa justo en ese momento, y otra vez
      // antes de que termine el plazo de revelar. Los datos de la ronda salen de su último SeedRoundStarted.
      const juror = parse<{ juror?: string }>(event.args)?.juror;
      if (juror && isAddress(juror)) {
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO notifications (address, kind, ref, due_at, created_at)
               SELECT ?1, 'jury_reveal', CAST(CAST(?2 AS INTEGER) AS TEXT) || ':start', CAST(json_extract(r.args, '$.commitEnd') AS INTEGER), ${nowSql}
               FROM events r WHERE r.name = 'SeedRoundStarted' AND r.case_id = ?2 ORDER BY r.block_number DESC, r.log_index DESC LIMIT 1`,
            )
            .bind(juror.toLowerCase(), event.case_id),
          db
            .prepare(
              `INSERT OR IGNORE INTO notifications (address, kind, ref, due_at, created_at)
               SELECT ?1, 'jury_reveal', CAST(CAST(?2 AS INTEGER) AS TEXT) || ':end', MAX(CAST(json_extract(r.args, '$.commitEnd') AS INTEGER), CAST(json_extract(r.args, '$.revealEnd') AS INTEGER) - ${REVEAL_LEAD_SECONDS}), ${nowSql}
               FROM events r WHERE r.name = 'SeedRoundStarted' AND r.case_id = ?2 ORDER BY r.block_number DESC, r.log_index DESC LIMIT 1`,
            )
            .bind(juror.toLowerCase(), event.case_id),
        );
      }
    } else if (event.name === "SeedRevealed" && event.case_id !== null) {
      const juror = parse<{ juror?: string }>(event.args)?.juror;
      if (juror && isAddress(juror)) {
        statements.push(
          db
            .prepare("DELETE FROM notifications WHERE address = ? AND kind = 'jury_reveal' AND ref LIKE ? AND sent_at IS NULL")
            .bind(juror.toLowerCase(), `${event.case_id}:%`),
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
      // A las partes se les avisa que ya hay jurados: al abrir el reclamo la app les comparte sus pruebas (van cifradas para cada jurado).
      statements.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO notifications (address, kind, ref, due_at, created_at)
             SELECT party, 'case_evidence', CAST(CAST(?1 AS INTEGER) AS TEXT), 0, ${nowSql}
             FROM (SELECT p.payer AS party FROM order_cases oc JOIN order_parties p ON p.order_id = oc.order_id WHERE oc.case_id = ?1
                   UNION SELECT p.payee FROM order_cases oc JOIN order_parties p ON p.order_id = oc.order_id WHERE oc.case_id = ?1)
             WHERE party IS NOT NULL`,
          )
          .bind(caseId),
      );
      // A quienes revelaron su número del sorteo en esta ronda y no quedaron entre los elegidos se les avisa que no les tocó, para que no se queden esperando.
      if (event.args) {
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO notifications (address, kind, ref, due_at, created_at)
               SELECT DISTINCT lower(json_extract(e.args, '$.juror')), 'jury_not_drawn', CAST(CAST(?1 AS INTEGER) AS TEXT), 0, ${nowSql}
               FROM events e
               WHERE e.name = 'SeedRevealed' AND e.case_id = ?1 AND json_extract(e.args, '$.juror') IS NOT NULL
                 AND NOT (e.block_number < COALESCE((SELECT r.block_number FROM events r WHERE r.name = 'SeedRoundStarted' AND r.case_id = ?1 ORDER BY r.block_number DESC, r.log_index DESC LIMIT 1), 0))
                 AND lower(json_extract(e.args, '$.juror')) NOT IN (SELECT lower(value) FROM json_each(?2, '$.jurors'))`,
            )
            .bind(caseId, event.args),
        );
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
