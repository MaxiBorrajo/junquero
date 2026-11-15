import { beforeEach, describe, expect, it } from "vitest";
import { readCache } from "../src/app";
import { applicationsHandler } from "../src/applications";
import { chatEventsHandler, recordAgreementEvent } from "../src/chatEvents";
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
    expect(body.events.map((item) => item.kind)).toEqual(["proposed", "agreed", "checkedin"]);
    expect(body.events[0].actor).toBe(owner.address.toLowerCase());
    await processEvents(ctx.db, handlers, 100);
    expect(((await (await ctx.call(`/me/chats/${applicationId}/events`, authed(publisher, "GET"))).json()) as { events: unknown[] }).events).toHaveLength(3);
  });

  it("solo lo ven las dos personas del chat", async () => {
    const { ctx, worker, applicationId } = await chat();
    expect((await ctx.call(`/me/chats/${applicationId}/events`, { method: "GET" })).status).toBe(401);
    const outsider = await tokenFor(ctx.call, admin);
    expect((await ctx.call(`/me/chats/${applicationId}/events`, authed(outsider.body.token, "GET"))).status).toBe(403);
    expect((await ctx.call(`/me/chats/${applicationId}/events`, authed(worker, "GET"))).status).toBe(200);
  });
});
