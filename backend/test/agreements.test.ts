import { beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { readCache } from "../src/app";
import { accept, agreementTypes, escrowDomain, purgeAgreements, ZERO_HASH, type Agreement, type AgreementChain } from "../src/agreements";
import { applicationsHandler } from "../src/applications";
import { createChangasHandler } from "../src/changas";
import { processEvents } from "../src/eventStream";
import { authed, createdEvent, futureSpec, owner, setup, stranger, TOKEN, tokenFor } from "./helpers";

beforeEach(() => readCache.clear());

const handlers = [createChangasHandler(new Map([[TOKEN.toLowerCase(), 6]])), applicationsHandler];
const other = privateKeyToAccount(generatePrivateKey());

async function scenario(applicationAmount?: string) {
  const ctx = setup();
  const payer = await tokenFor(ctx.call, owner);
  const draft = await ctx.call("/me/changas", authed(payer.body.token, "POST", futureSpec()));
  const { specHash } = (await draft.json()) as { specHash: string };
  createdEvent(ctx.raw, 1, specHash, owner.address, "10000000", 101);
  await processEvents(ctx.db, handlers, 100);
  const row = ctx.raw.prepare("SELECT id FROM changas WHERE order_id = 1").get() as { id: number };
  const worker = await tokenFor(ctx.call, stranger);
  await ctx.call(`/me/applications/${row.id}`, authed(worker.body.token, "PUT", { message: "Voy", ...(applicationAmount ? { amount: applicationAmount } : {}) }));
  const price = applicationAmount ?? "10000000";
  const now = Math.floor(Date.now() / 1000);
  const agreement = (expiry = now + 7200, payee = stranger.address, amount = price): Agreement => ({
    orderId: 1n,
    payer: owner.address,
    payee: payee as `0x${string}`,
    price: BigInt(amount),
    specHash: specHash as `0x${string}`,
    termsHash: ZERO_HASH,
    expiry,
  });
  const sign = (account: typeof owner, value: Agreement) => account.signTypedData({ domain: escrowDomain, types: agreementTypes, primaryType: "Agreement", message: value });
  const body = async (value: Agreement, account = owner) => ({ payee: value.payee, price: value.price.toString(), expiry: value.expiry, signature: await sign(account, value) });
  return { ctx, payer, worker, agreement, sign, body, price, now };
}

const post = (s: Awaited<ReturnType<typeof scenario>>, token: string, body: unknown) => s.ctx.call("/me/orders/1/agreement", authed(token, "POST", body));

describe("proposing an agreement", () => {
  it("stores the signed proposal and notifies the applicant", async () => {
    const s = await scenario();
    const response = await post(s, s.payer.body.token, await s.body(s.agreement()));
    expect(response.status).toBe(201);
    expect(((await response.json()) as any).agreement).toMatchObject({ orderId: 1, status: "pending", price: "10000000" });
    expect(s.ctx.raw.prepare("SELECT kind, address FROM notifications WHERE kind = 'agreement_proposed'").get()).toMatchObject({ address: stranger.address.toLowerCase() });
  });

  it("uses the counter offer of the application as the price", async () => {
    const s = await scenario("7000000");
    expect((await post(s, s.payer.body.token, await s.body(s.agreement(undefined, stranger.address, "10000000")))).status).toBe(400);
    expect((await post(s, s.payer.body.token, await s.body(s.agreement(undefined, stranger.address, "7000000")))).status).toBe(201);
  });

  it("rejects a price above the deposit, even if it matches the application", async () => {
    const s = await scenario("12000000");
    expect((await post(s, s.payer.body.token, await s.body(s.agreement()))).status).toBe(400);
  });

  it("rejects strangers, wrong signers, unknown payees and bad expiry", async () => {
    const s = await scenario();
    const good = await s.body(s.agreement());
    const third = await tokenFor(s.ctx.call, other);
    expect((await post(s, third.body.token, good)).status).toBe(403);
    expect((await post(s, s.payer.body.token, await s.body(s.agreement(), other))).status).toBe(400);
    expect((await post(s, s.payer.body.token, await s.body(s.agreement(undefined, other.address)))).status).toBe(400);
    expect((await post(s, s.payer.body.token, await s.body(s.agreement(s.now + 60)))).status).toBe(400);
    expect((await post(s, s.payer.body.token, await s.body(s.agreement(s.now + 3 * 86400)))).status).toBe(400);
    expect((await post(s, s.payer.body.token, { ...good, price: "abc" })).status).toBe(400);
    expect((await s.ctx.call("/me/orders/9/agreement", authed(s.payer.body.token, "POST", good))).status).toBe(404);
  });

  it("a new proposal replaces the pending one", async () => {
    const s = await scenario();
    await post(s, s.payer.body.token, await s.body(s.agreement(s.now + 7200)));
    await post(s, s.payer.body.token, await s.body(s.agreement(s.now + 10000)));
    expect((s.ctx.raw.prepare("SELECT COUNT(*) AS n FROM agreements").get() as { n: number }).n).toBe(1);
    expect((s.ctx.raw.prepare("SELECT expiry FROM agreements").get() as { expiry: number }).expiry).toBe(s.now + 10000);
  });
});

describe("listing and cancelling", () => {
  it("both parties see the proposal and either can cancel it", async () => {
    const s = await scenario();
    await post(s, s.payer.body.token, await s.body(s.agreement()));
    for (const token of [s.payer.body.token, s.worker.body.token]) {
      const list = (await (await s.ctx.call("/me/agreements", authed(token, "GET"))).json()) as any;
      expect(list.agreements).toHaveLength(1);
    }
    const third = await tokenFor(s.ctx.call, other);
    expect((await s.ctx.call("/me/orders/1/agreement", authed(third.body.token, "DELETE"))).status).toBe(404);
    expect((await s.ctx.call("/me/orders/1/agreement", authed(s.worker.body.token, "DELETE"))).status).toBe(200);
    expect(((await (await s.ctx.call("/me/agreements", authed(s.payer.body.token, "GET"))).json()) as any).agreements).toHaveLength(0);
  });

  it("expired proposals are hidden and purged", async () => {
    const s = await scenario();
    await post(s, s.payer.body.token, await s.body(s.agreement()));
    s.ctx.raw.prepare("UPDATE agreements SET expiry = ?").run(s.now - 10);
    expect(((await (await s.ctx.call("/me/agreements", authed(s.payer.body.token, "GET"))).json()) as any).agreements).toHaveLength(0);
    await purgeAgreements(s.ctx.db, s.now);
    expect((s.ctx.raw.prepare("SELECT COUNT(*) AS n FROM agreements").get() as { n: number }).n).toBe(0);
  });
});

describe("accepting", () => {
  const chain = (result: Awaited<ReturnType<AgreementChain["agree"]>>) => {
    const calls: { payer: string; payee: string }[] = [];
    const fake: AgreementChain = {
      async agree(_agreement, payerSignature, payeeSignature) {
        calls.push({ payer: payerSignature, payee: payeeSignature });
        return result;
      },
    };
    return { fake, calls };
  };

  it("verifies the second signature and sends both to the contract", async () => {
    const s = await scenario();
    const proposal = await s.body(s.agreement());
    await post(s, s.payer.body.token, proposal);
    const { fake, calls } = chain({ ok: true, txHash: "0x" + "ab".repeat(32) as `0x${string}` });
    const payeeSignature = await s.sign(stranger, s.agreement());
    const result = await accept(s.ctx.db, fake, 1, stranger.address.toLowerCase(), payeeSignature, s.now);
    expect(result).toMatchObject({ ok: true });
    expect(calls).toEqual([{ payer: proposal.signature, payee: payeeSignature }]);
    expect(s.ctx.raw.prepare("SELECT status FROM agreements").get()).toMatchObject({ status: "submitted" });
    expect((await accept(s.ctx.db, fake, 1, stranger.address.toLowerCase(), payeeSignature, s.now)).ok).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("rejects wrong signer, other accounts and expired proposals without touching the chain", async () => {
    const s = await scenario();
    await post(s, s.payer.body.token, await s.body(s.agreement()));
    const { fake, calls } = chain({ ok: true, txHash: "0x" + "ab".repeat(32) as `0x${string}` });
    expect(await accept(s.ctx.db, fake, 1, stranger.address.toLowerCase(), await s.sign(other, s.agreement()), s.now)).toMatchObject({ ok: false, status: 400 });
    expect(await accept(s.ctx.db, fake, 1, other.address.toLowerCase(), await s.sign(other, s.agreement()), s.now)).toMatchObject({ ok: false, status: 404 });
    expect(await accept(s.ctx.db, fake, 1, stranger.address.toLowerCase(), await s.sign(stranger, s.agreement()), s.now + 100000)).toMatchObject({ ok: false, status: 409 });
    expect(calls).toHaveLength(0);
  });

  it("goes back to pending when the contract would revert or the relayer is down", async () => {
    const s = await scenario();
    await post(s, s.payer.body.token, await s.body(s.agreement()));
    const signature = await s.sign(stranger, s.agreement());
    expect(await accept(s.ctx.db, chain({ ok: false, reason: "revert" }).fake, 1, stranger.address.toLowerCase(), signature, s.now)).toMatchObject({ ok: false, status: 422 });
    expect(s.ctx.raw.prepare("SELECT status FROM agreements").get()).toMatchObject({ status: "pending" });
    expect(await accept(s.ctx.db, chain({ ok: false, reason: "unavailable" }).fake, 1, stranger.address.toLowerCase(), signature, s.now)).toMatchObject({ ok: false, status: 503 });
    expect(await accept(s.ctx.db, chain({ ok: true, txHash: "0x" + "cd".repeat(32) as `0x${string}` }).fake, 1, stranger.address.toLowerCase(), signature, s.now)).toMatchObject({ ok: true });
  });
});
