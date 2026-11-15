import { describe, expect, it } from "vitest";
import { processEvents } from "../src/eventStream";
import { profileStats } from "../src/profiles";
import { partiesHandler } from "../src/parties";
import { ratingsHandler } from "../src/ratings";
import { createdEvent, owner, plainEvent, setup, stranger } from "./helpers";

const handlers = [partiesHandler, ratingsHandler];

describe("calificaciones duraderas", () => {
  it("guardan la de cada pago y el perfil las promedia sin depender de las firmas que se borran", async () => {
    const ctx = setup();
    createdEvent(ctx.raw, 1, `0x${"1".repeat(64)}`, owner.address);
    createdEvent(ctx.raw, 2, `0x${"2".repeat(64)}`, owner.address);
    plainEvent(ctx.raw, "OrderAgreed", 1, 300, { payee: stranger.address });
    plainEvent(ctx.raw, "OrderAgreed", 2, 301, { payee: stranger.address });
    plainEvent(ctx.raw, "OrderSettled", 1, 302, { payee: stranger.address, rating: "5" });
    plainEvent(ctx.raw, "MilestonePaid", 2, 303, { index: "0", rating: "3" });
    plainEvent(ctx.raw, "OrderSettled", 1, 304, { payee: stranger.address, rating: "5" });
    await processEvents(ctx.db, handlers, 100);
    const stats = await profileStats(ctx.db, stranger.address.toLowerCase());
    expect(stats.ratings).toBe(2);
    expect(stats.rating).toBe(4);
  });

  it("ignora calificaciones fuera de rango", async () => {
    const ctx = setup();
    createdEvent(ctx.raw, 1, `0x${"1".repeat(64)}`, owner.address);
    plainEvent(ctx.raw, "OrderSettled", 1, 302, { payee: stranger.address, rating: "0" });
    plainEvent(ctx.raw, "OrderSettled", 1, 303, { payee: stranger.address, rating: "9" });
    await processEvents(ctx.db, handlers, 100);
    expect((await profileStats(ctx.db, stranger.address.toLowerCase())).rating).toBeNull();
  });
});
