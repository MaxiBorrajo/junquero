import { isAddress } from "viem";
import type { EventHandler, StreamEvent } from "./eventStream";
import { parseMilestones, type Milestone, type Spec } from "./spec";

export const MAX_ACTIVE_PER_CHANGA = 50;
export const MAX_ACTIVE_PER_APPLICANT = 30;
const HEX32 = /^0x[0-9a-f]{64}$/;
const CLOSING_EVENTS = new Set(["OrderCancelled", "OrderSettled", "OrderTerminated", "DisputeResolved"]);

export interface ApplicationInput {
  amount: string | null;
  message: string;
  attachments: { hash: string; name: string; mime: string; size: number }[];
  plan: { milestones: Milestone[]; advance: boolean } | null;
}

export type ApplicationResult = { ok: true; value: ApplicationInput } | { ok: false; error: string };

export interface ApplicationRow {
  id: number;
  changa_id: number;
  applicant: string;
  amount: string | null;
  message: string;
  attachments: string;
  plan: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface ApplicantProfileRow {
  name: string | null;
  selfie_status: string | null;
  work_lat_e3: number | null;
  work_lng_e3: number | null;
}

export function validateApplication(input: unknown): ApplicationResult {
  if (typeof input !== "object" || input === null) return { ok: false, error: "application must be an object" };
  const raw = input as Record<string, unknown>;

  let amount: string | null = null;
  if (raw.amount !== undefined && raw.amount !== null) {
    if (typeof raw.amount !== "string" || !/^[1-9][0-9]{0,38}$/.test(raw.amount)) {
      return { ok: false, error: "amount must be a positive integer in token units" };
    }
    amount = raw.amount;
  }

  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (raw.message !== undefined && typeof raw.message !== "string") return { ok: false, error: "message must be text" };
  if (message.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(message)) {
    return { ok: false, error: "message must have at most 500 characters" };
  }

  const attachments = raw.attachments ?? [];
  if (!Array.isArray(attachments) || attachments.length > 3) return { ok: false, error: "attachments must be a list of at most 3" };
  const parsed: ApplicationInput["attachments"] = [];
  for (const item of attachments as Record<string, unknown>[]) {
    const hash = typeof item?.hash === "string" ? item.hash.toLowerCase() : "";
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const mime = typeof item?.mime === "string" ? item.mime.trim() : "";
    const size = item?.size;
    if (!HEX32.test(hash) || !name || name.length > 120 || mime.length < 3 || mime.length > 100) return { ok: false, error: "invalid attachment" };
    if (!Number.isInteger(size) || (size as number) < 1 || (size as number) > 100 * 1024 * 1024) return { ok: false, error: "invalid attachment" };
    parsed.push({ hash, name, mime, size: size as number });
  }
  let plan: ApplicationInput["plan"] = null;
  if (raw.plan !== undefined && raw.plan !== null) {
    const body = raw.plan as Record<string, unknown>;
    if (typeof body !== "object" || Object.keys(body).some((key) => key !== "milestones" && key !== "advance")) return { ok: false, error: "invalid plan" };
    const milestones = parseMilestones(body.milestones);
    if (typeof milestones === "string") return { ok: false, error: milestones };
    if (body.advance !== undefined && typeof body.advance !== "boolean") return { ok: false, error: "advance must be true or false" };
    plan = { milestones, advance: body.advance === true };
  }
  return { ok: true, value: { amount, message, attachments: parsed, plan } };
}

export const presentApplication = (row: ApplicationRow) => ({
  id: row.id,
  changaId: row.changa_id,
  applicant: row.applicant,
  amount: row.amount,
  message: row.message,
  attachments: JSON.parse(row.attachments),
  plan: row.plan ? (JSON.parse(row.plan) as ApplicationInput["plan"]) : null,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export type SubmitOutcome =
  | { ok: true; created: boolean; row: ApplicationRow }
  | { ok: false; status: 400 | 403 | 404 | 409 | 429; error: string };

export async function submitApplication(
  db: D1Database,
  changaId: number,
  applicant: string,
  input: ApplicationInput,
  nowSeconds: number,
  requireVerified: boolean,
): Promise<SubmitOutcome> {
  const changa = await db
    .prepare("SELECT owner, status, order_id, spec, amount FROM changas WHERE id = ?")
    .bind(changaId)
    .first<{ owner: string; status: string; order_id: number | null; spec: string; amount: string | null }>();
  if (!changa || changa.order_id === null) return { ok: false, status: 404, error: "changa not found" };
  if (changa.status !== "open") return { ok: false, status: 409, error: "changa is not open" };
  if (changa.owner === applicant) return { ok: false, status: 403, error: "you cannot apply to your own changa" };

  if (input.plan) {
    const spec = JSON.parse(changa.spec) as Spec;
    const total = input.plan.milestones.reduce((sum, item) => sum + BigInt(item.amount), 0n);
    if (!spec.milestones || changa.amount === null || total !== BigInt(changa.amount)) {
      return { ok: false, status: 400, error: "the proposed plan must add up to the published amount" };
    }
    if (input.amount !== null && BigInt(input.amount) !== BigInt(changa.amount)) return { ok: false, status: 400, error: "a plan cannot be combined with a different amount" };
  }

  if (requireVerified) {
    const profile = await db.prepare("SELECT selfie_status FROM profiles WHERE address = ?").bind(applicant).first<{ selfie_status: string }>();
    if (profile?.selfie_status !== "approved") return { ok: false, status: 403, error: "selfie verification required" };
  }

  const existing = await db
    .prepare("SELECT id, status FROM applications WHERE changa_id = ? AND applicant = ?")
    .bind(changaId, applicant)
    .first<{ id: number; status: string }>();
  const reactivating = !existing || existing.status !== "active";

  if (reactivating) {
    const counts = await db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM applications WHERE changa_id = ? AND status = 'active') AS onChanga,
                (SELECT COUNT(*) FROM applications WHERE applicant = ? AND status = 'active') AS byApplicant`,
      )
      .bind(changaId, applicant)
      .first<{ onChanga: number; byApplicant: number }>();
    if ((counts?.onChanga ?? 0) >= MAX_ACTIVE_PER_CHANGA) return { ok: false, status: 429, error: "this changa has too many applications" };
    if ((counts?.byApplicant ?? 0) >= MAX_ACTIVE_PER_APPLICANT) return { ok: false, status: 429, error: "too many active applications" };
  }

  await db
    .prepare(
      `INSERT INTO applications (changa_id, applicant, amount, message, attachments, plan, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
       ON CONFLICT(changa_id, applicant) DO UPDATE SET amount = excluded.amount, message = excluded.message,
         attachments = excluded.attachments, plan = excluded.plan, status = 'active', updated_at = excluded.updated_at`,
    )
    .bind(changaId, applicant, input.amount, input.message, JSON.stringify(input.attachments), input.plan ? JSON.stringify(input.plan) : null, nowSeconds, nowSeconds)
    .run();
  const row = await db
    .prepare("SELECT * FROM applications WHERE changa_id = ? AND applicant = ?")
    .bind(changaId, applicant)
    .first<ApplicationRow>();
  return { ok: true, created: !existing, row: row! };
}

export async function withdrawApplication(db: D1Database, changaId: number, applicant: string, nowSeconds: number): Promise<boolean> {
  const result = await db
    .prepare("UPDATE applications SET status = 'withdrawn', updated_at = ? WHERE changa_id = ? AND applicant = ? AND status = 'active'")
    .bind(nowSeconds, changaId, applicant)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function listForOwner(db: D1Database, changaId: number, owner: string) {
  const changa = await db
    .prepare("SELECT c.owner AS owner, p.payer AS coordinator FROM changas c LEFT JOIN order_parties p ON p.order_id = c.order_id WHERE c.id = ?")
    .bind(changaId)
    .first<{ owner: string; coordinator: string | null }>();
  if (!changa) return { status: 404 as const };
  if ((changa.coordinator ?? changa.owner) !== owner) return { status: 403 as const };
  const { results } = await db
    .prepare(
      `SELECT a.*, p.name, p.selfie_status, p.work_lat_e3, p.work_lng_e3
       FROM applications a LEFT JOIN profiles p ON p.address = a.applicant
       WHERE a.changa_id = ? AND a.status IN ('active', 'chosen') ORDER BY a.id LIMIT ?`,
    )
    .bind(changaId, MAX_ACTIVE_PER_CHANGA + 1)
    .all<ApplicationRow & ApplicantProfileRow>();
  return { status: 200 as const, rows: results };
}

export const presentForOwner = (row: ApplicationRow & ApplicantProfileRow) => ({
  ...presentApplication(row),
  profile: row.name
    ? {
        name: row.name,
        verified: row.selfie_status === "approved",
        zone: { lat: Math.round((row.work_lat_e3 ?? 0) / 10) / 100, lng: Math.round((row.work_lng_e3 ?? 0) / 10) / 100 },
      }
    : null,
});

export async function listMine(db: D1Database, applicant: string, limit: number) {
  const { results } = await db
    .prepare(
      `SELECT a.*, c.spec_hash, c.order_id, c.status AS changa_status
       FROM applications a JOIN changas c ON c.id = a.changa_id
       WHERE a.applicant = ? ORDER BY a.id DESC LIMIT ?`,
    )
    .bind(applicant, limit)
    .all<ApplicationRow & { spec_hash: string; order_id: number | null; changa_status: string }>();
  return results.map((row) => ({
    ...presentApplication(row),
    changa: { specHash: row.spec_hash, orderId: row.order_id, status: row.changa_status },
  }));
}

export const applicationsHandler: EventHandler = (db: D1Database, events: StreamEvent[]) => {
  const statements: D1PreparedStatement[] = [];
  for (const event of events) {
    if (event.order_id === null) continue;
    const changaOf = "(SELECT id FROM changas WHERE order_id = ?)";
    if (event.name === "OrderAgreed" && event.args) {
      const payee = (JSON.parse(event.args) as { payee?: string }).payee;
      if (!payee || !isAddress(payee)) continue;
      statements.push(
        db
          .prepare(
            `UPDATE applications SET status = CASE WHEN applicant = ? THEN 'chosen' ELSE 'closed' END
             WHERE changa_id = ${changaOf} AND status IN ('active', 'chosen')`,
          )
          .bind(payee.toLowerCase(), event.order_id),
      );
    } else if (CLOSING_EVENTS.has(event.name)) {
      statements.push(
        db
          .prepare(`UPDATE applications SET status = 'closed' WHERE changa_id = ${changaOf} AND status = 'active'`)
          .bind(event.order_id),
      );
    }
  }
  return statements;
};
