import { beforeEach, describe, expect, it } from "vitest";
import { readCache, slowCache } from "../src/app";
import { processEvents } from "../src/eventStream";
import { partiesHandler } from "../src/parties";
import { ratingsHandler } from "../src/ratings";
import { closingFor, receiptsCount, receiptsHandler, receiptsOf } from "../src/receipts";
import { authed, createdEvent, owner, plainEvent, setup, stranger, tokenFor } from "./helpers";

beforeEach(() => {
  readCache.clear();
  slowCache.clear();
});
const handlers = [partiesHandler, ratingsHandler, receiptsHandler];

async function closed() {
  const ctx = setup();
  createdEvent(ctx.raw, 1, `0x${"1".repeat(64)}`, owner.address);
  plainEvent(ctx.raw, "OrderAgreed", 1, 300, { payee: stranger.address });
  plainEvent(ctx.raw, "OrderSettled", 1, 301, { payee: stranger.address, rating: "4" });
  return ctx;
}

describe("cierre de un trabajo y comprobantes", () => {
  it("las dos partes ven la calificación y si ya se reclamó el comprobante, y nadie más", async () => {
    const ctx = await closed();
    await processEvents(ctx.db, handlers, 100);
    expect(await closingFor(ctx.db, 1, owner.address)).toEqual({ ok: true, closing: { ratings: [{ index: null, rating: 4 }], receipt: null, smallDispute: false, dispute: null } });

    plainEvent(ctx.raw, "ReceiptClaimed", 1, 302, { payee: stranger.address, category: "3", month: "202611" });
    await processEvents(ctx.db, handlers, 100);
    const payee = await closingFor(ctx.db, 1, stranger.address);
    expect(payee).toEqual({ ok: true, closing: { ratings: [{ index: null, rating: 4 }], receipt: { category: 3, month: 202611 }, smallDispute: false, dispute: null } });
    expect((await closingFor(ctx.db, 1, owner.address)).ok).toBe(true);
    expect((await closingFor(ctx.db, 1, "0x" + "9".repeat(40))).ok).toBe(false);
  });

  it("marca un cierre por reclamo chico (sin caso), que no da comprobante, y no uno con jurado", async () => {
    const ctx = await closed();
    plainEvent(ctx.raw, "DisputeOpened", 1, 302, { claimant: owner.address, caseId: "0", fee: "0" });
    await processEvents(ctx.db, handlers, 100);
    const small = await closingFor(ctx.db, 1, stranger.address);
    expect(small.ok && small.closing.smallDispute).toBe(true);

    const jury = await closed();
    plainEvent(jury.raw, "DisputeOpened", 1, 302, { claimant: owner.address, caseId: "9", fee: "3000000" });
    await processEvents(jury.db, handlers, 100);
    const withJury = await closingFor(jury.db, 1, stranger.address);
    expect(withJury.ok && withJury.closing.smallDispute).toBe(false);
  });

  it("en una changa con hitos, solo el reclamo chico del último hito quita el comprobante", async () => {
    let position = 10;
    const insert = (ctx: Awaited<ReturnType<typeof closed>>, name: string, block: number, tx: string, args: object) =>
      ctx.raw
        .prepare(
          `INSERT INTO events (block_number, log_index, block_timestamp, tx_hash, contract, address, name, order_id, args)
           VALUES (?, ?, 1, ?, 'escrow', '0x', ?, 1, ?)`,
        )
        .run(block, ++position, tx, name, JSON.stringify(args));
    const middle = await closed();
    insert(middle, "MilestonesAgreed", 299, "0xa", {});
    insert(middle, "DisputeOpened", 310, "0xb", { claimant: owner.address, caseId: "0", fee: "0" });
    await processEvents(middle.db, handlers, 100);
    const kept = await closingFor(middle.db, 1, stranger.address);
    expect(kept.ok && kept.closing.smallDispute).toBe(false);

    const last = await closed();
    insert(last, "MilestonesAgreed", 299, "0xa", {});
    insert(last, "DisputeOpened", 310, "0xc", { claimant: owner.address, caseId: "0", fee: "0" });
    insert(last, "OrderSettled", 310, "0xc", { payee: stranger.address, rating: "0" });
    await processEvents(last.db, handlers, 100);
    const lost = await closingFor(last.db, 1, stranger.address);
    expect(lost.ok && lost.closing.smallDispute).toBe(true);
  });

  it("cuenta cómo se resolvió el reclamo que cerró el trabajo y si fue por falta de respuesta", async () => {
    const ctx = await closed();
    const insert = (name: string, tx: string, position: number, args: object) =>
      ctx.raw
        .prepare(
          `INSERT INTO events (block_number, log_index, block_timestamp, tx_hash, contract, address, name, order_id, args)
           VALUES (320, ?, 1, ?, 'escrow', '0x', ?, 1, ?)`,
        )
        .run(position, tx, name, JSON.stringify(args));
    insert("ResolvedByDefault", "0xd", 1, { caseId: "2", winner: owner.address });
    insert("DisputeResolved", "0xd", 2, { payeeShareBps: 0, arbitrationCost: "3000000" });
    await processEvents(ctx.db, handlers, 100);
    const closing = await closingFor(ctx.db, 1, stranger.address);
    expect(closing.ok && closing.closing.dispute).toEqual({ payeeShareBps: 0, byDefault: true });
  });

  it("la calificación por hito se lista con su número", async () => {
    const ctx = setup();
    createdEvent(ctx.raw, 1, `0x${"1".repeat(64)}`, owner.address);
    plainEvent(ctx.raw, "OrderAgreed", 1, 300, { payee: stranger.address });
    plainEvent(ctx.raw, "MilestonePaid", 1, 301, { index: "0", rating: "5" });
    plainEvent(ctx.raw, "MilestonePaid", 1, 302, { index: "1", rating: "3" });
    await processEvents(ctx.db, handlers, 100);
    const result = await closingFor(ctx.db, 1, stranger.address);
    expect(result.ok && result.closing.ratings).toEqual([{ index: 0, rating: 5 }, { index: 1, rating: 3 }]);
  });

  it("los comprobantes se muestran en el perfil público de quien trabajó", async () => {
    const ctx = await closed();
    plainEvent(ctx.raw, "ReceiptClaimed", 1, 302, { payee: stranger.address, category: "3", month: "202611" });
    await processEvents(ctx.db, handlers, 100);
    expect(await receiptsOf(ctx.db, stranger.address)).toEqual([{ orderId: 1, category: 3, month: 202611, title: "", closedAt: 1, rated: false, rating: null, comment: null, commentHash: null, payerName: null, remote: false }]);
    expect(await receiptsOf(ctx.db, owner.address)).toEqual([]);
    expect(await receiptsCount(ctx.db, stranger.address)).toBe(1);

    const worker = await tokenFor(ctx.call, stranger);
    await ctx.call("/me/profile", authed(worker.body.token, "PUT", { name: "Beto", categories: [3], work: { lat: -34.6, lng: -58.4, radiusM: 2000 } }));
    const response = await ctx.call(`/profiles/${stranger.address}`);
    expect(response.status).toBe(200);
    expect(((await response.json()) as any).profile.receiptsCount).toBe(1);
    const list = await ctx.call(`/profiles/${stranger.address}/receipts`);
    expect(list.status).toBe(200);
    expect(((await list.json()) as any).receipts).toEqual([{ orderId: 1, category: 3, month: 202611, title: "", closedAt: 1, rated: false, rating: null, comment: null, commentHash: null, payerName: null, remote: false }]);
    expect((await ctx.call("/profiles/nope/receipts")).status).toBe(400);
  });

  it("el endpoint de cierre responde solo a las partes", async () => {
    const ctx = await closed();
    await processEvents(ctx.db, handlers, 100);
    const payee = await tokenFor(ctx.call, stranger);
    const ok = await ctx.call("/me/orders/1/closing", authed(payee.body.token, "GET"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ratings: [{ index: null, rating: 4 }], receipt: null, smallDispute: false, dispute: null });
  });
});
