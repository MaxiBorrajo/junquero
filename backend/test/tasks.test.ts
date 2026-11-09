import { describe, expect, it } from "vitest";
import { ContractFunctionRevertedError, encodeErrorResult, type Abi, type Hex } from "viem";
import { indexedContracts } from "../src/contracts";
import { retryAtFrom } from "../src/taskChain";
import {
  caseActions,
  NEVER,
  orderActions,
  runTasks,
  syncWatched,
  type AttemptResult,
  type CaseState,
  type OrderState,
  type TaskChain,
  type TaskKind,
  type TaskOptions,
} from "../src/tasks";
import { createFakeD1 } from "./fakeD1";

const AGREED = 3;
const DELIVERED = 4;
const SETTLED = 6;
const FUNDING = 8;

type Raw = ReturnType<typeof createFakeD1>["raw"];

class FakeTaskChain implements TaskChain {
  orders = new Map<number, OrderState>();
  cases = new Map<number, CaseState>();
  ready = new Set<string>();
  retryAt = new Map<string, number>();
  reads = 0;
  calls: string[] = [];
  sent: string[] = [];
  readOrders = async (ids: number[]) => {
    this.reads += 1;
    return ids.map((id) => this.orders.get(id) ?? null);
  };
  readCases = async (ids: number[]) => {
    this.reads += 1;
    return ids.map((id) => this.cases.get(id) ?? null);
  };
  attempt = async (kind: TaskKind, action: string, id: number): Promise<AttemptResult> => {
    const key = `${kind}:${action}:${id}`;
    this.calls.push(key);
    if (!this.ready.has(key)) return { sent: false, retryAt: this.retryAt.get(key) ?? null };
    this.sent.push(key);
    return { sent: true, txHash: ("0x" + this.sent.length.toString(16).padStart(64, "0")) as Hex };
  };
}

let nextEvent = 0;
function seedEvent(raw: Raw, name: string, column: "order_id" | "case_id", id: number) {
  nextEvent += 1;
  raw.prepare(
    `INSERT INTO events (id, block_number, block_timestamp, tx_hash, log_index, contract, address, name, ${column}, args)
     VALUES (?, 1, 1, ?, 0, 'x', '0x', ?, ?, '{}')`,
  ).run(`${name}:${id}:${nextEvent}`, `0x${nextEvent}`, name, id);
}

const options: TaskOptions = {
  batchSize: 40,
  maxSends: 5,
  eventScanLimit: 500,
  sentGraceSeconds: 120,
  unreadableRetrySeconds: 60,
};

const schedule = (raw: Raw, kind: string, id: number) =>
  raw.prepare("SELECT closed, next_check_at AS next FROM watched WHERE kind = ? AND id = ?").get(kind, id) as {
    closed: number;
    next: number;
  };

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

describe("retryAtFrom", () => {
  const escrowAbi = indexedContracts.find((contract) => contract.name === "escrow")!.abi as Abi;

  function revertWith(errorName: string, args: unknown[]) {
    const data = encodeErrorResult({ abi: escrowAbi, errorName, args } as never);
    return new ContractFunctionRevertedError({ abi: escrowAbi, data, functionName: "autoRelease" });
  }

  it("reads the exact time from a not-ready revert", () => {
    expect(retryAtFrom(revertWith("AutoReleaseNotReady", [1_800_000_000]))).toBe(1_800_000_002);
  });

  it("ignores reverts that carry no time", () => {
    expect(retryAtFrom(revertWith("MilestoneNotDelivered", [0]))).toBeNull();
    expect(retryAtFrom(revertWith("DeadlineNotReached", [0]))).toBeNull();
    expect(retryAtFrom(new Error("network"))).toBeNull();
  });
});

describe("syncWatched", () => {
  it("watches new orders and cases and only scans events it has not seen", async () => {
    const { db, raw } = createFakeD1();
    seedEvent(raw, "OrderCreated", "order_id", 1);
    seedEvent(raw, "CaseOpened", "case_id", 7);
    await syncWatched(db, 500);
    expect(raw.prepare("SELECT kind, id FROM watched ORDER BY kind").all()).toEqual([
      { kind: "case", id: 7 },
      { kind: "order", id: 1 },
    ]);
    raw.prepare("UPDATE watched SET next_check_at = 999").run();
    await syncWatched(db, 500);
    expect(schedule(raw, "order", 1).next).toBe(999);
  });

  it("wakes an item when a relevant event arrives, but not for quiet ones", async () => {
    const { db, raw } = createFakeD1();
    seedEvent(raw, "CaseOpened", "case_id", 1);
    await syncWatched(db, 500);
    raw.prepare("UPDATE watched SET next_check_at = 999").run();
    seedEvent(raw, "VoteCommitted", "case_id", 1);
    await syncWatched(db, 500);
    expect(schedule(raw, "case", 1).next).toBe(999);
    seedEvent(raw, "VerdictReached", "case_id", 1);
    await syncWatched(db, 500);
    expect(schedule(raw, "case", 1).next).toBe(0);
  });

  it("processes a large backlog in slices without skipping events", async () => {
    const { db, raw } = createFakeD1();
    for (let id = 1; id <= 5; id++) seedEvent(raw, "OrderCreated", "order_id", id);
    await syncWatched(db, 2);
    await syncWatched(db, 2);
    await syncWatched(db, 2);
    expect((raw.prepare("SELECT COUNT(*) AS n FROM watched").get() as { n: number }).n).toBe(5);
  });
});

