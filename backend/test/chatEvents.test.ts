import { beforeEach, describe, expect, it } from "vitest";
import { readCache } from "../src/app";
import { applicationsHandler } from "../src/applications";
import { purgeAgreements } from "../src/agreements";
import { notifyChat, withChatNotify } from "../src/chatNotify";
import { chatEventsHandler, recordAgreementEvent, recordApplicationEvent, recordOrderEvent } from "../src/chatEvents";
import { createChangasHandler } from "../src/changas";
import { processEvents } from "../src/eventStream";
import { partiesHandler } from "../src/parties";
import { admin, authed, createdEvent, futureSpec, owner, plainEvent, setup, stranger, TOKEN, tokenFor } from "./helpers";

beforeEach(() => readCache.clear());

const handlers = [createChangasHandler(new Map([[TOKEN.toLowerCase(), 6]])), applicationsHandler, partiesHandler, chatEventsHandler];

async function chat() {
  const ctx = setup();
  const publisher = await tokenFor(ctx.call, owner);
  const draft = await ctx.call("/me/changas", authed(publisher.body.token, "POST", futureSpec("nonce-0001")));
  const { specHash } = (await draft.json()) as { specHash: string };
  createdEvent(ctx.raw, 1, specHash, owner.address);
  await processEvents(ctx.db, handlers, 100);
  const changaId = (ctx.raw.prepare("SELECT id FROM changas WHERE order_id = 1").get() as { id: number }).id;
  const worker = await tokenFor(ctx.call, stranger);
  await ctx.call(`/me/applications/${changaId}`, authed(worker.body.token, "PUT", { message: "hola" }));
  const applicationId = (ctx.raw.prepare("SELECT id FROM applications").get() as { id: number }).id;
  return { ctx, publisher: publisher.body.token, worker: worker.body.token, applicationId };
}

describe("historial del chat", () => {
  it("anota la propuesta y lo que pasa en la cadena, una sola vez cada cosa", async () => {
    const { ctx, publisher, applicationId } = await chat();
    await recordAgreementEvent(ctx.db, "proposed", 1, stranger.address, owner.address, 100).run();
    plainEvent(ctx.raw, "OrderAgreed", 1, 200, { orderId: "1", payee: stranger.address, price: "10000000" });
    plainEvent(ctx.raw, "OrderCheckedIn", 1, 201, { orderId: "1", payee: stranger.address, at: 5 });
    await processEvents(ctx.db, handlers, 100);
    const response = await ctx.call(`/me/chats/${applicationId}/events`, authed(publisher, "GET"));
    const body = (await response.json()) as { events: { kind: string; actor: string }[] };
    expect(body.events.map((item) => item.kind)).toEqual(["proposed", "applied", "agreed", "checkedin"]);
    expect(body.events[0].actor).toBe(owner.address.toLowerCase());
    await processEvents(ctx.db, handlers, 100);
    expect(((await (await ctx.call(`/me/chats/${applicationId}/events`, authed(publisher, "GET"))).json()) as { events: unknown[] }).events).toHaveLength(4);
  });

  it("solo lo ven las dos personas del chat", async () => {
    const { ctx, worker, applicationId } = await chat();
    expect((await ctx.call(`/me/chats/${applicationId}/events`, { method: "GET" })).status).toBe(401);
    const outsider = await tokenFor(ctx.call, admin);
    expect((await ctx.call(`/me/chats/${applicationId}/events`, authed(outsider.body.token, "GET"))).status).toBe(403);
    expect((await ctx.call(`/me/chats/${applicationId}/events`, authed(worker, "GET"))).status).toBe(200);
  });
});

type Row = { kind: string; actor: string; data: string | null };
const rowsOf = (ctx: Awaited<ReturnType<typeof chat>>["ctx"]) => ctx.raw.prepare("SELECT kind, actor, data FROM chat_events ORDER BY id").all() as Row[];

