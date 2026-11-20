export interface StreamEvent {
  block_number: number;
  log_index: number;
  name: string;
  order_id: number | null;
  case_id: number | null;
  args: string | null;
}

export type EventHandler = (db: D1Database, events: StreamEvent[]) => D1PreparedStatement[];

export const SYNC_KEY = "events_synced_pos";
const POSITION_BASE = 1_000_000;
const WRITE_BATCH = 50;

export async function runStatements(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  for (let start = 0; start < statements.length; start += WRITE_BATCH) {
    await db.batch(statements.slice(start, start + WRITE_BATCH));
  }
}

// ¿Hay eventos guardados que todavía no se procesaron? Una sola lectura por clave primaria.
export async function hasUnprocessedEvents(db: D1Database): Promise<boolean> {
  const mark = await db.prepare("SELECT value FROM meta WHERE key = ?").bind(SYNC_KEY).first<{ value: number }>();
  const after = mark ? mark.value : -1;
  const afterBlock = Math.floor(after / POSITION_BASE);
  const afterIndex = after - afterBlock * POSITION_BASE;
  const row = await db.prepare("SELECT 1 AS found FROM events WHERE (block_number, log_index) > (?, ?) LIMIT 1").bind(afterBlock, afterIndex).first<{ found: number }>();
  return row !== null;
}

export async function processEvents(db: D1Database, handlers: EventHandler[], scanLimit: number): Promise<number> {
  const mark = await db.prepare("SELECT value FROM meta WHERE key = ?").bind(SYNC_KEY).first<{ value: number }>();
  const after = mark ? mark.value : -1;
  const afterBlock = Math.floor(after / POSITION_BASE);
  const afterIndex = after - afterBlock * POSITION_BASE;
  const { results } = await db
    .prepare(
      `SELECT block_number, log_index, name, order_id, case_id,
              CASE WHEN name IN ('OrderCreated', 'OrderToppedUp', 'OrderAgreed', 'OrderSettled', 'JuryDrawn', 'SeedCommitted', 'SeedRevealed', 'VoteCommitted', 'VoteRevealed', 'OrderReserved', 'CaseOpened', 'GroupCreated', 'CoordinatorChanged', 'Contributed', 'ContributionWithdrawn', 'OrderCancelled', 'DisputeOpened', 'DisputeResolved', 'MilestoneDelivered', 'MilestonePaid', 'ProgressReported', 'OrderTerminated', 'OrderAbandoned', 'ReceiptClaimed') THEN args END AS args
       FROM events
       WHERE (block_number, log_index) > (?, ?)
       ORDER BY block_number, log_index LIMIT ?`,
    )
    .bind(afterBlock, afterIndex, scanLimit)
    .all<StreamEvent>();
  if (!results.length) return 0;

  const last = results[results.length - 1];
  const statements = [
    ...handlers.flatMap((handler) => handler(db, results)),
    db
      .prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(SYNC_KEY, last.block_number * POSITION_BASE + last.log_index),
  ];
  await runStatements(db, statements);
  return results.length;
}
