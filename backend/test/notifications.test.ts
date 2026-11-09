import { beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { readCache } from "../src/app";
import { applicationsHandler } from "../src/applications";
import { createChangasHandler } from "../src/changas";
import { processEvents } from "../src/eventStream";
import { deliverDue, MAX_ATTEMPTS, MAX_TOKENS_PER_ADDRESS, notificationsHandler, queueNotification, TEMPLATES } from "../src/notifications";
import type { Fetcher } from "../src/push";
import { admin, authed, createdEvent, futureSpec, owner, plainEvent, setup, stranger, TOKEN, tokenFor } from "./helpers";

beforeEach(() => readCache.clear());

const handlers = [createChangasHandler(new Map([[TOKEN.toLowerCase(), 6]])), applicationsHandler, notificationsHandler];
const expoToken = (n: number) => `ExponentPushToken[abcdefghij${String(n).padStart(4, "0")}]`;
const juror = privateKeyToAccount(generatePrivateKey());
const rows = (ctx: ReturnType<typeof setup>) =>
  ctx.raw.prepare("SELECT address, kind, ref, due_at, sent_at FROM notifications ORDER BY id").all() as any[];

async function agreedOrder(ctx: ReturnType<typeof setup>, extra: Record<string, unknown> = {}) {
  const publisher = await tokenFor(ctx.call, owner);
  const draft = await ctx.call("/me/changas", authed(publisher.body.token, "POST", futureSpec("nonce-0001", extra)));
  const { specHash } = (await draft.json()) as { specHash: string };
  createdEvent(ctx.raw, 1, specHash, owner.address);
  await processEvents(ctx.db, handlers, 100);
  const changaId = (ctx.raw.prepare("SELECT id FROM changas WHERE order_id = 1").get() as { id: number }).id;
  const worker = await tokenFor(ctx.call, stranger);
  await ctx.call(`/me/applications/${changaId}`, authed(worker.body.token, "PUT", { message: "hola" }));
  return { publisher: publisher.body.token, worker: worker.body.token, changaId };
}

describe("push tokens", () => {
  it("registers, moves between accounts and removes a device token", async () => {
    const ctx = setup();
    const a = await tokenFor(ctx.call, owner);
    const b = await tokenFor(ctx.call, stranger);
    const token = expoToken(1);
    expect((await ctx.call("/me/push-token", authed(a.body.token, "PUT", { token, platform: "android" }))).status).toBe(200);
    await ctx.call("/me/push-token", authed(b.body.token, "PUT", { token, platform: "ios" }));
    expect(ctx.raw.prepare("SELECT address, platform FROM push_tokens").all()).toEqual([{ address: stranger.address.toLowerCase(), platform: "ios" }]);
    expect((await ctx.call("/me/push-token", authed(a.body.token, "DELETE", { token }))).status).toBe(404);
    expect((await ctx.call("/me/push-token", authed(b.body.token, "DELETE", { token }))).status).toBe(200);
  });

  it("rejects malformed tokens and keeps only the latest devices", async () => {
    const ctx = setup();
    const { body } = await tokenFor(ctx.call, owner);
    for (const token of ["nope", "ExponentPushToken[]", 5, undefined]) {
      expect((await ctx.call("/me/push-token", authed(body.token, "PUT", { token }))).status).toBe(400);
    }
    for (let i = 0; i < MAX_TOKENS_PER_ADDRESS + 2; i++) {
      ctx.raw.prepare("UPDATE push_tokens SET updated_at = updated_at").run();
      await ctx.call("/me/push-token", authed(body.token, "PUT", { token: expoToken(i) }));
      ctx.raw.prepare("UPDATE push_tokens SET updated_at = ? WHERE token = ?").run(1000 + i, expoToken(i));
    }
    expect((ctx.raw.prepare("SELECT COUNT(*) AS n FROM push_tokens").get() as { n: number }).n).toBeLessThanOrEqual(MAX_TOKENS_PER_ADDRESS + 1);
  });
});

describe("what triggers a notification", () => {
  it("notifies the owner of a new application only once per changa", async () => {
    const ctx = setup();
    const { worker, changaId } = await agreedOrder(ctx);
    expect(rows(ctx).filter((r) => r.kind === "application_new")).toEqual([
      { address: owner.address.toLowerCase(), kind: "application_new", ref: String(changaId), due_at: 0, sent_at: null },
    ]);
    await ctx.call(`/me/applications/${changaId}`, authed(worker, "PUT", { message: "otra vez" }));
    expect(rows(ctx).filter((r) => r.kind === "application_new")).toHaveLength(1);
  });

  it("tells the chosen provider that the order is agreed and schedules a reminder before the start", async () => {
    const ctx = setup();
    const startsAt = Math.floor(Date.now() / 1000) + 5 * 3600;
    await agreedOrder(ctx, { startsAt });
    plainEvent(ctx.raw, "OrderAgreed", 1, 500, { payee: stranger.address });
    await processEvents(ctx.db, handlers, 100);
    const found = rows(ctx);
    expect(found.find((r) => r.kind === "agreed")).toMatchObject({ address: stranger.address.toLowerCase(), ref: "1" });
    const reminders = found.filter((r) => r.kind === "reminder_start");
    expect(reminders.map((r) => r.address).sort()).toEqual([owner.address.toLowerCase(), stranger.address.toLowerCase()].sort());
    expect(reminders[0].due_at).toBe(startsAt - 3600);
  });

  it("skips the reminder when the start is less than an hour away or not set", async () => {
    const ctx = setup();
    await agreedOrder(ctx);
    plainEvent(ctx.raw, "OrderAgreed", 1, 500, { payee: stranger.address });
    await processEvents(ctx.db, handlers, 100);
    expect(rows(ctx).filter((r) => r.kind === "reminder_start")).toEqual([]);
  });

  it("notifies delivery to the owner, cancellation to both and payment to the provider", async () => {
    const ctx = setup();
    await agreedOrder(ctx);
    plainEvent(ctx.raw, "OrderAgreed", 1, 500, { payee: stranger.address });
    plainEvent(ctx.raw, "OrderDelivered", 1, 501);
    plainEvent(ctx.raw, "OrderSettled", 1, 502, { payee: stranger.address });
    await processEvents(ctx.db, handlers, 100);
    const found = rows(ctx);
    expect(found.find((r) => r.kind === "delivered")?.address).toBe(owner.address.toLowerCase());
    expect(found.find((r) => r.kind === "settled")?.address).toBe(stranger.address.toLowerCase());

    const other = setup();
    await agreedOrder(other);
    plainEvent(other.raw, "OrderAgreed", 1, 500, { payee: stranger.address });
    plainEvent(other.raw, "OrderCancelled", 1, 501);
    await processEvents(other.db, handlers, 100);
    expect(rows(other).filter((r) => r.kind === "cancelled").map((r) => r.address).sort()).toEqual(
      [owner.address.toLowerCase(), stranger.address.toLowerCase()].sort(),
    );
  });

  it("notifies drawn jurors with reminders that vanish once they act or the case is decided", async () => {
    const ctx = setup();
    const now = Math.floor(Date.now() / 1000);
    const drawn = { jurors: [juror.address, owner.address], commitEnd: now + 86400, revealEnd: now + 2 * 86400 };
    ctx.raw.prepare(
      `INSERT INTO events (block_number, log_index, block_timestamp, tx_hash, contract, address, name, case_id, args)
       VALUES (10, 0, 1, '0x1', 'arbitration', '0x', 'JuryDrawn', 7, ?)`,
    ).run(JSON.stringify(drawn));
    await processEvents(ctx.db, handlers, 100);
    const found = rows(ctx);
    expect(found.filter((r) => r.kind === "jury_drawn")).toHaveLength(2);
    expect(found.filter((r) => r.kind === "jury_deadline")).toHaveLength(4);
    expect(found.find((r) => r.ref === "7:commit")?.due_at).toBe(now + 86400 - 7200);

    ctx.raw.prepare(
      `INSERT INTO events (block_number, log_index, block_timestamp, tx_hash, contract, address, name, case_id, args)
       VALUES (11, 0, 1, '0x2', 'arbitration', '0x', 'VoteCommitted', 7, ?)`,
    ).run(JSON.stringify({ juror: juror.address }));
    await processEvents(ctx.db, handlers, 100);
    expect(rows(ctx).filter((r) => r.kind === "jury_deadline" && r.address === juror.address.toLowerCase())).toHaveLength(1);

    ctx.raw.prepare(
      `INSERT INTO events (block_number, log_index, block_timestamp, tx_hash, contract, address, name, case_id, args)
       VALUES (12, 0, 1, '0x3', 'arbitration', '0x', 'VerdictReached', 7, '{}')`,
    ).run();
    await processEvents(ctx.db, handlers, 100);
    expect(rows(ctx).filter((r) => r.kind === "jury_deadline")).toEqual([]);
  });

  it("notifies the other participant of a chat message when they have no live connection", async () => {
    const ctx = setup();
    const { worker, changaId } = await agreedOrder(ctx);
    const applicationId = (ctx.raw.prepare("SELECT id FROM applications WHERE changa_id = ?").get(changaId) as { id: number }).id;
    await ctx.call(`/me/chats/${applicationId}/messages`, authed(worker, "POST", { nonce: "A".repeat(32), body: "aG9sYQ==", clientId: "client-0001" }));
    await ctx.call(`/me/chats/${applicationId}/messages`, authed(worker, "POST", { nonce: "A".repeat(32), body: "aG9sYQ==", clientId: "client-0002" }));
    const chats = rows(ctx).filter((r) => r.kind === "chat");
    expect(chats).toEqual([{ address: owner.address.toLowerCase(), kind: "chat", ref: String(applicationId), due_at: 0, sent_at: null }]);
  });

  it("notifies the result of a selfie review", async () => {
    const ctx = setup();
    const user = await tokenFor(ctx.call, owner);
    await ctx.call("/me/profile", authed(user.body.token, "PUT", { name: "Lucía", work: { lat: -34.6, lng: -58.38, radiusM: 3000 } }));
    const selfie = new Uint8Array([255, 216, 255, 1, 2, 3]);
    const { sha256 } = await import("./helpers");
    await ctx.call("/me/selfie", {
      method: "PUT",
      body: selfie,
      headers: { authorization: `Bearer ${user.body.token}`, "content-type": "image/jpeg", "content-length": String(selfie.length), "x-content-sha256": sha256(selfie) },
    });
    const boss = await tokenFor(ctx.call, admin);
    await ctx.call(`/admin/selfies/${owner.address}`, authed(boss.body.token, "POST", { approved: false }));
    expect(rows(ctx).find((r) => r.kind === "selfie_rejected")?.address).toBe(owner.address.toLowerCase());
  });
});

describe("deliverDue", () => {
  const okFetch = (log: any[] = []): Fetcher => async (_url, init) => {
    const messages = JSON.parse(String(init.body));
    log.push(...messages);
    return Response.json({ data: messages.map(() => ({ status: "ok" })) });
  };

  function addDevice(ctx: ReturnType<typeof setup>, address: string, token = expoToken(1)) {
    ctx.raw.prepare("INSERT INTO push_tokens (token, address, platform, updated_at) VALUES (?, ?, 'android', 1)").run(token, address.toLowerCase());
  }

  it("sends generic messages with no personal data and marks them sent", async () => {
    const ctx = setup();
    addDevice(ctx, owner.address);
    await queueNotification(ctx.db, owner.address, "agreed", "12", 0, 100).run();
    const log: any[] = [];
    const result = await deliverDue(ctx.db, okFetch(log), 200);
    expect(result).toMatchObject({ sent: 1, dropped: 0, retried: 0 });
    expect(log[0]).toMatchObject({ to: expoToken(1), title: TEMPLATES.agreed.title, body: TEMPLATES.agreed.body, priority: "high", data: { kind: "agreed", ref: "12" } });
    expect(JSON.stringify(log[0])).not.toMatch(/0x[0-9a-f]{40}/i);
    expect(rows(ctx)[0].sent_at).toBe(200);
    expect((await deliverDue(ctx.db, okFetch(), 300)).sent).toBe(0);
  });

  it("waits for the due time and sends to every device of the person", async () => {
    const ctx = setup();
    addDevice(ctx, owner.address, expoToken(1));
    addDevice(ctx, owner.address, expoToken(2));
    await queueNotification(ctx.db, owner.address, "jury_deadline", "7:commit", 1000, 100).run();
    const log: any[] = [];
    expect((await deliverDue(ctx.db, okFetch(log), 999)).sent).toBe(0);
    expect(log).toHaveLength(0);
    const result = await deliverDue(ctx.db, okFetch(log), 1000);
    expect(log.map((m) => m.to).sort()).toEqual([expoToken(1), expoToken(2)]);
    expect(result.sent).toBe(1);
  });

  it("splits large deliveries into batches of at most 100 messages", async () => {
    const ctx = setup();
    for (let i = 0; i < 60; i++) {
      const address = `0x${String(i).padStart(40, "0")}`;
      addDevice(ctx, address, expoToken(i));
      addDevice(ctx, address, expoToken(1000 + i));
      await queueNotification(ctx.db, address, "agreed", "1", 0, 100).run();
    }
    const sizes: number[] = [];
    const fetcher: Fetcher = async (_u, init) => {
      const messages = JSON.parse(String(init.body));
      sizes.push(messages.length);
      return Response.json({ data: messages.map(() => ({ status: "ok" })) });
    };
    const result = await deliverDue(ctx.db, fetcher, 200);
    expect(sizes).toEqual([100, 20]);
    expect(result.sent).toBe(60);
  });

  it("counts a notification as sent if at least one device accepted it", async () => {
    const ctx = setup();
    addDevice(ctx, owner.address, expoToken(1));
    addDevice(ctx, owner.address, expoToken(2));
    await queueNotification(ctx.db, owner.address, "agreed", "1", 0, 100).run();
    const mixed: Fetcher = async (_u, init) => {
      const messages = JSON.parse(String(init.body)) as { to: string }[];
      return Response.json({
        data: messages.map((m) => (m.to === expoToken(1) ? { status: "ok" } : { status: "error", details: { error: "DeviceNotRegistered" } })),
      });
    };
    const result = await deliverDue(ctx.db, mixed, 200);
    expect(result).toMatchObject({ sent: 1, invalidTokens: 1 });
    expect((ctx.raw.prepare("SELECT token FROM push_tokens").all() as any[]).map((r) => r.token)).toEqual([expoToken(1)]);
  });

  it("drops notifications for people without devices and removes dead tokens", async () => {
    const ctx = setup();
    addDevice(ctx, stranger.address, expoToken(3));
    await queueNotification(ctx.db, owner.address, "agreed", "1", 0, 100).run();
    await queueNotification(ctx.db, stranger.address, "agreed", "2", 0, 100).run();
    const dead: Fetcher = async (_u, init) =>
      Response.json({ data: JSON.parse(String(init.body)).map(() => ({ status: "error", details: { error: "DeviceNotRegistered" } })) });
    const result = await deliverDue(ctx.db, dead, 200);
    expect(result).toMatchObject({ sent: 0, dropped: 2, invalidTokens: 1 });
    expect((ctx.raw.prepare("SELECT COUNT(*) AS n FROM push_tokens").get() as { n: number }).n).toBe(0);
    expect(rows(ctx).every((r) => r.sent_at === 200)).toBe(true);
  });

  it("retries on provider failure and gives up after the attempt limit", async () => {
    const ctx = setup();
    addDevice(ctx, owner.address);
    await queueNotification(ctx.db, owner.address, "agreed", "1", 0, 100).run();
    const down: Fetcher = async () => new Response("oops", { status: 503 });
    const thrown: Fetcher = async () => {
      throw new Error("network");
    };
    expect((await deliverDue(ctx.db, down, 200)).retried).toBe(1);
    expect(rows(ctx)[0].sent_at).toBeNull();
    for (let i = 1; i < MAX_ATTEMPTS; i++) await deliverDue(ctx.db, thrown, 200 + i);
    expect(rows(ctx)[0].sent_at).not.toBeNull();
  });

  it("allows a new pending notification once the previous one was sent", async () => {
    const ctx = setup();
    addDevice(ctx, owner.address);
    await queueNotification(ctx.db, owner.address, "chat", "5", 0, 100).run();
    await queueNotification(ctx.db, owner.address, "chat", "5", 0, 101).run();
    expect(rows(ctx)).toHaveLength(1);
    await deliverDue(ctx.db, okFetch(), 200);
    await queueNotification(ctx.db, owner.address, "chat", "5", 0, 201).run();
    expect(rows(ctx)).toHaveLength(2);
  });

  it("ignores unknown kinds without breaking the batch", async () => {
    const ctx = setup();
    addDevice(ctx, owner.address);
    await queueNotification(ctx.db, owner.address, "mystery", "1", 0, 100).run();
    await queueNotification(ctx.db, owner.address, "agreed", "2", 0, 100).run();
    const result = await deliverDue(ctx.db, okFetch(), 200);
    expect(result).toMatchObject({ sent: 1, dropped: 1 });
  });
});