describe("más hechos del flujo", () => {
  it("postularse, bajarse y volver a postularse quedan anotados; descartar no revela el bloqueo", async () => {
    const { ctx, publisher, worker, applicationId } = await chat();
    const changaId = (ctx.raw.prepare("SELECT changa_id AS id FROM applications").get() as { id: number }).id;
    expect((await ctx.call(`/me/applications/${changaId}`, authed(worker, "DELETE"))).status).toBe(200);
    await ctx.call(`/me/applications/${changaId}`, authed(worker, "PUT", { message: "de nuevo" }));
    expect(rowsOf(ctx).map((row) => row.kind)).toEqual(["applied", "withdrawn", "applied"]);
    expect((await ctx.call(`/me/applications/${applicationId}/dismiss`, authed(publisher, "POST", { block: true }))).status).toBe(200);
    const kinds = rowsOf(ctx).map((row) => row.kind);
    expect(kinds.at(-1)).toBe("dismissed");
    expect(kinds).not.toContain("blocked");
  });

  it("anota los hechos de plata, reclamos e hitos de la cadena una sola vez, con sus datos", async () => {
    const { ctx } = await chat();
    plainEvent(ctx.raw, "OrderAgreed", 1, 300, { orderId: "1", payee: stranger.address });
    await processEvents(ctx.db, handlers, 100);
    plainEvent(ctx.raw, "OrderToppedUp", 1, 301, { added: "5000000" });
    plainEvent(ctx.raw, "OrderToppedUp", 1, 302, { added: "2000000" });
    plainEvent(ctx.raw, "MilestoneDelivered", 1, 303, { index: "0" });
    plainEvent(ctx.raw, "MilestonePaid", 1, 304, { index: "0", paid: "3000000", rating: "5" });
    plainEvent(ctx.raw, "DisputeOpened", 1, 305, { claimant: owner.address });
    plainEvent(ctx.raw, "DisputeResolved", 1, 306, { payeeShareBps: "5000" });
    plainEvent(ctx.raw, "OrderCancelled", 1, 307, { by: owner.address, refunded: "1000000" });
    await processEvents(ctx.db, handlers, 100);
    await processEvents(ctx.db, handlers, 100);
    const rows = rowsOf(ctx);
    expect(rows.map((row) => row.kind)).toEqual(["applied", "agreed", "topped_up", "topped_up", "milestone_delivered", "milestone_paid", "dispute_opened", "dispute_resolved", "order_cancelled"]);
    expect(JSON.parse(rows[2].data as string)).toEqual({ added: "5000000" });
    expect(JSON.parse(rows[5].data as string)).toMatchObject({ index: 0, rating: "5" });
    expect(rows[6].actor).toBe(owner.address.toLowerCase());
    expect(rows[7].actor).toBe("");
  });

  it("anota las pruebas y la aprobación, y la propuesta vencida", async () => {
    const { ctx, applicationId } = await chat();
    plainEvent(ctx.raw, "OrderAgreed", 1, 300, { orderId: "1", payee: stranger.address });
    await processEvents(ctx.db, handlers, 100);
    await recordOrderEvent(ctx.db, "evidence", 1, stranger.address, "0xabc", 400, { count: 2 }).run();
    await recordOrderEvent(ctx.db, "approved", 1, owner.address, "401", 401).run();
    ctx.raw.prepare("INSERT INTO agreements (order_id, payer, payee, price, spec_hash, terms_hash, expiry, payer_signature, status, created_at, updated_at) VALUES (1, ?, ?, '1', '0x', '0x', 500, '0x', 'pending', 1, 1)").run(owner.address.toLowerCase(), stranger.address.toLowerCase());
    await purgeAgreements(ctx.db, 600);
    await recordApplicationEvent(ctx.db, "withdrawn", applicationId, stranger.address, 700).run();
    const rows = rowsOf(ctx);
    expect(rows.map((row) => row.kind)).toEqual(["applied", "agreed", "evidence", "approved", "expired", "withdrawn"]);
    expect(JSON.parse(rows[2].data as string)).toEqual({ count: 2 });
  });
});

