import type { Hex } from "viem";

export type TaskKind = "order" | "case";

export interface OrderState {
  status: number;
  hasMilestones: boolean;
}

export interface CaseState {
  phase: number;
}

export type AttemptResult = { sent: true; txHash: Hex } | { sent: false; retryAt: number | null };

export interface TaskChain {
  readOrders(ids: number[]): Promise<(OrderState | null)[]>;
  readCases(ids: number[]): Promise<(CaseState | null)[]>;
  attempt(kind: TaskKind, action: string, id: number): Promise<AttemptResult>;
}

export interface TaskOptions {
  batchSize: number;
  maxSends: number;
  eventScanLimit: number;
  sentGraceSeconds: number;
  unreadableRetrySeconds: number;
}

export interface TaskResult {
  checked: number;
  closed: number;
  sent: { kind: TaskKind; id: number; action: string; txHash: Hex }[];
}

export const NEVER = 9_999_999_999;
export const ORDER_STATUS = { Agreed: 3, Delivered: 4, Settled: 6, Cancelled: 7, Funding: 8 };
export const CASE_PHASE = { Response: 1, Seed: 2, Vote: 3, Resolved: 5, Decided: 6 };

const QUIET_EVENTS = new Set(["SeedCommitted", "SeedRevealed", "VoteCommitted", "JurorPaid", "JurorSlashed", "Recused"]);
const SYNC_KEY = "events_synced_pos";
const POSITION_BASE = 1_000_000;
const WRITE_BATCH = 50;

export function orderActions(state: OrderState): string[] {
  if (state.status === ORDER_STATUS.Agreed) return state.hasMilestones ? ["autoReleaseMilestone", "reclaim"] : ["reclaim"];
  if (state.status === ORDER_STATUS.Delivered) return [state.hasMilestones ? "autoReleaseMilestone" : "autoRelease"];
  if (state.status === ORDER_STATUS.Funding) return ["refundFunding"];
  return [];
}

export function caseActions(state: CaseState): string[] {
  if (state.phase === CASE_PHASE.Response) return ["resolveByDefault"];
  if (state.phase === CASE_PHASE.Seed) return ["draw"];
  if (state.phase === CASE_PHASE.Vote) return ["finalize"];
  if (state.phase === CASE_PHASE.Decided) return ["execute"];
  return [];
}

export const isOrderClosed = (state: OrderState) =>
  state.status === ORDER_STATUS.Settled || state.status === ORDER_STATUS.Cancelled;

export const isCaseClosed = (state: CaseState) => state.phase === CASE_PHASE.Resolved;

interface EventRow {
  block_number: number;
  log_index: number;
  name: string;
  order_id: number | null;
  case_id: number | null;
}

async function chunked(db: D1Database, statements: D1PreparedStatement[]) {
  for (let start = 0; start < statements.length; start += WRITE_BATCH) {
    await db.batch(statements.slice(start, start + WRITE_BATCH));
  }
}

export async function syncWatched(db: D1Database, scanLimit: number): Promise<void> {
  const mark = await db.prepare("SELECT value FROM meta WHERE key = ?").bind(SYNC_KEY).first<{ value: number }>();
  const after = mark ? mark.value : -1;
  const afterBlock = Math.floor(after / POSITION_BASE);
  const afterIndex = after - afterBlock * POSITION_BASE;
  const { results } = await db
    .prepare(
      `SELECT block_number, log_index, name, order_id, case_id FROM events
       WHERE block_number > ? OR (block_number = ? AND log_index > ?)
       ORDER BY block_number, log_index LIMIT ?`,
    )
    .bind(afterBlock, afterBlock, afterIndex, scanLimit)
    .all<EventRow>();
  if (!results.length) return;
  const last = results[results.length - 1];

  const added = new Set<string>();
  const touched = new Set<string>();
  for (const row of results) {
    if (row.name === "OrderCreated" && row.order_id !== null) added.add(`order:${row.order_id}`);
    if (row.name === "CaseOpened" && row.case_id !== null) added.add(`case:${row.case_id}`);
    if (QUIET_EVENTS.has(row.name)) continue;
    if (row.order_id !== null) touched.add(`order:${row.order_id}`);
    if (row.case_id !== null) touched.add(`case:${row.case_id}`);
  }

  const split = (key: string): [string, number] => {
    const [kind, id] = key.split(":");
    return [kind, Number(id)];
  };
  const statements = [
    ...[...added].map((key) =>
      db.prepare("INSERT OR IGNORE INTO watched (kind, id) VALUES (?, ?)").bind(...split(key)),
    ),
    ...[...touched].map((key) =>
      db.prepare("UPDATE watched SET next_check_at = 0 WHERE kind = ? AND id = ? AND closed = 0").bind(...split(key)),
    ),
    db
      .prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(SYNC_KEY, last.block_number * POSITION_BASE + last.log_index),
  ];
  await chunked(db, statements);
}

