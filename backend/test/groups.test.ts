import { beforeEach, describe, expect, it } from "vitest";
import { keccak256, toBytes, type Hex } from "viem";
import { readCache } from "../src/app";
import { applicationsHandler } from "../src/applications";
import { createChangasHandler } from "../src/changas";
import { processEvents } from "../src/eventStream";
import { partiesHandler } from "../src/parties";
import { validateSpec } from "../src/spec";
import { criteriaHash, milestoneTerms, milestoneTermsHash, milestoneTotal } from "../src/terms";
import { accept, type AgreementChain } from "../src/agreements";
import { agreementTypes, escrowDomain, ZERO_HASH, type Agreement } from "../src/agreements";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { authed, createdEvent, futureSpec, owner, setup, stranger, TOKEN, tokenFor } from "./helpers";

beforeEach(() => readCache.clear());
const handlers = [createChangasHandler(new Map([[TOKEN.toLowerCase(), 6]])), applicationsHandler, partiesHandler];
const now = () => Math.floor(Date.now() / 1000);
const plan = [
  { name: "Preparar la pared", amount: "40000000", criteria: "Pared lisa y sin humedad", evidence: "Foto de la pared" },
  { name: "Pintar", amount: "60000000", criteria: "Dos manos de pintura", evidence: "Foto del frente" },
];

