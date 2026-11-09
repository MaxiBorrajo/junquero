import { beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { app, readCache } from "../src/app";
import { applicationsHandler, MAX_ACTIVE_PER_APPLICANT, MAX_ACTIVE_PER_CHANGA } from "../src/applications";
import { createChangasHandler } from "../src/changas";
import { processEvents } from "../src/eventStream";
import { authed, createdEvent, futureSpec, owner, plainEvent, setup, stranger, TOKEN, tokenFor } from "./helpers";

beforeEach(() => readCache.clear());

const handler = createChangasHandler(new Map([[TOKEN.toLowerCase(), 6]]));
const handlers = [handler, applicationsHandler];

async function openChanga(ctx: ReturnType<typeof setup>, orderId = 1, nonce = "nonce-0001") {
  const { body } = await tokenFor(ctx.call, owner);
  const draft = await ctx.call("/me/changas", authed(body.token, "POST", futureSpec(nonce)));
  const { specHash } = (await draft.json()) as { specHash: string };
  createdEvent(ctx.raw, orderId, specHash, owner.address, "10000000", 100 + orderId);
  await processEvents(ctx.db, handlers, 100);
  const row = ctx.raw.prepare("SELECT id FROM changas WHERE order_id = ?").get(orderId) as { id: number };
  return { id: row.id, ownerToken: body.token, specHash };
}

const apply = (ctx: ReturnType<typeof setup>, token: string, id: number, body: unknown = { message: "Puedo ir hoy" }) =>
  ctx.call(`/me/applications/${id}`, authed(token, "PUT", body));

describe("applying", () => {
  it("creates an application, with an optional counter offer, and updates it in place", async () => {
    const ctx = setup();
    const { id } = await openChanga(ctx);
    const worker = await tokenFor(ctx.call, stranger);
    const first = await apply(ctx, worker.body.token, id, { message: "  Puedo ir hoy  ", amount: "12000000" });
    expect(first.status).toBe(201);
    expect(((await first.json()) as any).application).toMatchObject({ amount: "12000000", message: "Puedo ir hoy", status: "active" });
    const second = await apply(ctx, worker.body.token, id, { message: "Mejor mañana" });
    expect(second.status).toBe(200);
    expect(((await second.json()) as any).application).toMatchObject({ amount: null, message: "Mejor mañana" });
    expect((ctx.raw.prepare("SELECT COUNT(*) AS n FROM applications").get() as { n: number }).n).toBe(1);
  });

  it("rejects invalid input", async () => {
    const ctx = setup();
    const { id } = await openChanga(ctx);
    const worker = await tokenFor(ctx.call, stranger);
    for (const body of [
      { amount: "0" },
      { amount: "-5" },
      { amount: 5 },
      { message: "x".repeat(501) },
      { message: 7 },
      { attachments: [{}, {}, {}, {}] },
      { attachments: [{ hash: "0x12", name: "a", mime: "image/png", size: 1 }] },
    ]) {
      expect((await apply(ctx, worker.body.token, id, body)).status).toBe(400);
    }
    expect((await apply(ctx, worker.body.token, 0)).status).toBe(400);
    expect((await ctx.call(`/me/applications/${id}`, { method: "PUT", body: "nope", headers: { authorization: `Bearer ${worker.body.token}` } })).status).toBe(400);
  });

  it("blocks the owner, unknown changas, unpublished drafts and closed changas", async () => {
    const ctx = setup();
    const { id, ownerToken } = await openChanga(ctx);
    expect((await apply(ctx, ownerToken, id)).status).toBe(403);

    const worker = await tokenFor(ctx.call, stranger);
    expect((await apply(ctx, worker.body.token, 999)).status).toBe(404);

    const draft = await ctx.call("/me/changas", authed(ownerToken, "POST", futureSpec("nonce-0002")));
    expect(draft.status).toBe(201);
    const draftId = (ctx.raw.prepare("SELECT id FROM changas WHERE order_id IS NULL").get() as { id: number }).id;
    expect((await apply(ctx, worker.body.token, draftId)).status).toBe(404);

    plainEvent(ctx.raw, "OrderAgreed", 1, 500, { payee: stranger.address });
    await processEvents(ctx.db, handlers, 100);
    expect((await apply(ctx, worker.body.token, id)).status).toBe(409);
  });

  it("requires a verified selfie only when the switch is on", async () => {
    const ctx = setup();
    const { id } = await openChanga(ctx);
    const worker = await tokenFor(ctx.call, stranger);
    const strict = { ...ctx.env, REQUIRE_VERIFIED_APPLICANT: "true" };
    const call = () =>
      app.request(`/me/applications/${id}`, authed(worker.body.token, "PUT", { message: "hola" }), strict as typeof ctx.env);
    expect((await call()).status).toBe(403);
    ctx.raw.prepare("INSERT INTO profiles (address, name, work_lat_e3, work_lng_e3, work_radius_m, selfie_status, created_at, updated_at) VALUES (?, 'Ana', 0, 0, 1000, 'approved', 1, 1)").run(stranger.address.toLowerCase());
    expect((await call()).status).toBe(201);
  });

  it("caps active applications per changa and per applicant", async () => {
    const ctx = setup();
    const { id } = await openChanga(ctx);
    for (let i = 0; i < MAX_ACTIVE_PER_CHANGA; i++) {
      ctx.raw.prepare("INSERT INTO applications (changa_id, applicant, status, created_at, updated_at) VALUES (?, ?, 'active', 1, 1)").run(id, `0xfill${i}`);
    }
    const worker = await tokenFor(ctx.call, stranger);
    expect((await apply(ctx, worker.body.token, id)).status).toBe(429);

    const other = setup();
    const target = await openChanga(other, 5, "nonce-0005");
    for (let i = 0; i < MAX_ACTIVE_PER_APPLICANT; i++) {
      other.raw.prepare("INSERT INTO applications (changa_id, applicant, status, created_at, updated_at) VALUES (?, ?, 'active', 1, 1)").run(1000 + i, stranger.address.toLowerCase());
    }
    const busy = await tokenFor(other.call, stranger);
    expect((await apply(other, busy.body.token, target.id)).status).toBe(429);
  });
});

describe("withdrawing and reading", () => {
  it("withdraws, lists my applications with the changa state, and allows applying again", async () => {
    const ctx = setup();
    const { id, specHash } = await openChanga(ctx);
    const worker = await tokenFor(ctx.call, stranger);
    await apply(ctx, worker.body.token, id);
    expect((await ctx.call(`/me/applications/${id}`, authed(worker.body.token, "DELETE"))).status).toBe(200);
    expect((await ctx.call(`/me/applications/${id}`, authed(worker.body.token, "DELETE"))).status).toBe(404);

    const mine = ((await (await ctx.call("/me/applications", authed(worker.body.token, "GET"))).json()) as any).applications;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ status: "withdrawn", changa: { specHash, orderId: 1, status: "open" } });

    expect((await apply(ctx, worker.body.token, id)).status).toBe(200);
  });

  it("shows applications only to the owner, with the applicant's public profile", async () => {
    const ctx = setup();
    const { id, ownerToken } = await openChanga(ctx);
    const worker = await tokenFor(ctx.call, stranger);
    await ctx.call("/me/profile", authed(worker.body.token, "PUT", { name: "Ana", work: { lat: -34.6037, lng: -58.3816, radiusM: 3000 } }));
    await apply(ctx, worker.body.token, id, { message: "Hola", amount: "9000000" });

    const list = await ctx.call(`/me/changas/${id}/applications`, authed(ownerToken, "GET"));
    const applications = ((await list.json()) as any).applications;
    expect(applications).toHaveLength(1);
    expect(applications[0]).toMatchObject({
      amount: "9000000",
      profile: { name: "Ana", verified: false, zone: { lat: -34.6, lng: -58.38 } },
    });

    expect((await ctx.call(`/me/changas/${id}/applications`, authed(worker.body.token, "GET"))).status).toBe(403);
    expect((await ctx.call("/me/changas/999/applications", authed(ownerToken, "GET"))).status).toBe(404);
    expect((await ctx.call(`/me/changas/${id}/applications`)).status).toBe(401);
  });

  it("does not list withdrawn applications to the owner", async () => {
    const ctx = setup();
    const { id, ownerToken } = await openChanga(ctx);
    const worker = await tokenFor(ctx.call, stranger);
    await apply(ctx, worker.body.token, id);
    await ctx.call(`/me/applications/${id}`, authed(worker.body.token, "DELETE"));
    const list = ((await (await ctx.call(`/me/changas/${id}/applications`, authed(ownerToken, "GET"))).json()) as any).applications;
    expect(list).toEqual([]);
  });
});

