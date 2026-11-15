import { beforeEach, describe, expect, it } from "vitest";
import { readCache } from "../src/app";
import { hasUnprocessedEvents, processEvents } from "../src/eventStream";
import { partiesHandler } from "../src/parties";
import { createdEvent, owner, setup } from "./helpers";

beforeEach(() => readCache.clear());

describe("el reloj no gasta cuando no hay nada para hacer", () => {
  it("detecta si hay eventos sin procesar", async () => {
    const ctx = setup();
    expect(await hasUnprocessedEvents(ctx.db)).toBe(false);
    createdEvent(ctx.raw, 1, `0x${"1".repeat(64)}`, owner.address);
    expect(await hasUnprocessedEvents(ctx.db)).toBe(true);
    await processEvents(ctx.db, [partiesHandler], 100);
    expect(await hasUnprocessedEvents(ctx.db)).toBe(false);
  });
});

describe("mapa de changas", () => {
  it("dos recuadros casi iguales comparten la misma consulta y la respuesta se puede cachear", async () => {
    const ctx = setup();
    const first = await ctx.call("/changas?minLat=-34.612&maxLat=-34.571&minLng=-58.431&maxLng=-58.371");
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("public, max-age=10");
    const before = readCache.size;
    await ctx.call("/changas?minLat=-34.611&maxLat=-34.573&minLng=-58.43&maxLng=-58.372");
    expect(readCache.size).toBe(before);
  });
});
