import { parseReason } from "./admin";

export const REPORT_KINDS = new Set(["changa", "user"]);
export const MAX_OPEN_PER_REPORTER = 20;
const ADDRESS = /^0x[0-9a-f]{40}$/;

export type ReportResult = { ok: true } | { ok: false; status: 400 | 404 | 409 | 429; error: string };

export async function createReport(db: D1Database, reporter: string, body: unknown, nowSeconds: number): Promise<ReportResult> {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (typeof raw.kind !== "string" || !REPORT_KINDS.has(raw.kind)) return { ok: false, status: 400, error: "kind must be changa or user" };
  const reason = parseReason(raw.reason);
  if (!reason.ok) return reason.error ? { ok: false, status: 400, error: reason.error } : { ok: false, status: 400, error: "invalid reason" };
  const target = typeof raw.target === "string" ? raw.target.toLowerCase() : "";

  if (raw.kind === "user") {
    if (!ADDRESS.test(target)) return { ok: false, status: 400, error: "target must be an address" };
    if (target === reporter) return { ok: false, status: 400, error: "you cannot report yourself" };
    const exists = await db.prepare("SELECT 1 AS found FROM profiles WHERE address = ?").bind(target).first();
    if (!exists) return { ok: false, status: 404, error: "user not found" };
  } else {
    if (!/^[1-9][0-9]{0,9}$/.test(target)) return { ok: false, status: 400, error: "target must be a changa id" };
    const exists = await db.prepare("SELECT 1 AS found FROM changas WHERE id = ? AND order_id IS NOT NULL").bind(Number(target)).first();
    if (!exists) return { ok: false, status: 404, error: "changa not found" };
  }

  const open = await db.prepare("SELECT COUNT(*) AS total FROM reports WHERE reporter = ? AND status = 'open'").bind(reporter).first<{ total: number }>();
  if ((open?.total ?? 0) >= MAX_OPEN_PER_REPORTER) return { ok: false, status: 429, error: "too many open reports" };
  const result = await db
    .prepare("INSERT OR IGNORE INTO reports (reporter, kind, target, reason, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(reporter, raw.kind, target, reason.reason, nowSeconds)
    .run();
  return (result.meta?.changes ?? 0) > 0 ? { ok: true } : { ok: false, status: 409, error: "you already reported this" };
}

export async function listReports(db: D1Database, status: string, limit: number) {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.reporter, r.kind, r.target, r.reason, r.status, r.created_at,
              CASE WHEN r.kind = 'changa' THEN (SELECT json_extract(spec, '$.title') FROM changas WHERE id = CAST(r.target AS INTEGER))
                   ELSE (SELECT name FROM profiles WHERE address = r.target) END AS title,
              (SELECT COUNT(*) FROM reports x WHERE x.kind = r.kind AND x.target = r.target) AS total
       FROM reports r WHERE r.status = ? ORDER BY r.id DESC LIMIT ?`,
    )
    .bind(status, limit)
    .all<{ id: number; reporter: string; kind: string; target: string; reason: string; status: string; created_at: number; title: string | null; total: number }>();
  return results.map((row) => ({ id: row.id, reporter: row.reporter, kind: row.kind, target: row.target, reason: row.reason, status: row.status, createdAt: row.created_at, title: row.title, total: row.total }));
}

export async function resolveReport(db: D1Database, id: number, admin: string, resolution: string, nowSeconds: number): Promise<{ kind: string; target: string } | null> {
  const row = await db.prepare("SELECT kind, target FROM reports WHERE id = ? AND status = 'open'").bind(id).first<{ kind: string; target: string }>();
  if (!row) return null;
  await db.prepare("UPDATE reports SET status = 'resolved', resolved_by = ?, resolved_at = ?, resolution = ? WHERE kind = ? AND target = ? AND status = 'open'").bind(admin, nowSeconds, resolution, row.kind, row.target).run();
  return row;
}
