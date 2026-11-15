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

import { CHAT_FILE_TTL_SECONDS, EVIDENCE_AFTER_CLOSE_SECONDS, EVIDENCE_MAX_AGE_SECONDS, purgeExpiredFiles } from "../src/files";
import type { FakeBucket } from "./helpers";

describe("archivos privados vencidos", () => {
  const now = 2_000_000_000;
  const put = (ctx: ReturnType<typeof setup>, owner_: string, hash: string, kind: string, createdAt: number) => {
    ctx.raw.prepare("INSERT INTO files (owner, hash, kind, mime, size, linked, created_at) VALUES (?, ?, ?, 'application/octet-stream', 1, 1, ?)").run(owner_, hash, kind, createdAt);
    (ctx.bucket as unknown as FakeBucket).objects.set(`files/${owner_}/${hash}`, { bytes: new Uint8Array([1]) });
  };

  it("borra los adjuntos del chat viejos y las pruebas de trabajos cerrados hace mucho, y deja lo demás", async () => {
    const ctx = setup();
    const a = "a".repeat(64);
    const b = "b".repeat(64);
    const c = "c".repeat(64);
    const d = "d".repeat(64);
    const e = "e".repeat(64);
    put(ctx, owner.address.toLowerCase(), a, "chat", now - CHAT_FILE_TTL_SECONDS - 10); // viejo
    put(ctx, owner.address.toLowerCase(), b, "chat", now - 1_000); // reciente
    put(ctx, owner.address.toLowerCase(), c, "evidence", now - 10_000); // de un trabajo cerrado hace tiempo
    put(ctx, owner.address.toLowerCase(), d, "evidence", now - 10_000); // de un trabajo abierto
    put(ctx, owner.address.toLowerCase(), e, "evidence", now - EVIDENCE_MAX_AGE_SECONDS - 10); // muy viejo
    put(ctx, owner.address.toLowerCase(), "f".repeat(64), "public", now - EVIDENCE_MAX_AGE_SECONDS - 10); // los públicos no se tocan acá
    const insertEvidence = ctx.raw.prepare("INSERT INTO evidence (order_id, hash, uploader, kind, meta, signature, size, created_at) VALUES (?, ?, ?, 'photo', 'm', 's', 1, 1)");
    insertEvidence.run(1, c, owner.address.toLowerCase());
    insertEvidence.run(2, d, owner.address.toLowerCase());
    ctx.raw.prepare("INSERT INTO evidence_keys (order_id, hash, recipient, wrapped, created_at) VALUES (1, ?, 'x', 'w', 1)").run(c);
    ctx.raw.prepare("INSERT INTO events (block_number, log_index, block_timestamp, tx_hash, contract, address, name, order_id, args) VALUES (1, 0, ?, '0x', 'escrow', '0x', 'OrderSettled', 1, '{}')").run(now - EVIDENCE_AFTER_CLOSE_SECONDS - 10);
    const removed = await purgeExpiredFiles(ctx.db, ctx.bucket as unknown as R2Bucket, now);
    expect(removed).toBe(3);
    const left = (ctx.raw.prepare("SELECT hash FROM files ORDER BY hash").all() as { hash: string }[]).map((row) => row.hash[0]);
    expect(left).toEqual(["b", "d", "f"]);
    expect((ctx.raw.prepare("SELECT COUNT(*) AS n FROM evidence").get() as { n: number }).n).toBe(1);
    expect((ctx.raw.prepare("SELECT COUNT(*) AS n FROM evidence_keys").get() as { n: number }).n).toBe(0);
    expect((ctx.bucket as unknown as FakeBucket).objects.size).toBe(3);
  });
});
