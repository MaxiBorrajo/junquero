import { describe, expect, it } from "vitest";
import { MARK_MAX_ATTEMPTS, MARK_RETRY_SECONDS, enqueueMark, runMarks, type MarkAttempt, type MarkChain } from "../src/marks";
import { createdEvent, futureSpec, owner, setup, TOKEN, tokenFor, authed } from "./helpers";
import { applicationsHandler } from "../src/applications";
import { createChangasHandler } from "../src/changas";
import { processEvents } from "../src/eventStream";

const handlers = [createChangasHandler(new Map([[TOKEN.toLowerCase(), 6]])), applicationsHandler];

class FakeMarkChain implements MarkChain {
  marked = new Set<number>();
  sent: number[] = [];
  failing = false;
  async hadApplicants(ids: number[]) {
    return ids.map((id) => this.marked.has(id));
  }
  async mark(id: number): Promise<MarkAttempt> {
    if (this.failing) return { sent: false };
    this.sent.push(id);
    return { sent: true, txHash: `0x${"ab".repeat(32)}` };
  }
}

async function changaWithOrder(ctx: ReturnType<typeof setup>, orderId: number) {
  const publisher = (await tokenFor(ctx.call, owner)).body.token;
  const draft = await ctx.call("/me/changas", authed(publisher, "POST", futureSpec(`nonce-${orderId}000`)));
  const { specHash } = (await draft.json()) as { specHash: string };
  createdEvent(ctx.raw, orderId, specHash, owner.address);
  await processEvents(ctx.db, handlers, 100);
  return (ctx.raw.prepare("SELECT id FROM changas WHERE order_id = ?").get(orderId) as { id: number }).id;
}

const pending = (ctx: ReturnType<typeof setup>) => ctx.raw.prepare("SELECT order_id, attempts, next_at FROM pending_marks").all() as { order_id: number; attempts: number; next_at: number }[];

describe("marking orders that received an application", () => {
  it("queues the order once and sends the mark", async () => {
    const ctx = setup();
    const changaId = await changaWithOrder(ctx, 1);
    await enqueueMark(ctx.db, changaId).run();
    await enqueueMark(ctx.db, changaId).run();
    expect(pending(ctx)).toHaveLength(1);

    const chain = new FakeMarkChain();
    const result = await runMarks(ctx.db, chain, 1000);
    expect(chain.sent).toEqual([1]);
    expect(result).toEqual({ marked: 0, waiting: 1, dropped: 0 });
    expect(pending(ctx)[0]).toMatchObject({ attempts: 1, next_at: 1000 + MARK_RETRY_SECONDS });
  });

  it("does not run again until the wait is over, then drops the order once the contract has the mark", async () => {
    const ctx = setup();
    const changaId = await changaWithOrder(ctx, 1);
    await enqueueMark(ctx.db, changaId).run();
    const chain = new FakeMarkChain();
    await runMarks(ctx.db, chain, 1000);
    await runMarks(ctx.db, chain, 1010);
    expect(chain.sent).toHaveLength(1);

    chain.marked.add(1);
    const result = await runMarks(ctx.db, chain, 1000 + MARK_RETRY_SECONDS);
    expect(result.marked).toBe(1);
    expect(pending(ctx)).toEqual([]);
  });

  it("gives up after several failed attempts", async () => {
    const ctx = setup();
    const changaId = await changaWithOrder(ctx, 1);
    await enqueueMark(ctx.db, changaId).run();
    const chain = new FakeMarkChain();
    chain.failing = true;
    let now = 1000;
    for (let i = 0; i < MARK_MAX_ATTEMPTS - 1; i++) {
      await runMarks(ctx.db, chain, now);
      now += MARK_RETRY_SECONDS;
      expect(pending(ctx)).toHaveLength(1);
    }
    const last = await runMarks(ctx.db, chain, now);
    expect(last.dropped).toBe(1);
    expect(pending(ctx)).toEqual([]);
  });

  it("ignores changas whose order does not exist yet", async () => {
    const ctx = setup();
    const publisher = (await tokenFor(ctx.call, owner)).body.token;
    await ctx.call("/me/changas", authed(publisher, "POST", futureSpec("nonce-draft01")));
    const id = (ctx.raw.prepare("SELECT id FROM changas").get() as { id: number }).id;
    await enqueueMark(ctx.db, id).run();
    expect(pending(ctx)).toEqual([]);
  });
});
