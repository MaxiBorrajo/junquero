const ADDRESS = /^0x[0-9a-f]{40}$/;
export const MAX_BLOCKS_PER_USER = 200;

export type BlockResult = { ok: true } | { ok: false; status: 400 | 404 | 409 | 429; error: string };

// ¿Alguna de las dos personas bloqueó a la otra?
export async function isBlockedBetween(db: D1Database, a: string, b: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS found FROM user_blocks WHERE (blocker = ? AND blocked = ?) OR (blocker = ? AND blocked = ?) LIMIT 1")
    .bind(a, b, b, a)
    .first();
  return Boolean(row);
}

// Bloquea y cierra las postulaciones activas entre las dos personas: las de la otra persona a mis changas
// quedan descartadas y las mías a las suyas se retiran.
export async function blockUser(db: D1Database, blocker: string, target: string, nowSeconds: number): Promise<BlockResult> {
  const blocked = target.toLowerCase();
  if (!ADDRESS.test(blocked)) return { ok: false, status: 400, error: "address is not valid" };
  if (blocked === blocker) return { ok: false, status: 400, error: "you cannot block yourself" };
  const count = await db.prepare("SELECT COUNT(*) AS total FROM user_blocks WHERE blocker = ?").bind(blocker).first<{ total: number }>();
  if ((count?.total ?? 0) >= MAX_BLOCKS_PER_USER) return { ok: false, status: 429, error: "too many blocked users" };
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO user_blocks (blocker, blocked, created_at) VALUES (?, ?, ?)").bind(blocker, blocked, nowSeconds),
    db
      .prepare(
        `UPDATE applications SET status = 'dismissed', updated_at = ?
         WHERE status = 'active' AND applicant = ? AND changa_id IN (SELECT id FROM changas WHERE owner = ?)`,
      )
      .bind(nowSeconds, blocked, blocker),
    db
      .prepare(
        `UPDATE applications SET status = 'withdrawn', updated_at = ?
         WHERE status = 'active' AND applicant = ? AND changa_id IN (SELECT id FROM changas WHERE owner = ?)`,
      )
      .bind(nowSeconds, blocker, blocked),
  ]);
  return { ok: true };
}

export async function unblockUser(db: D1Database, blocker: string, target: string): Promise<boolean> {
  const result = await db.prepare("DELETE FROM user_blocks WHERE blocker = ? AND blocked = ?").bind(blocker, target.toLowerCase()).run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function listBlocks(db: D1Database, blocker: string) {
  const { results } = await db
    .prepare(
      `SELECT b.blocked AS address, b.created_at AS created_at, p.name AS name
       FROM user_blocks b LEFT JOIN profiles p ON p.address = b.blocked WHERE b.blocker = ? ORDER BY b.created_at DESC LIMIT ?`,
    )
    .bind(blocker, MAX_BLOCKS_PER_USER)
    .all<{ address: string; created_at: number; name: string | null }>();
  return results.map((row) => ({ address: row.address, name: row.name, createdAt: row.created_at }));
}

// Quien publicó descarta una postulación activa (sin bloquear): se cierra el chat y esa persona no puede volver a postularse a esa changa.
export async function dismissApplication(db: D1Database, owner: string, applicationId: number, nowSeconds: number): Promise<{ ok: true; applicant: string } | { ok: false; status: 403 | 404 | 409; error: string }> {
  const row = await db
    .prepare(
      `SELECT a.applicant AS applicant, a.status AS status, c.owner AS owner, p.payer AS coordinator
       FROM applications a JOIN changas c ON c.id = a.changa_id LEFT JOIN order_parties p ON p.order_id = c.order_id WHERE a.id = ?`,
    )
    .bind(applicationId)
    .first<{ applicant: string; status: string; owner: string; coordinator: string | null }>();
  if (!row) return { ok: false, status: 404, error: "application not found" };
  if ((row.coordinator ?? row.owner) !== owner) return { ok: false, status: 403, error: "only the owner can dismiss an application" };
  if (row.status !== "active") return { ok: false, status: 409, error: "the application is not active" };
  await db.prepare("UPDATE applications SET status = 'dismissed', updated_at = ? WHERE id = ? AND status = 'active'").bind(nowSeconds, applicationId).run();
  return { ok: true, applicant: row.applicant };
}
