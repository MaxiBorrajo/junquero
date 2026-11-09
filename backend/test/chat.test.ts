import { beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { readCache } from "../src/app";
import { buildChatKeyMessage } from "../src/auth";
import { applicationsHandler } from "../src/applications";
import { createChangasHandler } from "../src/changas";
import { ChatStore, MAX_BODY_CHARS, MAX_PER_MINUTE } from "../src/chatStore";
import { processEvents } from "../src/eventStream";
import { authed, createdEvent, futureSpec, owner, plainEvent, setup, stranger, TOKEN, tokenFor } from "./helpers";

beforeEach(() => readCache.clear());

const handlers = [createChangasHandler(new Map([[TOKEN.toLowerCase(), 6]])), applicationsHandler];
const nonce = "A".repeat(32);
const body = (id: string, text = "aGVsbG8=") => ({ nonce, body: text, clientId: id });

async function conversation(ctx: ReturnType<typeof setup>) {
  const publisher = await tokenFor(ctx.call, owner);
  const draft = await ctx.call("/me/changas", authed(publisher.body.token, "POST", futureSpec("nonce-0001")));
  const { specHash } = (await draft.json()) as { specHash: string };
  createdEvent(ctx.raw, 1, specHash, owner.address);
  await processEvents(ctx.db, handlers, 100);
  const changaId = (ctx.raw.prepare("SELECT id FROM changas WHERE order_id = 1").get() as { id: number }).id;
  const worker = await tokenFor(ctx.call, stranger);
  const applied = await ctx.call(`/me/applications/${changaId}`, authed(worker.body.token, "PUT", { message: "hola" }));
  const applicationId = ((await applied.json()) as any).application.id as number;
  return { publisher: publisher.body.token, worker: worker.body.token, applicationId };
}

const send = (ctx: ReturnType<typeof setup>, token: string, id: number, payload: unknown) =>
  ctx.call(`/me/chats/${id}/messages`, authed(token, "POST", payload));
const history = async (ctx: ReturnType<typeof setup>, token: string, id: number, query = "") =>
  (await (await ctx.call(`/me/chats/${id}/messages${query}`, authed(token, "GET"))).json()) as any;

describe("chat keys", () => {
  const publicKey = "ab".repeat(32);

  it("stores a key proven by the wallet signature and serves it to other users", async () => {
    const ctx = setup();
    const { body: session } = await tokenFor(ctx.call, owner);
    const signature = await owner.signMessage({ message: buildChatKeyMessage(owner.address, publicKey) });
    const saved = await ctx.call("/me/chat-key", authed(session.token, "PUT", { publicKey, signature }));
    expect(saved.status).toBe(200);

    const other = await tokenFor(ctx.call, stranger);
    const fetched = await ctx.call(`/me/chat-keys/${owner.address}`, authed(other.body.token, "GET"));
    expect(await fetched.json()).toEqual({ address: owner.address.toLowerCase(), publicKey });
    expect((await ctx.call(`/me/chat-keys/${stranger.address}`, authed(other.body.token, "GET"))).status).toBe(404);
    expect((await ctx.call("/me/chat-keys/nope", authed(other.body.token, "GET"))).status).toBe(400);
  });

  it("rejects a key signed by another wallet, a wrong key and malformed input", async () => {
    const ctx = setup();
    const { body: session } = await tokenFor(ctx.call, owner);
    const forged = await stranger.signMessage({ message: buildChatKeyMessage(owner.address, publicKey) });
    expect((await ctx.call("/me/chat-key", authed(session.token, "PUT", { publicKey, signature: forged }))).status).toBe(400);
    const other = await owner.signMessage({ message: buildChatKeyMessage(owner.address, "cd".repeat(32)) });
    expect((await ctx.call("/me/chat-key", authed(session.token, "PUT", { publicKey, signature: other }))).status).toBe(400);
    expect((await ctx.call("/me/chat-key", authed(session.token, "PUT", { publicKey: "short", signature: "0x12" }))).status).toBe(400);
    expect((await ctx.call("/me/chat-key", authed(session.token, "PUT", { publicKey, signature: "0xzz" }))).status).toBe(400);
  });
});

describe("messages", () => {
  it("lets both participants exchange messages and read them in order", async () => {
    const ctx = setup();
    const { publisher, worker, applicationId } = await conversation(ctx);
    expect((await send(ctx, worker, applicationId, body("client-0001", "aG9sYQ=="))).status).toBe(201);
    expect((await send(ctx, publisher, applicationId, body("client-0002", "cXVl"))).status).toBe(201);

    const all = await history(ctx, publisher, applicationId);
    expect(all.messages.map((m: any) => [m.seq, m.sender])).toEqual([
      [1, stranger.address.toLowerCase()],
      [2, owner.address.toLowerCase()],
    ]);
    expect(all.writable).toBe(true);
    expect((await history(ctx, worker, applicationId, "?after=1")).messages).toHaveLength(1);
    expect(ctx.chat.broadcasts).toHaveLength(2);
  });

  it("makes retries idempotent by client id", async () => {
    const ctx = setup();
    const { worker, applicationId } = await conversation(ctx);
    expect((await send(ctx, worker, applicationId, body("client-0001"))).status).toBe(201);
    const again = await send(ctx, worker, applicationId, body("client-0001"));
    expect(again.status).toBe(200);
    expect(((await again.json()) as any).duplicate).toBe(true);
    expect((await history(ctx, worker, applicationId)).messages).toHaveLength(1);
    expect(ctx.chat.broadcasts).toHaveLength(1);
  });

  it("keeps outsiders out", async () => {
    const ctx = setup();
    const { applicationId } = await conversation(ctx);
    const outsider = await tokenFor(ctx.call, privateKeyToAccount(generatePrivateKey()));
    expect((await send(ctx, outsider.body.token, applicationId, body("client-0001"))).status).toBe(403);
    expect((await ctx.call(`/me/chats/${applicationId}/messages`, authed(outsider.body.token, "GET"))).status).toBe(403);
    expect((await ctx.call("/me/chats/999/messages", authed(outsider.body.token, "GET"))).status).toBe(404);
    expect((await ctx.call("/me/chats/0/messages", authed(outsider.body.token, "GET"))).status).toBe(400);
    expect((await ctx.call(`/me/chats/${applicationId}/messages`)).status).toBe(401);
  });

  it("validates message content", async () => {
    const ctx = setup();
    const { worker, applicationId } = await conversation(ctx);
    for (const payload of [
      { ...body("client-0001"), nonce: "short" },
      { ...body("client-0001"), body: "" },
      { ...body("client-0001"), body: "not base64 !!" },
      { ...body("client-0001"), body: "A".repeat(MAX_BODY_CHARS + 1) },
      { ...body("x") },
      {},
    ]) {
      expect((await send(ctx, worker, applicationId, payload)).status).toBe(400);
    }
    expect((await ctx.call(`/me/chats/${applicationId}/messages`, { method: "POST", body: "nope", headers: { authorization: `Bearer ${worker}` } })).status).toBe(400);
  });

  it("limits how fast one person can send", async () => {
    const ctx = setup();
    const { worker, applicationId } = await conversation(ctx);
    for (let i = 0; i < MAX_PER_MINUTE; i++) expect((await send(ctx, worker, applicationId, body(`client-${1000 + i}`))).status).toBe(201);
    expect((await send(ctx, worker, applicationId, body("client-9999"))).status).toBe(429);
  });

  it("turns read-only for the applicants who were not chosen and after the changa ends", async () => {
    const ctx = setup();
    const { publisher, worker, applicationId } = await conversation(ctx);
    plainEvent(ctx.raw, "OrderAgreed", 1, 500, { payee: owner.address });
    await processEvents(ctx.db, handlers, 100);
    expect((await send(ctx, worker, applicationId, body("client-0001"))).status).toBe(403);
    expect((await send(ctx, publisher, applicationId, body("client-0002"))).status).toBe(403);
    const readable = await history(ctx, worker, applicationId);
    expect(readable.writable).toBe(false);

    const open = setup();
    const next = await conversation(open);
    plainEvent(open.raw, "OrderAgreed", 1, 500, { payee: stranger.address });
    await processEvents(open.db, handlers, 100);
    expect((await send(open, next.worker, next.applicationId, body("client-0003"))).status).toBe(201);
    plainEvent(open.raw, "OrderSettled", 1, 600);
    await processEvents(open.db, handlers, 100);
    expect((await send(open, next.worker, next.applicationId, body("client-0004"))).status).toBe(403);
  });
});

describe("chat list and read state", () => {
  it("lists chats with unread flags that clear when read", async () => {
    const ctx = setup();
    const { publisher, worker, applicationId } = await conversation(ctx);
    await send(ctx, worker, applicationId, body("client-0001"));

    const forPublisher = ((await (await ctx.call("/me/chats", authed(publisher, "GET"))).json()) as any).chats;
    expect(forPublisher).toHaveLength(1);
    expect(forPublisher[0]).toMatchObject({
      applicationId,
      title: "Cambiar una canilla",
      counterpart: stranger.address.toLowerCase(),
      writable: true,
      lastSeq: 1,
      unread: true,
    });
    const forWorker = ((await (await ctx.call("/me/chats", authed(worker, "GET"))).json()) as any).chats;
    expect(forWorker[0].unread).toBe(false);

    expect((await ctx.call(`/me/chats/${applicationId}/read`, authed(publisher, "POST", { seq: 1 }))).status).toBe(200);
    const after = ((await (await ctx.call("/me/chats", authed(publisher, "GET"))).json()) as any).chats;
    expect(after[0].unread).toBe(false);
    expect((await ctx.call(`/me/chats/${applicationId}/read`, authed(publisher, "POST", { seq: -1 }))).status).toBe(400);
  });

  it("does not list chats of unrelated people", async () => {
    const ctx = setup();
    await conversation(ctx);
    const outsider = await tokenFor(ctx.call, privateKeyToAccount(generatePrivateKey()));
    expect(((await (await ctx.call("/me/chats", authed(outsider.body.token, "GET"))).json()) as any).chats).toEqual([]);
  });
});

describe("websocket tickets", () => {
  it("issues a short ticket to participants only", async () => {
    const ctx = setup();
    const { worker, applicationId } = await conversation(ctx);
    const issued = await ctx.call(`/me/chats/${applicationId}/ticket`, authed(worker, "POST"));
    expect(issued.status).toBe(200);
    const { ticket, expiresAt } = (await issued.json()) as { ticket: string; expiresAt: number };
    expect(expiresAt - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(60);
    expect(ticket.split(".")).toHaveLength(2);
    const outsider = await tokenFor(ctx.call, privateKeyToAccount(generatePrivateKey()));
    expect((await ctx.call(`/me/chats/${applicationId}/ticket`, authed(outsider.body.token, "POST"))).status).toBe(403);
  });

  it("rejects connections without an upgrade, a valid ticket or access", async () => {
    const ctx = setup();
    const { applicationId } = await conversation(ctx);
    expect((await ctx.call(`/chat/${applicationId}/ws`)).status).toBe(426);
    const upgrade = { headers: { upgrade: "websocket" } };
    expect((await ctx.call(`/chat/${applicationId}/ws?ticket=bad`, upgrade)).status).toBe(401);
    const outsider = privateKeyToAccount(generatePrivateKey());
    const session = await tokenFor(ctx.call, outsider);
    const issued = await ctx.call("/me/chats/1/ticket", authed(session.body.token, "POST"));
    expect(issued.status).toBe(403);
  });
});

describe("ChatStore", () => {
  it("persists across instances over the same storage and orders history", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(":memory:");
    const sql = {
      exec(query: string, ...bindings: (string | number | null)[]) {
        const statement = db.prepare(query);
        if (/^\s*SELECT/i.test(query)) return { toArray: () => statement.all(...bindings) };
        statement.run(...bindings);
        return { toArray: () => [] };
      },
    };
    const first = new ChatStore(sql);
    first.append("0xa", { nonce, body: "YQ==", clientId: "client-0001" }, 100);
    const second = new ChatStore(sql);
    second.append("0xb", { nonce, body: "Yg==", clientId: "client-0002" }, 101);
    expect(second.history(0, 10).map((m) => m.body)).toEqual(["YQ==", "Yg=="]);
    expect(second.history(1, 10)).toHaveLength(1);
    expect(second.history(0, 0)).toHaveLength(1);
  });
});