function fakeChat() {
  const hit: string[] = [];
  const CHAT = {
    idFromName: (name: string) => name,
    get: (id: string) => ({ fetch: async (url: string, init: { method: string }) => { hit.push(`${id}:${url}:${init.method}`); return new Response(null, { status: 204 }); } }),
  } as unknown as DurableObjectNamespace;
  return { hit, CHAT };
}

describe("aviso en vivo a los chats abiertos", () => {
  it("avisa una sola vez a cada chat, ignora ids raros y tolera que no haya binding", async () => {
    const { hit, CHAT } = fakeChat();
    await notifyChat({ CHAT }, [5, 5, 7, Number.NaN]);
    expect(hit).toEqual(["5:https://chat/notify:POST", "7:https://chat/notify:POST"]);
    await expect(notifyChat({} as never, [1])).resolves.toBeUndefined();
  });

  it("avisa solo a los chats que tuvieron hechos nuevos durante el trabajo", async () => {
    const { ctx, applicationId } = await chat();
    const { hit, CHAT } = fakeChat();
    plainEvent(ctx.raw, "OrderAgreed", 1, 900, { orderId: "1", payee: stranger.address });
    await withChatNotify({ CHAT, DB: ctx.db }, () => processEvents(ctx.db, handlers, 100));
    expect(hit).toEqual([`${applicationId}:https://chat/notify:POST`]);
    hit.length = 0;
    await withChatNotify({ CHAT, DB: ctx.db }, () => processEvents(ctx.db, handlers, 100));
    expect(hit).toEqual([]);
  });

  it("un hecho repetido no vuelve a avisar", async () => {
    const { ctx } = await chat();
    const first = await recordOrderEvent(ctx.db, "approved", 1, owner.address, "x", 10).all();
    expect(first.results).toEqual([]);
    plainEvent(ctx.raw, "OrderAgreed", 1, 901, { orderId: "1", payee: stranger.address });
    await processEvents(ctx.db, handlers, 100);
    const again = await recordOrderEvent(ctx.db, "approved", 1, owner.address, "x", 10).all<{ application_id: number }>();
    const repeat = await recordOrderEvent(ctx.db, "approved", 1, owner.address, "x", 10).all<{ application_id: number }>();
    expect(again.results).toHaveLength(1);
    expect(repeat.results).toHaveLength(0);
  });
});

describe("resumen de globitos", () => {
  it("cuenta chats sin leer, notificaciones nuevas y acuerdos por confirmar con una sola llamada", async () => {
    const { ctx, publisher, worker, applicationId } = await chat();
    ctx.raw.prepare("INSERT INTO chat_meta (application_id, last_seq, last_sender, last_at, owner_replied) VALUES (?, 3, ?, 10, 1)").run(applicationId, owner.address.toLowerCase());
    ctx.raw.prepare("INSERT INTO notifications (address, kind, ref, due_at, created_at, sent_at) VALUES (?, 'chat', '1', 0, 5, 5), (?, 'agreed', '2', 0, 6, 6)").run(stranger.address.toLowerCase(), stranger.address.toLowerCase());
    ctx.raw.prepare("INSERT INTO agreements (order_id, payer, payee, price, spec_hash, terms_hash, expiry, payer_signature, status, created_at, updated_at) VALUES (1, ?, ?, '1', '0x', '0x', 9999999999, '0x', 'pending', 1, 1)").run(owner.address.toLowerCase(), stranger.address.toLowerCase());
    const asWorker = (await (await ctx.call("/me/summary", authed(worker, "GET"))).json()) as { unreadChats: number; unreadNotifications: number; pendingAgreements: number };
    expect(asWorker).toEqual({ unreadChats: 1, unreadNotifications: 2, pendingAgreements: 1 });
    const asOwner = (await (await ctx.call("/me/summary", authed(publisher, "GET"))).json()) as { unreadChats: number; pendingAgreements: number };
    expect(asOwner.unreadChats).toBe(0);
    expect(asOwner.pendingAgreements).toBe(0);
    const seen = (await (await ctx.call("/me/summary?seenNotification=100", authed(worker, "GET"))).json()) as { unreadNotifications: number };
    expect(seen.unreadNotifications).toBe(0);
  });
});