async function dueIds(db: D1Database, kind: TaskKind, now: number, limit: number): Promise<number[]> {
  const { results } = await db
    .prepare("SELECT id FROM watched WHERE kind = ? AND closed = 0 AND next_check_at <= ? ORDER BY next_check_at, id LIMIT ?")
    .bind(kind, now, limit)
    .all<{ id: number }>();
  return results.map((row) => row.id);
}

const schedule = (db: D1Database, kind: TaskKind, id: number, closed: boolean, nextCheckAt: number) =>
  db
    .prepare("UPDATE watched SET closed = ?, next_check_at = ? WHERE kind = ? AND id = ?")
    .bind(closed ? 1 : 0, nextCheckAt, kind, id);

interface Item {
  kind: TaskKind;
  id: number;
  actions: string[];
  closed: boolean;
  unreadable: boolean;
}

export async function runTasks(
  db: D1Database,
  chain: TaskChain,
  options: TaskOptions,
  nowSeconds: number,
): Promise<TaskResult> {
  await syncWatched(db, options.eventScanLimit);
  const result: TaskResult = { checked: 0, closed: 0, sent: [] };

  const orderIds = await dueIds(db, "order", nowSeconds, options.batchSize);
  const caseIds = await dueIds(db, "case", nowSeconds, options.batchSize);
  if (!orderIds.length && !caseIds.length) return result;

  const orders = orderIds.length ? await chain.readOrders(orderIds) : [];
  const cases = caseIds.length ? await chain.readCases(caseIds) : [];

  const items: Item[] = [
    ...orders.map((state, index): Item => ({
      kind: "order",
      id: orderIds[index],
      actions: state ? orderActions(state) : [],
      closed: state ? isOrderClosed(state) : false,
      unreadable: state === null,
    })),
    ...cases.map((state, index): Item => ({
      kind: "case",
      id: caseIds[index],
      actions: state ? caseActions(state) : [],
      closed: state ? isCaseClosed(state) : false,
      unreadable: state === null,
    })),
  ];
  result.checked = items.length;

  const updates: D1PreparedStatement[] = [];
  for (const item of items) {
    if (item.closed) {
      result.closed += 1;
      updates.push(schedule(db, item.kind, item.id, true, NEVER));
      continue;
    }
    if (item.unreadable) {
      updates.push(schedule(db, item.kind, item.id, false, nowSeconds + options.unreadableRetrySeconds));
      continue;
    }

    let nextCheckAt = NEVER;
    let deferred = false;
    for (const action of item.actions) {
      if (result.sent.length >= options.maxSends) {
        deferred = true;
        break;
      }
      const attempt = await chain.attempt(item.kind, action, item.id);
      if (attempt.sent) {
        const { txHash } = attempt;
        await db
          .prepare("INSERT INTO task_log (kind, item_id, action, tx_hash, created_at) VALUES (?, ?, ?, ?, ?)")
          .bind(item.kind, item.id, action, txHash, nowSeconds)
          .run();
        result.sent.push({ kind: item.kind, id: item.id, action, txHash });
        nextCheckAt = nowSeconds + options.sentGraceSeconds;
        break;
      }
      if (attempt.retryAt !== null) nextCheckAt = Math.min(nextCheckAt, attempt.retryAt);
    }
    updates.push(schedule(db, item.kind, item.id, false, deferred ? nowSeconds : nextCheckAt));
  }
  await chunked(db, updates);
  return result;
}
