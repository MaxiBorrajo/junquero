import { beforeEach, describe, expect, it } from "vitest";
import { chainCache, readCache } from "../src/app";
import { hasUnprocessedEvents, processEvents } from "../src/eventStream";
import { partiesHandler } from "../src/parties";
import { createdEvent, owner, setup } from "./helpers";

beforeEach(() => {
  readCache.clear();
  chainCache.clear();
});

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

import { overrideChainReads, jsonSafe, type ChainReads } from "../src/chainReads";
import { authed, tokenFor } from "./helpers";

describe("lecturas de la cadena servidas por el backend", () => {
  it("pasa los números grandes a texto", () => {
    expect(jsonSafe({ price: 5_000_000n, list: [1n, { n: 2n }], flag: true })).toEqual({ price: "5000000", list: ["1", { n: "2" }], flag: true });
  });

  it("lee la cadena una sola vez por ventana aunque lo pidan varias personas, y exige sesión", async () => {
    const ctx = setup();
    let reads = 0;
    const fake: ChainReads = {
      order: async (id) => { reads += 1; return { status: 3, price: String(id) }; },
      milestones: async () => ({ milestones: [], plan: {} }),
      group: async () => ({ info: {}, contributors: [] }),
      caseOf: async () => ({ case: {}, jurors: [] }),
    };
    overrideChainReads(() => fake);
    try {
      expect((await ctx.call("/me/chain/orders/7")).status).toBe(401);
      const a = await tokenFor(ctx.call, owner);
      const first = await ctx.call("/me/chain/orders/7", authed(a.body.token, "GET"));
      expect(await first.json()).toEqual({ status: 3, price: "7" });
      await ctx.call("/me/chain/orders/7", authed(a.body.token, "GET"));
      expect(reads).toBe(1);
      await ctx.call("/me/chain/orders/7?fresh=1", authed(a.body.token, "GET"));
      expect(reads).toBe(2);
      expect((await ctx.call("/me/chain/orders/abc", authed(a.body.token, "GET"))).status).toBe(400);
      expect((await ctx.call("/me/chain/orders/7/milestones", authed(a.body.token, "GET"))).status).toBe(200);
    } finally {
      overrideChainReads(null);
    }
  });
});