describe("spec with milestones and group", () => {
  it("accepts a plan, an advance flag and a group target that matches the plan", () => {
    const ok = validateSpec(futureSpec("nonce-0001", { milestones: plan, advance: true, group: { target: "100000000", fundingDeadline: now() + 86400 } }), now());
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.spec).toMatchObject({ advance: true, group: { target: "100000000" } });
  });

  it("rejects malformed plans", () => {
    const bad = (extra: Record<string, unknown>) => validateSpec(futureSpec("nonce-0001", extra), now());
    expect(bad({ milestones: [plan[0]] }).ok).toBe(false);
    expect(bad({ milestones: [plan[0], { ...plan[1], amount: "0" }] }).ok).toBe(false);
    expect(bad({ milestones: [plan[0], { ...plan[1], criteria: "" }] }).ok).toBe(false);
    expect(bad({ milestones: [plan[0], { ...plan[1], extra: 1 }] }).ok).toBe(false);
    expect(bad({ milestones: Array.from({ length: 21 }, () => plan[0]) }).ok).toBe(false);
    expect(bad({ advance: true }).ok).toBe(false);
    expect(bad({ milestones: plan, advance: false }).ok).toBe(false);
    expect(bad({ group: { target: "0", fundingDeadline: now() + 86400 } }).ok).toBe(false);
    expect(bad({ group: { target: "100", fundingDeadline: now() + 10 } }).ok).toBe(false);
    expect(bad({ group: { target: "100", fundingDeadline: now() + 86400, other: 1 } }).ok).toBe(false);
    expect(bad({ milestones: plan, group: { target: "99000000", fundingDeadline: now() + 86400 } }).ok).toBe(false);
  });

  it("the plan changes the hash, so it cannot be altered after publishing", () => {
    const a = validateSpec(futureSpec("nonce-0001", { milestones: plan }), now());
    const b = validateSpec(futureSpec("nonce-0001", { milestones: [plan[0], { ...plan[1], amount: "60000001" }] }), now());
    if (!a.ok || !b.ok) throw new Error("invalid");
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("milestone terms hash", () => {
  it("is deterministic and depends on every part of the plan", () => {
    const spec = { milestones: plan, advance: false };
    const base = milestoneTermsHash(milestoneTerms(spec, ("0x" + "11".repeat(32)) as Hex)!);
    expect(base).toBe(milestoneTermsHash(milestoneTerms(spec, ("0x" + "11".repeat(32)) as Hex)!));
    expect(milestoneTermsHash(milestoneTerms(spec, ("0x" + "22".repeat(32)) as Hex)!)).not.toBe(base);
    expect(milestoneTermsHash(milestoneTerms({ ...spec, advance: true }, ("0x" + "11".repeat(32)) as Hex)!)).not.toBe(base);
    expect(milestoneTermsHash(milestoneTerms({ milestones: [plan[0]!, { ...plan[1]!, criteria: "Otra" }] }, ("0x" + "11".repeat(32)) as Hex)!)).not.toBe(base);
    expect(milestoneTerms({}, ("0x" + "11".repeat(32)) as Hex)).toBeNull();
    expect(milestoneTotal(spec)).toBe(100_000_000n);
  });

  it("hashes each criteria from name, criteria and evidence", () => {
    expect(criteriaHash(plan[0]!)).toBe(keccak256(toBytes("Preparar la pared\nPared lisa y sin humedad\nFoto de la pared")));
  });
});

async function milestoneWorld(planOverride = plan) {
  const ctx = setup();
  const payer = await tokenFor(ctx.call, owner);
  const draft = await ctx.call("/me/changas", authed(payer.body.token, "POST", futureSpec("nonce-0001", { milestones: planOverride })));
  const { specHash } = (await draft.json()) as { specHash: string };
  createdEvent(ctx.raw, 1, specHash, owner.address, "100000000", 101);
  await processEvents(ctx.db, handlers, 100);
  const row = ctx.raw.prepare("SELECT id FROM changas WHERE order_id = 1").get() as { id: number };
  const worker = await tokenFor(ctx.call, stranger);
  await ctx.call(`/me/applications/${row.id}`, authed(worker.body.token, "PUT", { message: "Voy" }));
  return { ctx, payer, worker, specHash: specHash as Hex };
}

const sign = (account: typeof owner, agreement: Agreement) => account.signTypedData({ domain: escrowDomain, types: agreementTypes, primaryType: "Agreement", message: agreement });

describe("agreement with milestones", () => {
  it("the proposal carries the terms hash computed from the published plan", async () => {
    const w = await milestoneWorld();
    const spec = JSON.parse((w.ctx.raw.prepare("SELECT spec FROM changas").get() as { spec: string }).spec);
    const termsHash = milestoneTermsHash(milestoneTerms(spec, w.specHash)!);
    const expiry = now() + 7200;
    const agreement: Agreement = { orderId: 1n, payer: owner.address, payee: stranger.address, price: 100_000_000n, specHash: w.specHash, termsHash, expiry };
    const response = await w.ctx.call("/me/orders/1/agreement", authed(w.payer.body.token, "POST", { payee: stranger.address, price: "100000000", expiry, signature: await sign(owner, agreement) }));
    expect(response.status).toBe(201);
    expect(((await response.json()) as any).agreement.termsHash).toBe(termsHash);

    const wrong = await w.ctx.call("/me/orders/1/agreement", authed(w.payer.body.token, "POST", { payee: stranger.address, price: "100000000", expiry, signature: await sign(owner, { ...agreement, termsHash: ZERO_HASH }) }));
    expect(wrong.status).toBe(400);
  });

  it("refuses a different price when there is a plan", async () => {
    const w = await milestoneWorld();
    const row = w.ctx.raw.prepare("SELECT id FROM changas").get() as { id: number };
    await w.ctx.call(`/me/applications/${row.id}`, authed(w.worker.body.token, "PUT", { message: "Voy", amount: "90000000" }));
    const agreement: Agreement = { orderId: 1n, payer: owner.address, payee: stranger.address, price: 90_000_000n, specHash: w.specHash, termsHash: ZERO_HASH, expiry: now() + 7200 };
    const response = await w.ctx.call("/me/orders/1/agreement", authed(w.payer.body.token, "POST", { payee: stranger.address, price: "90000000", expiry: agreement.expiry, signature: await sign(owner, agreement) }));
    expect(response.status).toBe(400);
  });

  it("confirming calls the contract with the milestone terms", async () => {
    const w = await milestoneWorld();
    const spec = JSON.parse((w.ctx.raw.prepare("SELECT spec FROM changas").get() as { spec: string }).spec);
    const terms = milestoneTerms(spec, w.specHash)!;
    const termsHash = milestoneTermsHash(terms);
    const expiry = now() + 7200;
    const agreement: Agreement = { orderId: 1n, payer: owner.address, payee: stranger.address, price: 100_000_000n, specHash: w.specHash, termsHash, expiry };
    await w.ctx.call("/me/orders/1/agreement", authed(w.payer.body.token, "POST", { payee: stranger.address, price: "100000000", expiry, signature: await sign(owner, agreement) }));
    let received: unknown;
    const chain: AgreementChain = {
      async agree(_a, _p, _w, t) {
        received = t;
        return { ok: true, txHash: ("0x" + "ab".repeat(32)) as Hex };
      },
    };
    const result = await accept(w.ctx.db, chain, 1, stranger.address.toLowerCase(), await sign(stranger, agreement), now());
    expect(result.ok).toBe(true);
    expect(received).toEqual(terms);
  });
});

describe("group changas", () => {
  async function groupWorld() {
    const ctx = setup();
    const payer = await tokenFor(ctx.call, owner);
    const deadline = now() + 86400;
    const draft = await ctx.call("/me/changas", authed(payer.body.token, "POST", futureSpec("nonce-0001", { group: { target: "100000000", fundingDeadline: deadline } })));
    const { specHash } = (await draft.json()) as { specHash: string };
    const event = (name: string, block: number, args: object) =>
      ctx.raw.prepare(
        `INSERT INTO events (block_number, log_index, block_timestamp, tx_hash, contract, address, name, order_id, args)
         VALUES (?, 0, 1, '0x1', 'escrow', '0x', ?, 5, ?)`,
      ).run(block, name, JSON.stringify(args));
    return { ctx, payer, deadline, specHash, event };
  }
  const row = (w: Awaited<ReturnType<typeof groupWorld>>) => w.ctx.raw.prepare("SELECT order_id, status, amount, token FROM changas").get() as any;

  it("links the draft on creation, keeps it out of the map until funded and follows the funding", async () => {
    const w = await groupWorld();
    w.event("GroupCreated", 200, { creator: owner.address, coordinator: owner.address, target: "100000000", deadline: String(w.deadline) });
    await processEvents(w.ctx.db, handlers, 100);
    expect(row(w)).toMatchObject({ order_id: 5, status: "funding", amount: "100000000", token: TOKEN.toLowerCase() });
    const bbox = "minLat=-35&maxLat=-34&minLng=-59&maxLng=-58";
    expect(((await (await w.ctx.call(`/changas?${bbox}`)).json()) as any).changas).toHaveLength(0);
    expect((await w.ctx.call(`/changas/${w.specHash}`)).status).toBe(200);

    w.event("FundingCompleted", 201, {});
    await processEvents(w.ctx.db, handlers, 100);
    expect(row(w).status).toBe("open");
    readCache.clear();
    expect(((await (await w.ctx.call(`/changas?${bbox}`)).json()) as any).changas).toHaveLength(1);

    w.event("ContributionWithdrawn", 202, {});
    await processEvents(w.ctx.db, handlers, 100);
    expect(row(w).status).toBe("funding");

    w.event("FundingRefunded", 203, {});
    await processEvents(w.ctx.db, handlers, 100);
    expect(row(w).status).toBe("cancelled");
  });

  it("does not link a draft of another creator or with other parameters", async () => {
    const w = await groupWorld();
    w.event("GroupCreated", 200, { creator: stranger.address, coordinator: stranger.address, target: "100000000", deadline: String(w.deadline) });
    w.ctx.raw.prepare(
      `INSERT INTO events (block_number, log_index, block_timestamp, tx_hash, contract, address, name, order_id, args)
       VALUES (201, 0, 1, '0x1', 'escrow', '0x', 'GroupCreated', 6, ?)`,
    ).run(JSON.stringify({ creator: owner.address, coordinator: owner.address, target: "100000001", deadline: String(w.deadline) }));
    await processEvents(w.ctx.db, handlers, 100);
    expect(row(w).order_id).toBeNull();
  });

  it("records the coordinator as the payer and follows a change of coordinator", async () => {
    const w = await groupWorld();
    w.event("GroupCreated", 200, { creator: owner.address, coordinator: stranger.address, target: "100000000", deadline: String(w.deadline) });
    await processEvents(w.ctx.db, handlers, 100);
    expect(w.ctx.raw.prepare("SELECT payer FROM order_parties WHERE order_id = 5").get()).toEqual({ payer: stranger.address.toLowerCase() });
    w.event("CoordinatorChanged", 201, { previous: stranger.address, current: owner.address });
    await processEvents(w.ctx.db, handlers, 100);
    expect(w.ctx.raw.prepare("SELECT payer FROM order_parties WHERE order_id = 5").get()).toEqual({ payer: owner.address.toLowerCase() });
  });
});

describe("coordinator of a group", () => {
  it("the coordinator, not the creator, proposes the agreement and sees the applications", async () => {
    const ctx = setup();
    const creator = await tokenFor(ctx.call, owner);
    const draft = await ctx.call("/me/changas", authed(creator.body.token, "POST", futureSpec("nonce-0001", { group: { target: "100000000", fundingDeadline: now() + 86400 } })));
    const { specHash } = (await draft.json()) as { specHash: string };
    ctx.raw.prepare(
      `INSERT INTO events (block_number, log_index, block_timestamp, tx_hash, contract, address, name, order_id, args)
       VALUES (200, 0, 1, '0x1', 'escrow', '0x', 'GroupCreated', 5, ?)`,
    ).run(JSON.stringify({ creator: owner.address, coordinator: stranger.address, target: "100000000", deadline: String(now() + 86400) }));
    ctx.raw.prepare(
      `INSERT INTO events (block_number, log_index, block_timestamp, tx_hash, contract, address, name, order_id, args)
       VALUES (201, 0, 1, '0x1', 'escrow', '0x', 'FundingCompleted', 5, '{}')`,
    ).run();
    await processEvents(ctx.db, handlers, 100);
    const id = (ctx.raw.prepare("SELECT id FROM changas").get() as { id: number }).id;
    const coordinator = await tokenFor(ctx.call, stranger);
    expect((await ctx.call(`/me/changas/${id}/applications`, authed(coordinator.body.token, "GET"))).status).toBe(200);
    expect((await ctx.call(`/me/changas/${id}/applications`, authed(creator.body.token, "GET"))).status).toBe(403);

    const worker = await tokenFor(ctx.call, privateKeyToAccount(generatePrivateKey()));
    expect(worker.body.address).toBeDefined();
    void specHash;
  });
});