describe("runTasks", () => {
  it("does not touch the chain when nothing is due", async () => {
    const { db } = createFakeD1();
    const chain = new FakeTaskChain();
    const result = await runTasks(db, chain, options, 100);
    expect(result.checked).toBe(0);
    expect(chain.reads).toBe(0);
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
    expect(schedule(raw, "order", 2).next).toBe(220);
  });

  it("sleeps until the exact time given by the contract and does not check earlier", async () => {
    const { db, raw } = createFakeD1();
    seedEvent(raw, "OrderCreated", "order_id", 1);
    const chain = new FakeTaskChain();
    chain.orders.set(1, { status: DELIVERED, hasMilestones: false });
    chain.retryAt.set("order:autoRelease:1", 5000);
    await runTasks(db, chain, options, 100);
    expect(schedule(raw, "order", 1).next).toBe(5000);
    chain.calls.length = 0;
    await runTasks(db, chain, options, 4999);
    expect(chain.calls).toHaveLength(0);
    chain.ready.add("order:autoRelease:1");
    const result = await runTasks(db, chain, options, 5000);
    expect(result.sent).toHaveLength(1);
  });

  it("waits for an event when no time is known and wakes on the next event", async () => {
    const { db, raw } = createFakeD1();
    seedEvent(raw, "OrderCreated", "order_id", 1);
    const chain = new FakeTaskChain();
    chain.orders.set(1, { status: AGREED, hasMilestones: false });
    await runTasks(db, chain, options, 100);
    expect(schedule(raw, "order", 1).next).toBe(NEVER);
    chain.calls.length = 0;
    await runTasks(db, chain, options, 10_000_000);
    expect(chain.calls).toHaveLength(0);
    seedEvent(raw, "OrderAgreed", "order_id", 1);
    await runTasks(db, chain, options, 10_000_001);
    expect(chain.calls).toEqual(["order:reclaim:1"]);
  });

  it("takes the earliest known time among several failed actions", async () => {
    const { db, raw } = createFakeD1();
    seedEvent(raw, "OrderCreated", "order_id", 1);
    const chain = new FakeTaskChain();
    chain.orders.set(1, { status: AGREED, hasMilestones: true });
    chain.retryAt.set("order:autoReleaseMilestone:1", 900);
    chain.retryAt.set("order:reclaim:1", 700);
    await runTasks(db, chain, options, 100);
    expect(schedule(raw, "order", 1).next).toBe(700);
  });

  it("closes finished orders and cases and never reads them again", async () => {
    const { db, raw } = createFakeD1();
    seedEvent(raw, "OrderCreated", "order_id", 1);
    seedEvent(raw, "CaseOpened", "case_id", 1);
    const chain = new FakeTaskChain();
    chain.orders.set(1, { status: SETTLED, hasMilestones: false });
    chain.cases.set(1, { phase: 5 });
    const first = await runTasks(db, chain, options, 100);
    expect(first.closed).toBe(2);
    seedEvent(raw, "OrderSettled", "order_id", 1);
    chain.reads = 0;
    const second = await runTasks(db, chain, options, 200);
    expect(second.checked).toBe(0);
    expect(chain.reads).toBe(0);
  });

  it("retries unreadable items soon instead of dropping them", async () => {
    const { db, raw } = createFakeD1();
    seedEvent(raw, "OrderCreated", "order_id", 9);
    await runTasks(db, new FakeTaskChain(), options, 100);
    expect(schedule(raw, "order", 9)).toEqual({ closed: 0, next: 160 });
  });

  it("respects the per-run send limit and leaves the rest due right away", async () => {
    const { db, raw } = createFakeD1();
    const chain = new FakeTaskChain();
    for (let id = 1; id <= 4; id++) {
      seedEvent(raw, "OrderCreated", "order_id", id);
      chain.orders.set(id, { status: DELIVERED, hasMilestones: false });
      chain.ready.add(`order:autoRelease:${id}`);
    }
    const result = await runTasks(db, chain, { ...options, maxSends: 2 }, 100);
    expect(result.sent).toHaveLength(2);
    expect(schedule(raw, "order", 3).next).toBe(100);
    const next = await runTasks(db, chain, { ...options, maxSends: 2 }, 101);
    expect(next.sent.map((item) => item.id)).toEqual([3, 4]);
  });
});
