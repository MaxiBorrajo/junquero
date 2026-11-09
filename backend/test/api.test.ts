import { beforeEach, describe, expect, it } from "vitest";
import { app, readCache } from "../src/app";
import type { Env } from "../src/env";
import { createChangasHandler, MAX_DRAFTS, purgeStaleDrafts } from "../src/changas";
import { processEvents } from "../src/eventStream";
import { authed, createdEvent, futureSpec, owner, plainEvent, setup, stranger, TOKEN, tokenFor } from "./helpers";

beforeEach(() => readCache.clear());

describe("auth routes", () => {
  it("logs in with a wallet signature and reaches /me", async () => {
    const { call } = setup();
    const { response, body } = await tokenFor(call);
    expect(response.status).toBe(200);
    expect(body.address).toBe(owner.address.toLowerCase());
    const me = await call("/me", authed(body.token, "GET"));
    expect(await me.json()).toEqual({ address: owner.address.toLowerCase(), profile: null });
  });

  it("rejects missing, invalid and forged credentials", async () => {
    const { call } = setup();
    expect((await call("/me")).status).toBe(401);
    expect((await call("/me", { headers: { authorization: "Bearer nope" } })).status).toBe(401);
    const bad = await call("/auth/login", { method: "POST", body: JSON.stringify({ address: owner.address, issuedAt: 1, signature: "0x12" }) });
    expect(bad.status).toBe(401);
    expect((await call("/auth/login", { method: "POST", body: "not json" })).status).toBe(400);
  });

  it("reports auth as not configured without the secret", async () => {
    const { env } = setup();
    const response = await app.request("/me", {}, { ...env, AUTH_SECRET: "" } as Env);
    expect(response.status).toBe(503);
  });

  it("applies the ip limiter", async () => {
    const closed = { limit: async () => ({ success: false }) };
    const { call } = setup(closed);
    expect((await call("/auth/login", { method: "POST", body: "{}" })).status).toBe(429);
    expect((await call("/health")).status).toBe(429);
  });
});

describe("profiles", () => {
  const profile = { name: "  Lucía  ", categories: [3, 1, 3], work: { lat: -34.60371, lng: -58.38159, radiusM: 5000 } };

  it("stores a profile, normalizes it and exposes only the general zone publicly", async () => {
    const { call } = setup();
    const { body } = await tokenFor(call);
    const saved = await call("/me/profile", authed(body.token, "PUT", profile));
    expect(saved.status).toBe(200);
    const own = ((await saved.json()) as any).profile;
    expect(own).toMatchObject({ name: "Lucía", categories: [1, 3], work: { lat: -34.604, lng: -58.382, radiusM: 5000 }, selfieStatus: "none" });

    const publicView = await call(`/profiles/${owner.address}`);
    const shown = ((await publicView.json()) as any).profile;
    expect(shown.zone).toEqual({ lat: -34.6, lng: -58.38 });
    expect(shown.verified).toBe(false);
    expect(shown).not.toHaveProperty("work");
    expect(shown).not.toHaveProperty("selfieStatus");
  });

  it("updates in place and validates input", async () => {
    const { call, raw } = setup();
    const { body } = await tokenFor(call);
    await call("/me/profile", authed(body.token, "PUT", profile));
    await call("/me/profile", authed(body.token, "PUT", { ...profile, name: "Lucía R" }));
    expect((raw.prepare("SELECT COUNT(*) AS n FROM profiles").get() as { n: number }).n).toBe(1);
    expect((await call("/me/profile", authed(body.token, "PUT", { ...profile, name: "x" }))).status).toBe(400);
    expect((await call("/me/profile", authed(body.token, "PUT", { ...profile, work: { lat: 0, lng: 0, radiusM: 10 } }))).status).toBe(400);
    expect((await call(`/profiles/${stranger.address}`)).status).toBe(404);
    expect((await call("/profiles/nope")).status).toBe(400);
  });
});