describe("chain events", () => {
  async function twoApplicants(ctx: ReturnType<typeof setup>, id: number) {
    const a = await tokenFor(ctx.call, stranger);
    const third = privateKeyToAccount(generatePrivateKey());
    const b = await tokenFor(ctx.call, third);
    await apply(ctx, a.body.token, id);
    await apply(ctx, b.body.token, id);
    return { chosen: stranger.address.toLowerCase(), other: third.address.toLowerCase() };
  }
  const statuses = (ctx: ReturnType<typeof setup>) =>
    Object.fromEntries((ctx.raw.prepare("SELECT applicant, status FROM applications").all() as any[]).map((r) => [r.applicant, r.status]));

  it("marks the chosen applicant and closes the rest when the order is agreed", async () => {
    const ctx = setup();
    const { id } = await openChanga(ctx);
    const { chosen, other } = await twoApplicants(ctx, id);
    plainEvent(ctx.raw, "OrderAgreed", 1, 500, { payee: stranger.address, price: "10000000" });
    await processEvents(ctx.db, handlers, 100);
    expect(statuses(ctx)).toEqual({ [chosen]: "chosen", [other]: "closed" });
  });

  it("closes pending applications when the order is cancelled", async () => {
    const ctx = setup();
    const { id } = await openChanga(ctx);
    const { chosen, other } = await twoApplicants(ctx, id);
    plainEvent(ctx.raw, "OrderCancelled", 1, 500);
    await processEvents(ctx.db, handlers, 100);
    expect(statuses(ctx)).toEqual({ [chosen]: "closed", [other]: "closed" });
  });

  it("ignores agreed events without a valid payee", async () => {
    const ctx = setup();
    const { id } = await openChanga(ctx);
    const { chosen, other } = await twoApplicants(ctx, id);
    plainEvent(ctx.raw, "OrderAgreed", 1, 500, { payee: "nope" });
    await processEvents(ctx.db, handlers, 100);
    expect(statuses(ctx)).toEqual({ [chosen]: "active", [other]: "active" });
  });
});
