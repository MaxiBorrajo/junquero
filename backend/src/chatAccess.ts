import { isBlockedBetween } from "./blocks";

export interface ChatAccess {
  applicationId: number;
  owner: string;
  applicant: string;
  counterpart: string;
  role: "owner" | "applicant";
  // El chat está abierto (la postulación sigue activa y la changa no terminó).
  writable: boolean;
  // Quien se postula no puede escribir hasta que quien publicó conteste.
  waitingForOwner: boolean;
  // Puede enviar un mensaje ahora mismo.
  canSend: boolean;
  // Hasta que no haya acuerdo no se comparten teléfonos, mails ni enlaces.
  contactsAllowed: boolean;
  applicationMessage: string;
  changaId: number;
  specHash: string;
}

export type AccessResult = { ok: true; access: ChatAccess } | { ok: false; status: 403 | 404; error: string };

const FINISHED = new Set(["settled", "cancelled"]);
const BEFORE_AGREEMENT = new Set(["open", "reserved", "funding"]);

export async function resolveChatAccess(db: D1Database, applicationId: number, address: string): Promise<AccessResult> {
  const row = await db
    .prepare(
      `SELECT a.applicant AS applicant, a.status AS app_status, a.message AS app_message, a.changa_id AS changa_id, c.spec_hash AS spec_hash, c.owner AS owner, c.status AS changa_status,
              COALESCE(m.owner_replied, 0) AS owner_replied
       FROM applications a JOIN changas c ON c.id = a.changa_id
       LEFT JOIN chat_meta m ON m.application_id = a.id WHERE a.id = ?`,
    )
    .bind(applicationId)
    .first<{ applicant: string; app_status: string; app_message: string; changa_id: number; spec_hash: string; owner: string; changa_status: string; owner_replied: number }>();
  if (!row) return { ok: false, status: 404, error: "chat not found" };
  if (address !== row.owner && address !== row.applicant) return { ok: false, status: 403, error: "not a participant" };
  const blocked = await isBlockedBetween(db, row.owner, row.applicant);
  const writable = !blocked && (row.app_status === "active" || row.app_status === "chosen") && !FINISHED.has(row.changa_status);
  const role = address === row.owner ? "owner" : "applicant";
  const waitingForOwner = writable && role === "applicant" && row.owner_replied === 0;
  return {
    ok: true,
    access: {
      applicationId,
      owner: row.owner,
      applicant: row.applicant,
      counterpart: address === row.owner ? row.applicant : row.owner,
      role,
      writable,
      waitingForOwner,
      canSend: writable && !waitingForOwner,
      contactsAllowed: !BEFORE_AGREEMENT.has(row.changa_status),
      applicationMessage: row.app_message,
      changaId: row.changa_id,
      specHash: row.spec_hash,
    },
  };
}

// El último mensaje se guarda ya cifrado (el servidor no lo puede leer) para que la lista de chats lo traiga junto
// con el resto y el celular lo descifre; si es muy largo no se guarda y el celular lo pide aparte.
export const LAST_BODY_MAX_CHARS = 1500;

export async function recordMessage(
  db: D1Database,
  applicationId: number,
  sender: string,
  seq: number,
  nowSeconds: number,
  fromOwner = false,
  sealed?: { nonce: string; body: string },
) {
  const keep = sealed !== undefined && sealed.body.length <= LAST_BODY_MAX_CHARS;
  await db.batch([
    db
      .prepare(
        `INSERT INTO chat_meta (application_id, last_seq, last_sender, last_at, owner_replied, last_nonce, last_body) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(application_id) DO UPDATE SET last_seq = excluded.last_seq, last_sender = excluded.last_sender, last_at = excluded.last_at,
           owner_replied = MAX(chat_meta.owner_replied, excluded.owner_replied), last_nonce = excluded.last_nonce, last_body = excluded.last_body
         WHERE excluded.last_seq > chat_meta.last_seq`,
      )
      .bind(applicationId, seq, sender, nowSeconds, fromOwner ? 1 : 0, keep ? sealed.nonce : null, keep ? sealed.body : null),
    db
      .prepare(
        `INSERT INTO chat_reads (application_id, address, seq) VALUES (?, ?, ?)
         ON CONFLICT(application_id, address) DO UPDATE SET seq = excluded.seq WHERE excluded.seq > chat_reads.seq`,
      )
      .bind(applicationId, sender, seq),
  ]);
}

export async function markRead(db: D1Database, applicationId: number, address: string, seq: number) {
  await db
    .prepare(
      `INSERT INTO chat_reads (application_id, address, seq) VALUES (?, ?, ?)
       ON CONFLICT(application_id, address) DO UPDATE SET seq = excluded.seq WHERE excluded.seq > chat_reads.seq`,
    )
    .bind(applicationId, address, seq)
    .run();
}

export async function listChats(db: D1Database, address: string, limit: number) {
  const { results } = await db
    .prepare(
      `SELECT a.id AS application_id, a.status AS app_status, a.changa_id AS changa_id, a.applicant AS applicant,
              c.owner AS owner, c.status AS changa_status, c.spec AS spec,
              COALESCE(m.last_seq, 0) AS last_seq, m.last_sender AS last_sender, m.last_at AS last_at,
              COALESCE(r.seq, 0) AS read_seq, COALESCE(m.owner_replied, 0) AS owner_replied,
              m.last_nonce AS last_nonce, m.last_body AS last_body, cp.name AS counterpart_name,
              EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker = c.owner AND b.blocked = a.applicant) OR (b.blocker = a.applicant AND b.blocked = c.owner)) AS is_blocked
       FROM applications a
       JOIN changas c ON c.id = a.changa_id
       LEFT JOIN chat_meta m ON m.application_id = a.id
       LEFT JOIN chat_reads r ON r.application_id = a.id AND r.address = ?
       LEFT JOIN profiles cp ON cp.address = CASE WHEN c.owner = ? THEN a.applicant ELSE c.owner END
       WHERE a.applicant = ? OR c.owner = ?
       ORDER BY COALESCE(m.last_at, a.updated_at) DESC LIMIT ?`,
    )
    .bind(address, address, address, address, limit)
    .all<{
      application_id: number;
      app_status: string;
      changa_id: number;
      applicant: string;
      owner: string;
      changa_status: string;
      spec: string;
      last_seq: number;
      last_sender: string | null;
      last_at: number | null;
      read_seq: number;
      owner_replied: number;
      is_blocked: number;
      last_nonce: string | null;
      last_body: string | null;
      counterpart_name: string | null;
    }>();
  return results.map((row) => {
    const spec = JSON.parse(row.spec) as { title: string };
    const writable = row.is_blocked === 0 && (row.app_status === "active" || row.app_status === "chosen") && !FINISHED.has(row.changa_status);
    const role = address === row.owner ? "owner" : "applicant";
    return {
      applicationId: row.application_id,
      changaId: row.changa_id,
      title: spec.title,
      counterpart: address === row.owner ? row.applicant : row.owner,
      role,
      writable,
      waitingForOwner: writable && role === "applicant" && row.owner_replied === 0,
      counterpartName: row.counterpart_name,
      lastSeq: row.last_seq,
      lastSender: row.last_sender,
      lastAt: row.last_at,
      lastNonce: row.last_nonce,
      lastBody: row.last_body,
      unreadCount: row.last_sender !== null && row.last_sender !== address ? Math.max(0, row.last_seq - row.read_seq) : 0,
      unread: row.last_sender !== null && row.last_sender !== address && row.last_seq > row.read_seq,
    };
  });
}
