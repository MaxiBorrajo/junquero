import type { Hex } from "viem";

export type TaskKind = "order" | "case";

export interface OrderState {
  status: number;
  hasMilestones: boolean;
}

export interface CaseState {
  phase: number;
}

export interface TaskChain {
  readOrders(ids: number[]): Promise<(OrderState | null)[]>;
  readCases(ids: number[]): Promise<(CaseState | null)[]>;
  attempt(kind: TaskKind, action: string, id: number): Promise<Hex | null>;
}

export interface TaskOptions {
  batchSize: number;
  maxSends: number;
}

export interface TaskResult {
  checked: number;
  closed: number;
  sent: { kind: TaskKind; id: number; action: string; txHash: Hex }[];
}

export const ORDER_STATUS = { Agreed: 3, Delivered: 4, Settled: 6, Cancelled: 7, Funding: 8 };
export const CASE_PHASE = { Response: 1, Seed: 2, Vote: 3, Resolved: 5, Decided: 6 };

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

const SYNC_ORDERS = `INSERT OR IGNORE INTO watched (kind, id)
  SELECT DISTINCT 'order', order_id FROM events WHERE name = 'OrderCreated' AND order_id IS NOT NULL`;

const SYNC_CASES = `INSERT OR IGNORE INTO watched (kind, id)
  SELECT DISTINCT 'case', case_id FROM events WHERE name = 'CaseOpened' AND case_id IS NOT NULL`;

async function openIds(db: D1Database, kind: TaskKind, limit: number): Promise<number[]> {
  const { results } = await db
    .prepare("SELECT id FROM watched WHERE kind = ? AND closed = 0 ORDER BY checked_at ASC, id ASC LIMIT ?")
    .bind(kind, limit)
    .all<{ id: number }>();
  return results.map((row) => row.id);
}

async function record(db: D1Database, kind: TaskKind, ids: number[], closedFlags: boolean[], now: number) {
  const statements = ids.map((id, index) =>
    db
      .prepare("UPDATE watched SET closed = ?, checked_at = ? WHERE kind = ? AND id = ?")
      .bind(closedFlags[index] ? 1 : 0, now, kind, id),
  );
  if (statements.length) await db.batch(statements);
}

async function logSend(db: D1Database, kind: TaskKind, id: number, action: string, txHash: Hex, now: number) {
  await db
    .prepare("INSERT INTO task_log (kind, item_id, action, tx_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(kind, id, action, txHash, now)
    .run();
}

export async function runTasks(
  db: D1Database,
  chain: TaskChain,
  options: TaskOptions,
  nowSeconds: number,
): Promise<TaskResult> {
  await db.batch([db.prepare(SYNC_ORDERS), db.prepare(SYNC_CASES)]);
  const result: TaskResult = { checked: 0, closed: 0, sent: [] };

  const orderIds = await openIds(db, "order", options.batchSize);
  const caseIds = await openIds(db, "case", options.batchSize);
  const orders = orderIds.length ? await chain.readOrders(orderIds) : [];
  const cases = caseIds.length ? await chain.readCases(caseIds) : [];

  const work: { kind: TaskKind; id: number; actions: string[] }[] = [];
  const orderClosed = orders.map((state) => (state ? isOrderClosed(state) : false));
  const caseClosed = cases.map((state) => (state ? isCaseClosed(state) : false));
  orders.forEach((state, index) => state && work.push({ kind: "order", id: orderIds[index], actions: orderActions(state) }));
  cases.forEach((state, index) => state && work.push({ kind: "case", id: caseIds[index], actions: caseActions(state) }));

  await record(db, "order", orderIds, orderClosed, nowSeconds);
  await record(db, "case", caseIds, caseClosed, nowSeconds);
  result.checked = orderIds.length + caseIds.length;
  result.closed = [...orderClosed, ...caseClosed].filter(Boolean).length;

  for (const item of work) {
    for (const action of item.actions) {
      if (result.sent.length >= options.maxSends) return result;
      const txHash = await chain.attempt(item.kind, action, item.id);
      if (!txHash) continue;
      await logSend(db, item.kind, item.id, action, txHash, nowSeconds);
      result.sent.push({ kind: item.kind, id: item.id, action, txHash });
      break;
    }
  }
  return result;
}
