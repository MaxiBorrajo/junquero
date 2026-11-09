import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import {
  caseActions,
  orderActions,
  runTasks,
  type CaseState,
  type OrderState,
  type TaskChain,
  type TaskKind,
} from "../src/tasks";
import { createFakeD1 } from "./fakeD1";

const AGREED = 3;
const DELIVERED = 4;
const SETTLED = 6;
const FUNDING = 8;

class FakeTaskChain implements TaskChain {
  orders = new Map<number, OrderState>();
  cases = new Map<number, CaseState>();
  ready = new Set<string>();
  calls: string[] = [];
  sent: string[] = [];
  readOrders = async (ids: number[]) => ids.map((id) => this.orders.get(id) ?? null);
  readCases = async (ids: number[]) => ids.map((id) => this.cases.get(id) ?? null);
  attempt = async (kind: TaskKind, action: string, id: number): Promise<Hex | null> => {
    const key = `${kind}:${action}:${id}`;
    this.calls.push(key);
    if (!this.ready.has(key)) return null;
    this.sent.push(key);
    return ("0x" + this.sent.length.toString(16).padStart(64, "0")) as Hex;
  };
}

function seedEvent(raw: ReturnType<typeof createFakeD1>["raw"], name: string, column: "order_id" | "case_id", id: number) {
  raw.prepare(
    `INSERT INTO events (id, block_number, block_timestamp, tx_hash, log_index, contract, address, name, ${column}, args)
     VALUES (?, 1, 1, ?, 0, 'x', '0x', ?, ?, '{}')`,
  ).run(`${name}:${id}`, `0x${id}`, name, id);
}

const options = { batchSize: 40, maxSends: 5 };

describe("action selection", () => {
  it("maps order states to actions", () => {
    expect(orderActions({ status: AGREED, hasMilestones: false })).toEqual(["reclaim"]);
    expect(orderActions({ status: AGREED, hasMilestones: true })).toEqual(["autoReleaseMilestone", "reclaim"]);
    expect(orderActions({ status: DELIVERED, hasMilestones: false })).toEqual(["autoRelease"]);
    expect(orderActions({ status: FUNDING, hasMilestones: false })).toEqual(["refundFunding"]);
    expect(orderActions({ status: SETTLED, hasMilestones: false })).toEqual([]);
  });

  it("maps case phases to actions", () => {
    expect(caseActions({ phase: 1 })).toEqual(["resolveByDefault"]);
    expect(caseActions({ phase: 2 })).toEqual(["draw"]);
    expect(caseActions({ phase: 3 })).toEqual(["finalize"]);
    expect(caseActions({ phase: 6 })).toEqual(["execute"]);
    expect(caseActions({ phase: 4 })).toEqual([]);
    expect(caseActions({ phase: 5 })).toEqual([]);
  });
});

describe("runTasks", () => {
  it("watches orders and cases found in events", async () => {
    const { db, raw } = createFakeD1();
    seedEvent(raw, "OrderCreated", "order_id", 1);
    seedEvent(raw, "CaseOpened", "case_id", 7);
    await runTasks(db, new FakeTaskChain(), options, 100);
    const rows = raw.prepare("SELECT kind, id FROM watched ORDER BY kind").all();
    expect(rows).toEqual([
      { kind: "case", id: 7 },
      { kind: "order", id: 1 },
    ]);
  });

  it("sends only the actions whose simulation passes and logs them", async () => {
    const { db, raw } = createFakeD1();
    seedEvent(raw, "OrderCreated", "order_id", 1);
    seedEvent(raw, "OrderCreated", "order_id", 2);
    const chain = new FakeTaskChain();
    chain.orders.set(1, { status: DELIVERED, hasMilestones: false });
    chain.orders.set(2, { status: DELIVERED, hasMilestones: false });
    chain.ready.add("order:autoRelease:2");
    const result = await runTasks(db, chain, options, 100);
    expect(result.sent.map((item) => item.id)).toEqual([2]);
    expect(raw.prepare("SELECT item_id, action FROM task_log").all()).toEqual([{ item_id: 2, action: "autoRelease" }]);
  });

  it("closes finished orders and cases and stops checking them", async () => {
    const { db, raw } = createFakeD1();
    seedEvent(raw, "OrderCreated", "order_id", 1);
    seedEvent(raw, "CaseOpened", "case_id", 1);
    const chain = new FakeTaskChain();
    chain.orders.set(1, { status: SETTLED, hasMilestones: false });
    chain.cases.set(1, { phase: 5 });
    const first = await runTasks(db, chain, options, 100);
    expect(first.closed).toBe(2);
    const second = await runTasks(db, chain, options, 200);
    expect(second.checked).toBe(0);
  });

  it("keeps unreadable items open", async () => {
    const { db, raw } = createFakeD1();
    seedEvent(raw, "OrderCreated", "order_id", 9);
    const result = await runTasks(db, new FakeTaskChain(), options, 100);
    expect(result.closed).toBe(0);
    expect(raw.prepare("SELECT closed FROM watched").all()).toEqual([{ closed: 0 }]);
  });

  it("respects the per-run send limit", async () => {
    const { db, raw } = createFakeD1();
    const chain = new FakeTaskChain();
    for (let id = 1; id <= 4; id++) {
      seedEvent(raw, "OrderCreated", "order_id", id);
      chain.orders.set(id, { status: DELIVERED, hasMilestones: false });
      chain.ready.add(`order:autoRelease:${id}`);
    }
    const result = await runTasks(db, chain, { batchSize: 40, maxSends: 2 }, 100);
    expect(result.sent).toHaveLength(2);
  });

  it("rotates through items so none is starved", async () => {
    const { db, raw } = createFakeD1();
    const chain = new FakeTaskChain();
    for (let id = 1; id <= 3; id++) {
      seedEvent(raw, "OrderCreated", "order_id", id);
      chain.orders.set(id, { status: AGREED, hasMilestones: false });
    }
    await runTasks(db, chain, { batchSize: 2, maxSends: 5 }, 100);
    chain.calls.length = 0;
    await runTasks(db, chain, { batchSize: 2, maxSends: 5 }, 200);
    expect(chain.calls).toContain("order:reclaim:3");
  });
});