describe("changas", () => {
  it("stores a draft, returns the hash and is idempotent", async () => {
    const { call } = setup();
    const { body } = await tokenFor(call);
    const first = await call("/me/changas", authed(body.token, "POST", futureSpec()));
    expect(first.status).toBe(201);
    const data = (await first.json()) as { specHash: string; canonical: string };
    expect(data.specHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(data.canonical).toContain('"lat":-34.604');
    const again = await call("/me/changas", authed(body.token, "POST", futureSpec()));
    expect(again.status).toBe(200);
    expect(((await again.json()) as any).specHash).toBe(data.specHash);
  });

  it("rejects invalid specs and limits unpublished drafts", async () => {
    const { call } = setup();
    const { body } = await tokenFor(call);
    expect((await call("/me/changas", authed(body.token, "POST", { ...futureSpec(), extra: 1 }))).status).toBe(400);
    for (let i = 0; i < MAX_DRAFTS; i++) {
      expect((await call("/me/changas", authed(body.token, "POST", futureSpec(`nonce-${1000 + i}`)))).status).toBe(201);
    }
    expect((await call("/me/changas", authed(body.token, "POST", futureSpec("nonce-9999")))).status).toBe(429);
  });

  it("does not list drafts publicly and only shows the owner their own", async () => {
    const { call } = setup();
    const a = await tokenFor(call);
    const b = await tokenFor(call, stranger);
    await call("/me/changas", authed(a.body.token, "POST", futureSpec()));
    const publicList = await call("/changas?minLat=-35&maxLat=-34&minLng=-59&maxLng=-58");
    expect(((await publicList.json()) as any).changas).toEqual([]);
    expect(((await (await call("/me/changas", authed(a.body.token, "GET"))).json()) as any).changas).toHaveLength(1);
    expect(((await (await call("/me/changas", authed(b.body.token, "GET"))).json()) as any).changas).toHaveLength(0);
  });
});

describe("publishing from chain events", () => {
  const handler = createChangasHandler(new Map([[TOKEN.toLowerCase(), 6]]));
  const query = "minLat=-35&maxLat=-34&minLng=-59&maxLng=-58";

  async function publish(ctx: ReturnType<typeof setup>, account = owner, nonce = "nonce-0001", overrides = {}) {
    const { body } = await tokenFor(ctx.call, account);
    const response = await ctx.call("/me/changas", authed(body.token, "POST", futureSpec(nonce, overrides)));
    return ((await response.json()) as { specHash: string }).specHash;
  }

  it("lists a changa once its order exists on chain, with its amount", async () => {
    const ctx = setup();
    const specHash = await publish(ctx);
    createdEvent(ctx.raw, 7, specHash, owner.address);
    await processEvents(ctx.db, [handler], 100);
    const listed = ((await (await ctx.call(`/changas?${query}`)).json()) as any).changas;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ orderId: 7, status: "open", amount: "10000000", specHash });
    expect(listed[0].spec.area).toEqual({ lat: -34.604, lng: -58.382, radiusM: 300 });
    const detail = await ctx.call(`/changas/${specHash}`);
    expect(((await detail.json()) as any).changas[0].orderId).toBe(7);
  });

  it("ignores an order created by someone else with the same hash", async () => {
    const ctx = setup();
    const specHash = await publish(ctx);
    createdEvent(ctx.raw, 8, specHash, stranger.address);
    await processEvents(ctx.db, [handler], 100);
    expect(((await (await ctx.call(`/changas?${query}`)).json()) as any).changas).toEqual([]);
  });

  it("removes a changa from the map when it is agreed and reopens it when the reservation is withdrawn", async () => {
    const ctx = setup();
    const specHash = await publish(ctx);
    createdEvent(ctx.raw, 9, specHash, owner.address);
    plainEvent(ctx.raw, "OrderAgreed", 9, 200);
    await processEvents(ctx.db, [handler], 100);
    expect(((await (await ctx.call(`/changas?${query}`)).json()) as any).changas).toEqual([]);
    plainEvent(ctx.raw, "ReservationWithdrawn", 9, 300);
    await processEvents(ctx.db, [handler], 100);
    expect((ctx.raw.prepare("SELECT status FROM changas WHERE order_id = 9").get() as { status: string }).status).toBe("open");
  });

  it("filters by bounding box, category, amount and remote", async () => {
    const ctx = setup();
    const near = await publish(ctx, owner, "nonce-0001");
    const far = await publish(ctx, owner, "nonce-0002", { area: { lat: -31.4, lng: -64.18, radiusM: 300 } });
    const remote = await publish(ctx, owner, "nonce-0003", { modality: "remote", area: undefined, category: 5 });
    createdEvent(ctx.raw, 1, near, owner.address, "5000000");
    createdEvent(ctx.raw, 2, far, owner.address, "20000000");
    createdEvent(ctx.raw, 3, remote, owner.address, "8000000");
    await processEvents(ctx.db, [handler], 100);

    const ids = async (path: string) => ((await (await ctx.call(path)).json()) as any).changas.map((c: any) => c.orderId).sort();
    expect(await ids(`/changas?${query}`)).toEqual([1]);
    expect(await ids("/changas?minLat=-32&maxLat=-31&minLng=-65&maxLng=-64")).toEqual([2]);
    expect(await ids("/changas?modality=remote")).toEqual([3]);
    expect(await ids(`/changas?${query}&category=9`)).toEqual([]);
    expect(await ids(`/changas?${query}&minAmount=6000000`)).toEqual([]);
    expect(await ids(`/changas?${query}&maxAmount=6000000`)).toEqual([1]);
  });

  it("requires a bounded bbox and valid filters", async () => {
    const ctx = setup();
    expect((await ctx.call("/changas")).status).toBe(400);
    expect((await ctx.call("/changas?minLat=-40&maxLat=-30&minLng=-70&maxLng=-50")).status).toBe(400);
    expect((await ctx.call(`/changas?${query}&category=abc`)).status).toBe(400);
    expect((await ctx.call("/changas/0x12")).status).toBe(400);
    expect((await ctx.call(`/changas/0x${"00".repeat(32)}`)).status).toBe(404);
  });

  it("purges stale unpublished drafts but keeps published ones", async () => {
    const ctx = setup();
    const draft = await publish(ctx, owner, "nonce-0001");
    const published = await publish(ctx, owner, "nonce-0002");
    createdEvent(ctx.raw, 4, published, owner.address);
    await processEvents(ctx.db, [handler], 100);
    await purgeStaleDrafts(ctx.db, Math.floor(Date.now() / 1000) + 3 * 86400);
    const rows = ctx.raw.prepare("SELECT spec_hash FROM changas").all() as { spec_hash: string }[];
    expect(rows.map((row) => row.spec_hash)).toEqual([published]);
    expect(draft).not.toBe(published);
  });
});

describe("amountMicro", () => {
  it("normalizes token units to micro-dollars", async () => {
    const { amountMicro } = await import("../src/changas");
    expect(amountMicro("10000000", 6)).toBe(10_000_000);
    expect(amountMicro("10000000000000000000", 18)).toBe(10_000_000);
    expect(amountMicro("5", 2)).toBe(50_000);
    expect(amountMicro("340282366920938463463374607431768211455", 6)).toBe(Number.MAX_SAFE_INTEGER);
  });
});
