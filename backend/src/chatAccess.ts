export interface ChatAccess {
  applicationId: number;
  owner: string;
  applicant: string;
  counterpart: string;
  writable: boolean;
}

export type AccessResult = { ok: true; access: ChatAccess } | { ok: false; status: 403 | 404; error: string };

const FINISHED = new Set(["settled", "cancelled"]);

export async function resolveChatAccess(db: D1Database, applicationId: number, address: string): Promise<AccessResult> {
  const row = await db
    .prepare(
      `SELECT a.applicant AS applicant, a.status AS app_status, c.owner AS owner, c.status AS changa_status
       FROM applications a JOIN changas c ON c.id = a.changa_id WHERE a.id = ?`,
    )
    .bind(applicationId)
    .first<{ applicant: string; app_status: string; owner: string; changa_status: string }>();
  if (!row) return { ok: false, status: 404, error: "chat not found" };
  if (address !== row.owner && address !== row.applicant) return { ok: false, status: 403, error: "not a participant" };
  const writable = (row.app_status === "active" || row.app_status === "chosen") && !FINISHED.has(row.changa_status);
  return {
    ok: true,
    access: {
      applicationId,
      owner: row.owner,
      applicant: row.applicant,
      counterpart: address === row.owner ? row.applicant : row.owner,
      writable,
    },
  };
}

export async function recordMessage(db: D1Database, applicationId: number, sender: string, seq: number, nowSeconds: number) {
  await db.batch([
    db
      .prepare(
        `INSERT INTO chat_meta (application_id, last_seq, last_sender, last_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(application_id) DO UPDATE SET last_seq = excluded.last_seq, last_sender = excluded.last_sender, last_at = excluded.last_at
         WHERE excluded.last_seq > chat_meta.last_seq`,
      )
      .bind(applicationId, seq, sender, nowSeconds),
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
              COALESCE(r.seq, 0) AS read_seq
       FROM applications a
       JOIN changas c ON c.id = a.changa_id
       LEFT JOIN chat_meta m ON m.application_id = a.id
       LEFT JOIN chat_reads r ON r.application_id = a.id AND r.address = ?
       WHERE a.applicant = ? OR c.owner = ?
       ORDER BY COALESCE(m.last_at, a.updated_at) DESC LIMIT ?`,
    )
    .bind(address, address, address, limit)
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
    }>();
  return results.map((row) => {
    const spec = JSON.parse(row.spec) as { title: string };
    return {
      applicationId: row.application_id,
      changaId: row.changa_id,
      title: spec.title,
      counterpart: address === row.owner ? row.applicant : row.owner,
      writable: (row.app_status === "active" || row.app_status === "chosen") && !FINISHED.has(row.changa_status),
      lastSeq: row.last_seq,
      lastSender: row.last_sender,
      lastAt: row.last_at,
      unread: row.last_sender !== null && row.last_sender !== address && row.last_seq > row.read_seq,
    };
  });
}
