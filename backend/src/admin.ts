export const REASON_MIN = 3;
export const REASON_MAX = 300;

export type ReasonResult = { ok: true; reason: string } | { ok: false; error: string };

export function parseReason(value: unknown): ReasonResult {
  if (typeof value !== "string") return { ok: false, error: "a reason is required" };
  const reason = value.trim();
  if (reason.length < REASON_MIN || reason.length > REASON_MAX || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(reason)) {
    return { ok: false, error: `the reason must have between ${REASON_MIN} and ${REASON_MAX} characters` };
  }
  return { ok: true, reason };
}

export function logAction(db: D1Database, admin: string, action: string, target: string, reason: string, nowSeconds: number) {
  return db
    .prepare("INSERT INTO admin_log (admin, action, target, reason, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(admin, action, target, reason, nowSeconds);
}

export async function summary(db: D1Database, nowSeconds: number) {
  const [changas, profiles, extra] = await db.batch([
    db.prepare("SELECT status, COUNT(*) AS total, COALESCE(SUM(CAST(amount AS INTEGER)), 0) AS volume FROM changas WHERE order_id IS NOT NULL GROUP BY status"),
    db.prepare("SELECT selfie_status AS status, COUNT(*) AS total FROM profiles GROUP BY selfie_status"),
    db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM applications WHERE status = 'active') AS activeApplications,
         (SELECT COUNT(*) FROM agreements WHERE status = 'pending' AND expiry >= ?) AS pendingAgreements,
         (SELECT COUNT(*) FROM relay_log WHERE created_at >= ?) AS relaysLastHour,
         (SELECT COUNT(*) FROM relay_log WHERE created_at >= ?) AS relaysLastDay,
         (SELECT COUNT(*) FROM notifications WHERE sent_at IS NULL) AS queuedNotifications,
         (SELECT COUNT(*) FROM profiles WHERE created_at >= ?) AS newUsersLastWeek,
         (SELECT MAX(block_number) FROM events) AS lastEventBlock,
         (SELECT MAX(block_timestamp) FROM events) AS lastEventAt`,
    ).bind(nowSeconds, nowSeconds - 3600, nowSeconds - 86400, nowSeconds - 7 * 86400),
  ]);
  const volumeStatuses = new Set(["open", "agreed", "delivered", "disputed"]);
  const rows = (changas!.results ?? []) as { status: string; total: number; volume: number }[];
  return {
    changasByStatus: Object.fromEntries(rows.map((row) => [row.status, row.total])),
    escrowVolume: rows.filter((row) => volumeStatuses.has(row.status)).reduce((sum, row) => sum + row.volume, 0),
    usersBySelfie: Object.fromEntries(((profiles!.results ?? []) as { status: string; total: number }[]).map((row) => [row.status, row.total])),
    ...((extra!.results ?? [])[0] as object),
  };
}

export async function listChangas(db: D1Database, filters: { status?: string; before?: number; limit: number }) {
  const where: string[] = ["order_id IS NOT NULL"];
  const values: (string | number)[] = [];
  if (filters.status) {
    where.push("status = ?");
    values.push(filters.status);
  }
  if (filters.before) {
    where.push("id < ?");
    values.push(filters.before);
  }
  const { results } = await db
    .prepare(
      `SELECT id, owner, spec_hash, order_id, amount, status, hidden, created_at, json_extract(spec, '$.title') AS title, modality
       FROM changas WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ?`,
    )
    .bind(...values, filters.limit)
    .all<{ id: number; owner: string; spec_hash: string; order_id: number; amount: string | null; status: string; hidden: number; created_at: number; title: string; modality: string }>();
  return results.map((row) => ({
    id: row.id,
    owner: row.owner,
    specHash: row.spec_hash,
    orderId: row.order_id,
    amount: row.amount,
    status: row.status,
    hidden: row.hidden === 1,
    createdAt: row.created_at,
    title: row.title,
    modality: row.modality,
  }));
}

export async function setHidden(db: D1Database, id: number, hidden: boolean): Promise<boolean> {
  const result = await db.prepare("UPDATE changas SET hidden = ? WHERE id = ? AND order_id IS NOT NULL").bind(hidden ? 1 : 0, id).run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function listUsers(db: D1Database, filters: { query?: string; limit: number; before?: string }) {
  const where: string[] = [];
  const values: (string | number)[] = [];
  if (filters.query) {
    const like = `%${filters.query.toLowerCase().replace(/[%_]/g, "")}%`;
    where.push("(LOWER(name) LIKE ? OR address LIKE ?)");
    values.push(like, like);
  }
  if (filters.before) {
    where.push("address < ?");
    values.push(filters.before);
  }
  const { results } = await db
    .prepare(
      `SELECT p.address, p.name, p.selfie_status, p.created_at,
              (SELECT COUNT(*) FROM changas c WHERE c.owner = p.address AND c.order_id IS NOT NULL) AS published,
              (SELECT COUNT(*) FROM applications a WHERE a.applicant = p.address) AS applications
       FROM profiles p ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY p.address DESC LIMIT ?`,
    )
    .bind(...values, filters.limit)
    .all<{ address: string; name: string; selfie_status: string; created_at: number; published: number; applications: number }>();
  return results.map((row) => ({
    address: row.address,
    name: row.name,
    selfieStatus: row.selfie_status,
    createdAt: row.created_at,
    published: row.published,
    applications: row.applications,
  }));
}

export async function listLog(db: D1Database, limit: number, before?: number) {
  const { results } = await db
    .prepare(`SELECT id, admin, action, target, reason, created_at FROM admin_log ${before ? "WHERE id < ?" : ""} ORDER BY id DESC LIMIT ?`)
    .bind(...(before ? [before, limit] : [limit]))
    .all<{ id: number; admin: string; action: string; target: string; reason: string; created_at: number }>();
  return results.map((row) => ({ id: row.id, admin: row.admin, action: row.action, target: row.target, reason: row.reason, createdAt: row.created_at }));
}

export async function emergencyCases(db: D1Database, limit: number) {
  const { results } = await db
    .prepare(
      `SELECT e.case_id AS case_id, oc.order_id AS order_id, e.block_timestamp AS since, json_extract(e.args, '$.reason') AS reason
       FROM events e JOIN order_cases oc ON oc.case_id = e.case_id
       WHERE e.name = 'NeedsEmergencyResolution'
         AND NOT EXISTS (
           SELECT 1 FROM events x WHERE x.case_id = e.case_id AND x.name = 'EmergencyResolved'
             AND (x.block_number > e.block_number OR (x.block_number = e.block_number AND x.log_index > e.log_index)))
       ORDER BY e.case_id DESC LIMIT ?`,
    )
    .bind(limit)
    .all<{ case_id: number; order_id: number; since: number; reason: string | null }>();
  return results.map((row) => ({ caseId: row.case_id, orderId: row.order_id, since: row.since, reason: row.reason }));
}
