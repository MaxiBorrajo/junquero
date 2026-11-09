export interface ActivitySummary {
  earned: string;
  spent: string;
  toCollect: string;
  inEscrow: string;
  settledAsPayee: number;
  settledAsPayer: number;
}

const OPEN_STATES = "('agreed','delivered','disputed')";

export async function activitySummary(db: D1Database, address: string): Promise<ActivitySummary> {
  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN p.payee = ?1 AND c.status = 'settled' THEN c.amount_micro END), 0) AS earned,
         COALESCE(SUM(CASE WHEN p.payer = ?1 AND c.status = 'settled' THEN c.amount_micro END), 0) AS spent,
         COALESCE(SUM(CASE WHEN p.payee = ?1 AND c.status IN ${OPEN_STATES} THEN c.amount_micro END), 0) AS to_collect,
         COALESCE(SUM(CASE WHEN p.payer = ?1 AND c.status IN ${OPEN_STATES} THEN c.amount_micro END), 0) AS in_escrow,
         COALESCE(SUM(CASE WHEN p.payee = ?1 AND c.status = 'settled' THEN 1 END), 0) AS settled_payee,
         COALESCE(SUM(CASE WHEN p.payer = ?1 AND c.status = 'settled' THEN 1 END), 0) AS settled_payer
       FROM order_parties p JOIN changas c ON c.order_id = p.order_id
       WHERE p.payee = ?1 OR p.payer = ?1`,
    )
    .bind(address)
    .first<{ earned: number; spent: number; to_collect: number; in_escrow: number; settled_payee: number; settled_payer: number }>();
  return {
    earned: String(row?.earned ?? 0),
    spent: String(row?.spent ?? 0),
    toCollect: String(row?.to_collect ?? 0),
    inEscrow: String(row?.in_escrow ?? 0),
    settledAsPayee: row?.settled_payee ?? 0,
    settledAsPayer: row?.settled_payer ?? 0,
  };
}

export interface NotificationItem {
  id: number;
  kind: string;
  ref: string;
  createdAt: number;
}

export const NOTIFICATIONS_LIMIT = 50;

export async function listNotifications(db: D1Database, address: string, nowSeconds: number): Promise<NotificationItem[]> {
  const { results } = await db
    .prepare("SELECT id, kind, ref, created_at FROM notifications WHERE address = ? AND due_at <= ? ORDER BY created_at DESC, id DESC LIMIT ?")
    .bind(address, nowSeconds, NOTIFICATIONS_LIMIT)
    .all<{ id: number; kind: string; ref: string; created_at: number }>();
  return results.map((row) => ({ id: row.id, kind: row.kind, ref: row.ref, createdAt: row.created_at }));
}
