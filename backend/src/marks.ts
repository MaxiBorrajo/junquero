import type { Hex } from "viem";

// Cuando una changa recibe su primera postulación, el servidor avisa al contrato (markApplicant) para que
// cancelarla deje de ser gratis. La orden queda en cola hasta que el contrato la tenga marcada.

export const MARK_BATCH = 20;
export const MARK_MAX_ATTEMPTS = 6;
export const MARK_RETRY_SECONDS = 60;

export type MarkAttempt = { sent: true; txHash: Hex } | { sent: false };

export interface MarkChain {
  hadApplicants(ids: number[]): Promise<(boolean | null)[]>;
  mark(id: number): Promise<MarkAttempt>;
}

export function enqueueMark(db: D1Database, changaId: number): D1PreparedStatement {
  return db
    .prepare("INSERT OR IGNORE INTO pending_marks (order_id) SELECT order_id FROM changas WHERE id = ? AND order_id IS NOT NULL")
    .bind(changaId);
}

export async function runMarks(db: D1Database, chain: MarkChain, nowSeconds: number, limit = MARK_BATCH): Promise<{ marked: number; waiting: number; dropped: number }> {
  const { results } = await db
    .prepare("SELECT order_id, attempts FROM pending_marks WHERE next_at <= ? ORDER BY order_id LIMIT ?")
    .bind(nowSeconds, limit)
    .all<{ order_id: number; attempts: number }>();
  if (!results.length) return { marked: 0, waiting: 0, dropped: 0 };

  const already = await chain.hadApplicants(results.map((row) => row.order_id));
  let marked = 0;
  let waiting = 0;
  let dropped = 0;
  const statements: D1PreparedStatement[] = [];
  for (const [index, row] of results.entries()) {
    if (already[index] === true) {
      statements.push(db.prepare("DELETE FROM pending_marks WHERE order_id = ?").bind(row.order_id));
      marked += 1;
      continue;
    }
    const outcome = await chain.mark(row.order_id).catch((): MarkAttempt => ({ sent: false }));
    if (outcome.sent) {
      waiting += 1;
      statements.push(
        db.prepare("UPDATE pending_marks SET attempts = attempts + 1, next_at = ?, tx_hash = ? WHERE order_id = ?").bind(nowSeconds + MARK_RETRY_SECONDS, outcome.txHash, row.order_id),
      );
      continue;
    }
    if (row.attempts + 1 >= MARK_MAX_ATTEMPTS) {
      dropped += 1;
      statements.push(db.prepare("DELETE FROM pending_marks WHERE order_id = ?").bind(row.order_id));
    } else {
      statements.push(db.prepare("UPDATE pending_marks SET attempts = attempts + 1, next_at = ? WHERE order_id = ?").bind(nowSeconds + MARK_RETRY_SECONDS, row.order_id));
    }
  }
  if (statements.length) await db.batch(statements);
  return { marked, waiting, dropped };
}
