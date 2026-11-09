import { beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { type Hex } from "viem";
import { readCache } from "../src/app";
import { applicationsHandler } from "../src/applications";
import { createChangasHandler } from "../src/changas";
import { processEvents } from "../src/eventStream";
import { escrowDomain } from "../src/agreements";
import { milestoneReleaseTypes, releaseTypes } from "../src/releases";
import { partiesHandler } from "../src/parties";
import { validateSpec } from "../src/spec";
import { admin, authed, createdEvent, futureSpec, owner, plainEvent, setup, stranger, TOKEN, tokenFor } from "./helpers";

beforeEach(() => readCache.clear());
const handlers = [createChangasHandler(new Map([[TOKEN.toLowerCase(), 6]])), applicationsHandler, partiesHandler];
const now = () => Math.floor(Date.now() / 1000);
const EVIDENCE = ("0x" + "ab".repeat(32)) as Hex;
const plan = [
  { name: "Preparar", amount: "40000000", criteria: "Pared lisa", evidence: "Foto" },
  { name: "Pintar", amount: "60000000", criteria: "Dos manos", evidence: "Foto" },
];

async function delivered(extra: Record<string, unknown> = {}) {
  const ctx = setup();
  const payer = await tokenFor(ctx.call, owner);
  const draft = await ctx.call("/me/changas", authed(payer.body.token, "POST", futureSpec("nonce-0001", extra)));
  const { specHash } = (await draft.json()) as { specHash: string };
  createdEvent(ctx.raw, 1, specHash, owner.address, "100000000", 101);
  plainEvent(ctx.raw, "OrderAgreed", 1, 102, { payee: stranger.address });
  await processEvents(ctx.db, handlers, 100);
  const worker = await tokenFor(ctx.call, stranger);
  return { ctx, payer, worker, specHash };
}

const releaseBody = async (signer: typeof owner, patch: Record<string, unknown> = {}) => {
  const expiry = now() + 7200;
  const base = { amount: "100000000", rating: 5, evidenceHash: EVIDENCE, expiry, ...patch };
  const signature = await signer.signTypedData({
    domain: escrowDomain,
    types: releaseTypes,
    primaryType: "Release",
    message: { orderId: 1n, payee: stranger.address, amount: BigInt(base.amount as string), rating: base.rating as number, evidenceHash: base.evidenceHash as Hex, expiry: base.expiry as number },
  });
  return { ...base, signature };
};

describe("remote approval", () => {
  it("stores the payer's signature once the work is delivered and the payee can read it", async () => {
    const w = await delivered();
    plainEvent(w.ctx.raw, "OrderDelivered", 1, 103);
    await processEvents(w.ctx.db, handlers, 100);
    const response = await w.ctx.call("/me/orders/1/release", authed(w.payer.body.token, "POST", await releaseBody(owner)));
    expect(response.status).toBe(201);
    expect(w.ctx.raw.prepare("SELECT kind, address FROM notifications WHERE kind = 'release_ready'").get()).toMatchObject({ address: stranger.address.toLowerCase() });

    const seen = (await (await w.ctx.call("/me/orders/1/release", authed(w.worker.body.token, "GET"))).json()) as any;
    expect(seen.release).toMatchObject({ index: null, amount: "100000000", rating: 5, payee: stranger.address.toLowerCase() });
    expect(seen.release.signature).toMatch(/^0x/);
  });

  it("rejects the wrong signer, a stranger, a wrong state and a bad expiry", async () => {
    const w = await delivered();
    const body = await releaseBody(owner);
    expect((await w.ctx.call("/me/orders/1/release", authed(w.payer.body.token, "POST", body))).status).toBe(409);
    plainEvent(w.ctx.raw, "OrderDelivered", 1, 103);
    await processEvents(w.ctx.db, handlers, 100);
    expect((await w.ctx.call("/me/orders/1/release", authed(w.worker.body.token, "POST", body))).status).toBe(403);
    expect((await w.ctx.call("/me/orders/1/release", authed(w.payer.body.token, "POST", await releaseBody(stranger)))).status).toBe(400);
    expect((await w.ctx.call("/me/orders/1/release", authed(w.payer.body.token, "POST", await releaseBody(owner, { expiry: now() + 10 })))).status).toBe(400);
    expect((await w.ctx.call("/me/orders/1/release", authed(w.payer.body.token, "POST", { ...body, rating: 9 }))).status).toBe(400);
    expect((await w.ctx.call("/me/orders/1/release", authed(w.payer.body.token, "POST", { ...body, amount: "5" }))).status).toBe(400);
    expect((await w.ctx.call("/me/orders/9/release", authed(w.payer.body.token, "POST", body))).status).toBe(404);
  });

  it("hides it from strangers, hides it once expired and lets the payer cancel it", async () => {
    const w = await delivered();
    plainEvent(w.ctx.raw, "OrderDelivered", 1, 103);
    await processEvents(w.ctx.db, handlers, 100);
    await w.ctx.call("/me/orders/1/release", authed(w.payer.body.token, "POST", await releaseBody(owner)));
    const outsider = await tokenFor(w.ctx.call, privateKeyToAccount(generatePrivateKey()));
    expect((await w.ctx.call("/me/orders/1/release", authed(outsider.body.token, "GET"))).status).toBe(404);
    w.ctx.raw.prepare("UPDATE releases SET expiry = ?").run(now() - 5);
    expect(((await (await w.ctx.call("/me/orders/1/release", authed(w.worker.body.token, "GET"))).json()) as any).release).toBeNull();
    w.ctx.raw.prepare("UPDATE releases SET expiry = ?").run(now() + 600);
    expect((await w.ctx.call("/me/orders/1/release", authed(w.worker.body.token, "DELETE"))).status).toBe(404);
    expect((await w.ctx.call("/me/orders/1/release", authed(w.payer.body.token, "DELETE"))).status).toBe(200);
    expect(((await (await w.ctx.call("/me/orders/1/release", authed(w.worker.body.token, "GET"))).json()) as any).release).toBeNull();
  });

  it("accepts a milestone release while the order is agreed", async () => {
    const w = await delivered({ milestones: plan });
    const expiry = now() + 7200;
    const message = { orderId: 1n, index: 0, amount: 40_000_000n, rating: 4, evidenceHash: EVIDENCE, expiry };
    const signature = await owner.signTypedData({ domain: escrowDomain, types: milestoneReleaseTypes, primaryType: "MilestoneRelease", message });
    const body = { index: 0, amount: "40000000", rating: 4, evidenceHash: EVIDENCE, expiry, signature };
    expect((await w.ctx.call("/me/orders/1/release", authed(w.payer.body.token, "POST", body))).status).toBe(201);
    const seen = (await (await w.ctx.call("/me/orders/1/release", authed(w.worker.body.token, "GET"))).json()) as any;
    expect(seen.release).toMatchObject({ index: 0, amount: "40000000" });
    expect((await w.ctx.call("/me/orders/1/release", authed(w.payer.body.token, "POST", { ...body, index: 1 }))).status).toBe(400);
  });
});

describe("contributions", () => {
  it("lists the group changas where I contributed and forgets the withdrawn ones", async () => {
    const ctx = setup();
    const person = await tokenFor(ctx.call, stranger);
    const event = (name: string, block: number, args: object) =>
      ctx.raw.prepare(
        `INSERT INTO events (block_number, log_index, block_timestamp, tx_hash, contract, address, name, order_id, args)
         VALUES (?, 0, 1, '0x1', 'escrow', '0x', ?, 5, ?)`,
      ).run(block, name, JSON.stringify(args));
    event("Contributed", 300, { contributor: stranger.address, amount: "5", total: "5" });
    await processEvents(ctx.db, handlers, 100);
    expect(((await (await ctx.call("/me/contributions", authed(person.body.token, "GET"))).json()) as any).contributions).toMatchObject([{ orderId: 5 }]);
    event("ContributionWithdrawn", 301, { contributor: stranger.address, amount: "5" });
    await processEvents(ctx.db, handlers, 100);
    expect(((await (await ctx.call("/me/contributions", authed(person.body.token, "GET"))).json()) as any).contributions).toEqual([]);
  });
});

describe("applicant plan", () => {
  async function published() {
    const ctx = setup();
    const payer = await tokenFor(ctx.call, owner);
    const draft = await ctx.call("/me/changas", authed(payer.body.token, "POST", futureSpec("nonce-0001", { milestones: plan })));
    const { specHash } = (await draft.json()) as { specHash: string };
    createdEvent(ctx.raw, 1, specHash, owner.address, "100000000", 101);
    await processEvents(ctx.db, handlers, 100);
    const id = (ctx.raw.prepare("SELECT id FROM changas").get() as { id: number }).id;
    return { ctx, id, payer, worker: await tokenFor(ctx.call, stranger) };
  }
  const adjusted = [
    { name: "Preparar y lijar", amount: "30000000", criteria: "Pared lijada", evidence: "Foto" },
    { name: "Pintar", amount: "70000000", criteria: "Dos manos", evidence: "Foto" },
  ];

  it("accepts a proposal that adds up to the published amount and shows it to the owner", async () => {
    const p = await published();
    const response = await p.ctx.call(`/me/applications/${p.id}`, authed(p.worker.body.token, "PUT", { message: "Ajusté los montos", plan: { milestones: adjusted, advance: false } }));
    expect(response.status).toBe(201);
    const list = (await (await p.ctx.call(`/me/changas/${p.id}/applications`, authed(p.payer.body.token, "GET"))).json()) as any;
    expect(list.applications[0].plan.milestones[0].amount).toBe("30000000");
  });

  it("rejects totals that do not match, plans on changas without one and mixed prices", async () => {
    const p = await published();
    const put = (body: unknown) => p.ctx.call(`/me/applications/${p.id}`, authed(p.worker.body.token, "PUT", body));
    expect((await put({ message: "x", plan: { milestones: [adjusted[0], { ...adjusted[1], amount: "60000000" }] } })).status).toBe(400);
    expect((await put({ message: "x", amount: "90000000", plan: { milestones: adjusted } })).status).toBe(400);
    expect((await put({ message: "x", plan: { milestones: [adjusted[0]] } })).status).toBe(400);
    expect((await put({ message: "x", plan: { milestones: adjusted, other: 1 } })).status).toBe(400);

    const ctx = setup();
    const payer = await tokenFor(ctx.call, owner);
    const draft = await ctx.call("/me/changas", authed(payer.body.token, "POST", futureSpec("nonce-0002")));
    const { specHash } = (await draft.json()) as { specHash: string };
    createdEvent(ctx.raw, 2, specHash, owner.address, "100000000", 150);
    await processEvents(ctx.db, handlers, 100);
    const id = (ctx.raw.prepare("SELECT id FROM changas").get() as { id: number }).id;
    const worker = await tokenFor(ctx.call, stranger);
    expect((await ctx.call(`/me/applications/${id}`, authed(worker.body.token, "PUT", { message: "x", plan: { milestones: adjusted } }))).status).toBe(400);
  });
});

describe("materials option in the spec", () => {
  it("accepts the three options and rejects anything else", () => {
    for (const option of ["payer", "advance", "worker"]) expect(validateSpec(futureSpec("nonce-0001", { materials: option }), now()).ok).toBe(true);
    expect(validateSpec(futureSpec("nonce-0001", { materials: "other" }), now()).ok).toBe(false);
    expect(validateSpec(futureSpec("nonce-0001", { materials: 3 }), now()).ok).toBe(false);
  });
});

describe("content reports", () => {
  async function reportable() {
    const ctx = setup();
    const boss = await tokenFor(ctx.call, admin);
    const payer = await tokenFor(ctx.call, owner);
    await ctx.call("/me/profile", authed(payer.body.token, "PUT", { name: "Ana", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 2000 } }));
    const draft = await ctx.call("/me/changas", authed(payer.body.token, "POST", futureSpec("nonce-0001")));
    const { specHash } = (await draft.json()) as { specHash: string };
    createdEvent(ctx.raw, 1, specHash, owner.address, "10000000", 101);
    await processEvents(ctx.db, handlers, 100);
    const id = (ctx.raw.prepare("SELECT id FROM changas").get() as { id: number }).id;
    return { ctx, boss, payer, id, reporter: await tokenFor(ctx.call, stranger), specHash };
  }

  it("validates the report and keeps one per reporter and target", async () => {
    const r = await reportable();
    const post = (body: unknown, token = r.reporter.body.token) => r.ctx.call("/me/reports", authed(token, "POST", body));
    expect((await post({ kind: "changa", target: String(r.id), reason: "Contenido inapropiado" })).status).toBe(201);
    expect((await post({ kind: "changa", target: String(r.id), reason: "Otra vez" })).status).toBe(409);
    expect((await post({ kind: "changa", target: "99", reason: "No existe" })).status).toBe(404);
    expect((await post({ kind: "user", target: owner.address, reason: "Perfil falso" })).status).toBe(201);
    expect((await post({ kind: "user", target: stranger.address, reason: "Yo mismo" })).status).toBe(400);
    expect((await post({ kind: "user", target: "0x123", reason: "Mal" })).status).toBe(400);
    expect((await post({ kind: "other", target: "1", reason: "Mal tipo" })).status).toBe(400);
    expect((await post({ kind: "changa", target: String(r.id), reason: "ab" })).status).toBe(400);
  });

  it("lists open reports for the admin, counts repeats and can hide the changa with a reason", async () => {
    const r = await reportable();
    const other = await tokenFor(r.ctx.call, privateKeyToAccount(generatePrivateKey()));
    for (const who of [r.reporter, other]) await r.ctx.call("/me/reports", authed(who.body.token, "POST", { kind: "changa", target: String(r.id), reason: "Estafa" }));
    const list = (await (await r.ctx.call("/admin/reports", authed(r.boss.body.token, "GET"))).json()) as any;
    expect(list.reports).toHaveLength(2);
    expect(list.reports[0]).toMatchObject({ kind: "changa", title: "Cambiar una canilla", total: 2 });
    expect((await r.ctx.call("/me/reports", authed(r.reporter.body.token, "GET"))).status).toBe(404);
    expect((await r.ctx.call("/admin/reports", authed(r.reporter.body.token, "GET"))).status).toBe(403);

    const id = list.reports[0].id;
    expect((await r.ctx.call(`/admin/reports/${id}`, authed(r.boss.body.token, "POST", { action: "hide" }))).status).toBe(400);
    expect((await r.ctx.call(`/admin/reports/${id}`, authed(r.boss.body.token, "POST", { action: "hide", reason: "Confirmado" }))).status).toBe(200);
    expect(r.ctx.raw.prepare("SELECT hidden FROM changas").get()).toEqual({ hidden: 1 });
    expect(((await (await r.ctx.call("/admin/reports", authed(r.boss.body.token, "GET"))).json()) as any).reports).toHaveLength(0);
    const log = ((await (await r.ctx.call("/admin/log", authed(r.boss.body.token, "GET"))).json()) as any).log;
    expect(log[0]).toMatchObject({ action: "report_hide", target: `changa:${r.id}`, reason: "Confirmado" });
    expect((await r.ctx.call(`/admin/reports/${id}`, authed(r.boss.body.token, "POST", { action: "dismiss", reason: "Ya resuelto" }))).status).toBe(404);
  });
});
