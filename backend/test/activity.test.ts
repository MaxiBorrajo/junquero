import { describe, expect, it } from "vitest";
import { authed, owner, setup, stranger, tokenFor } from "./helpers";

function changa(raw: ReturnType<typeof setup>["raw"], id: number, status: string, amountMicro: number, payer: string, payee: string) {
  raw
    .prepare("INSERT INTO changas (owner, spec_hash, spec, category, modality, created_at, order_id, status, amount, amount_micro) VALUES (?, ?, '{}', 1, 'onsite', 1, ?, ?, ?, ?)")
    .run(payer, `0x${String(id).padStart(64, "0")}`, id, status, String(amountMicro), amountMicro);
  raw.prepare("INSERT INTO order_parties (order_id, payer, payee) VALUES (?, ?, ?)").run(id, payer, payee);
}

describe("activity summary", () => {
  it("adds up what the user earned, spent, has in escrow and is waiting to collect", async () => {
    const ctx = setup();
    const me = owner.address.toLowerCase();
    const other = stranger.address.toLowerCase();
    changa(ctx.raw, 1, "settled", 20_000_000, me, other);
    changa(ctx.raw, 2, "settled", 5_000_000, me, other);
    changa(ctx.raw, 3, "agreed", 7_000_000, me, other);
    changa(ctx.raw, 4, "settled", 12_000_000, other, me);
    changa(ctx.raw, 5, "delivered", 3_000_000, other, me);
    changa(ctx.raw, 6, "open", 9_000_000, me, other);
    changa(ctx.raw, 7, "cancelled", 4_000_000, other, me);

    const token = (await tokenFor(ctx.call, owner)).body.token;
    const summary = (await (await ctx.call("/me/activity", authed(token, "GET"))).json()) as Record<string, unknown>;
    expect(summary).toEqual({ earned: "12000000", spent: "25000000", toCollect: "3000000", inEscrow: "16000000", settledAsPayee: 1, settledAsPayer: 2 });
  });

  it("returns zeros for someone with no activity", async () => {
    const ctx = setup();
    const token = (await tokenFor(ctx.call, owner)).body.token;
    const summary = await (await ctx.call("/me/activity", authed(token, "GET"))).json();
    expect(summary).toEqual({ earned: "0", spent: "0", toCollect: "0", inEscrow: "0", settledAsPayee: 0, settledAsPayer: 0 });
  });

  it("requires login", async () => {
    expect((await setup().call("/me/activity")).status).toBe(401);
  });
});

describe("notifications list", () => {
  const insert = (raw: ReturnType<typeof setup>["raw"], address: string, kind: string, ref: string, createdAt: number, dueAt = 0) =>
    raw.prepare("INSERT INTO notifications (address, kind, ref, due_at, created_at) VALUES (?, ?, ?, ?, ?)").run(address, kind, ref, dueAt, createdAt);

  it("lists only my due notifications, newest first", async () => {
    const ctx = setup();
    const me = owner.address.toLowerCase();
    insert(ctx.raw, me, "agreed", "1", 100);
    insert(ctx.raw, me, "chat", "1", 300);
    insert(ctx.raw, me, "reminder_start", "2", 200, 4_000_000_000);
    insert(ctx.raw, stranger.address.toLowerCase(), "agreed", "9", 500);

    const token = (await tokenFor(ctx.call, owner)).body.token;
    const body = (await (await ctx.call("/me/notifications", authed(token, "GET"))).json()) as { notifications: { kind: string; createdAt: number }[] };
    expect(body.notifications.map((n) => n.kind)).toEqual(["chat", "agreed"]);
  });

  it("caps the list", async () => {
    const ctx = setup();
    const me = owner.address.toLowerCase();
    for (let i = 0; i < 60; i++) insert(ctx.raw, me, "chat", String(i), i);
    const token = (await tokenFor(ctx.call, owner)).body.token;
    const body = (await (await ctx.call("/me/notifications", authed(token, "GET"))).json()) as { notifications: unknown[] };
    expect(body.notifications).toHaveLength(50);
  });
});
