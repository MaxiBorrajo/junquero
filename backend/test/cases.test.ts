import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { authed, owner, setup, stranger, tokenFor } from "./helpers";

const third = privateKeyToAccount(generatePrivateKey());

function event(raw: ReturnType<typeof setup>["raw"], name: string, caseId: number, block: number, logIndex = 0, orderId: number | null = null, args: object = {}) {
  raw.prepare(
    `INSERT INTO events (block_number, log_index, block_timestamp, tx_hash, contract, address, name, order_id, case_id, args)
     VALUES (?, ?, 1, '0x1', 'arbitration', '0x', ?, ?, ?, ?)`,
  ).run(block, logIndex, name, orderId, caseId, JSON.stringify(args));
}

function world() {
  const ctx = setup();
  ctx.raw.prepare("INSERT INTO order_parties (order_id, payer, payee) VALUES (1, ?, ?), (2, ?, ?)").run(owner.address.toLowerCase(), stranger.address.toLowerCase(), owner.address.toLowerCase(), stranger.address.toLowerCase());
  ctx.raw.prepare("INSERT INTO order_cases (case_id, order_id) VALUES (1, 1), (2, 2)").run();
  return ctx;
}

const list = async (ctx: ReturnType<typeof setup>, account = owner) => {
  const session = await tokenFor(ctx.call, account);
  return (await (await ctx.call("/me/cases", authed(session.body.token, "GET"))).json()) as { asParty: unknown[]; asJuror: unknown[]; openForJury: unknown[] };
};

describe("my cases", () => {
  it("requires a session", async () => {
    expect((await setup().call("/me/cases")).status).toBe(401);
  });

  it("lists the cases of an order where I am a party, newest first", async () => {
    const ctx = world();
    expect((await list(ctx)).asParty).toEqual([{ caseId: 2, orderId: 2 }, { caseId: 1, orderId: 1 }]);
    expect((await list(ctx, stranger)).asParty).toHaveLength(2);
    expect((await list(ctx, third)).asParty).toEqual([]);
  });

  it("lists the cases where I was drawn as a juror", async () => {
    const ctx = world();
    ctx.raw.prepare("INSERT INTO case_jurors (case_id, juror) VALUES (1, ?)").run(third.address.toLowerCase());
    expect((await list(ctx, third)).asJuror).toEqual([{ caseId: 1, orderId: 1 }]);
    expect((await list(ctx)).asJuror).toEqual([]);
  });

  it("offers cases that are looking for jurors, never to the parties", async () => {
    const ctx = world();
    event(ctx.raw, "CaseOpened", 1, 10, 0, 1);
    event(ctx.raw, "Responded", 1, 11);
    event(ctx.raw, "CaseOpened", 2, 12, 0, 2);
    expect((await list(ctx, third)).openForJury).toEqual([{ caseId: 1, orderId: 1 }]);
    expect((await list(ctx)).openForJury).toEqual([]);
  });

  it("stops offering a case once the jury is drawn, it was decided or resolved", async () => {
    const ctx = world();
    event(ctx.raw, "Responded", 1, 11);
    event(ctx.raw, "Responded", 2, 12, 1);
    expect((await list(ctx, third)).openForJury).toHaveLength(2);
    event(ctx.raw, "JuryDrawn", 1, 13);
    event(ctx.raw, "ResolvedByDefault", 2, 13, 1);
    expect((await list(ctx, third)).openForJury).toEqual([]);
  });

  it("offers an appealed case again after its first verdict", async () => {
    const ctx = world();
    event(ctx.raw, "Responded", 1, 11);
    event(ctx.raw, "JuryDrawn", 1, 12);
    event(ctx.raw, "CaseDecided", 1, 13);
    expect((await list(ctx, third)).openForJury).toEqual([]);
    event(ctx.raw, "Appealed", 1, 14);
    expect((await list(ctx, third)).openForJury).toEqual([{ caseId: 1, orderId: 1 }]);
    event(ctx.raw, "JuryDrawn", 1, 15);
    expect((await list(ctx, third)).openForJury).toEqual([]);
  });

  it("a seed round that failed to draw keeps the case open", async () => {
    const ctx = world();
    event(ctx.raw, "Responded", 1, 11);
    event(ctx.raw, "SeedRoundStarted", 1, 12);
    expect((await list(ctx, third)).openForJury).toEqual([{ caseId: 1, orderId: 1 }]);
  });
});
