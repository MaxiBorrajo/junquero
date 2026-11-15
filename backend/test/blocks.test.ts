import { beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { readCache } from "../src/app";
import { applicationsHandler } from "../src/applications";
import { createChangasHandler } from "../src/changas";
import { processEvents } from "../src/eventStream";
import { authed, createdEvent, futureSpec, owner, setup, stranger, TOKEN, tokenFor } from "./helpers";

beforeEach(() => readCache.clear());

const handlers = [createChangasHandler(new Map([[TOKEN.toLowerCase(), 6]])), applicationsHandler];

async function publish(ctx: ReturnType<typeof setup>, token: string, nonceText: string, orderId: number) {
  const draft = await ctx.call("/me/changas", authed(token, "POST", futureSpec(nonceText)));
  const { specHash } = (await draft.json()) as { specHash: string };
  createdEvent(ctx.raw, orderId, specHash, owner.address);
  await processEvents(ctx.db, handlers, 100);
  return (ctx.raw.prepare("SELECT id FROM changas WHERE order_id = ?").get(orderId) as { id: number }).id;
}

async function scene() {
  const ctx = setup();
  const publisher = (await tokenFor(ctx.call, owner)).body.token;
  const worker = (await tokenFor(ctx.call, stranger)).body.token;
  const changaId = await publish(ctx, publisher, "nonce-0001", 1);
  const applied = await ctx.call(`/me/applications/${changaId}`, authed(worker, "PUT", { message: "hola" }));
  const applicationId = ((await applied.json()) as any).application.id as number;
  return { ctx, publisher, worker, changaId, applicationId };
}

const apply = (ctx: ReturnType<typeof setup>, token: string, changaId: number) => ctx.call(`/me/applications/${changaId}`, authed(token, "PUT", { message: "otra vez" }));
const status = (ctx: ReturnType<typeof setup>, applicationId: number) => (ctx.raw.prepare("SELECT status FROM applications WHERE id = ?").get(applicationId) as { status: string }).status;
const chatInfo = async (ctx: ReturnType<typeof setup>, token: string, applicationId: number) =>
  (await (await ctx.call(`/me/chats/${applicationId}/messages`, authed(token, "GET"))).json()) as any;

describe("dismissing an application", () => {
  it("closes the chat and keeps that person from applying again, without blocking them", async () => {
    const { ctx, publisher, worker, changaId, applicationId } = await scene();
    const dismissed = await ctx.call(`/me/applications/${applicationId}/dismiss`, authed(publisher, "POST", {}));
    expect(dismissed.status).toBe(200);
    expect(await dismissed.json()).toEqual({ ok: true, blocked: false });
    expect(status(ctx, applicationId)).toBe("dismissed");
    expect((await chatInfo(ctx, worker, applicationId)).writable).toBe(false);
    expect((await chatInfo(ctx, publisher, applicationId)).writable).toBe(false);
    expect((await apply(ctx, worker, changaId)).status).toBe(403);

    const other = await publish(ctx, publisher, "nonce-0002", 2);
    expect((await apply(ctx, worker, other)).status).toBe(201);
  });

  it("only the owner can dismiss, and only active applications", async () => {
    const { ctx, publisher, worker, applicationId } = await scene();
    expect((await ctx.call(`/me/applications/${applicationId}/dismiss`, authed(worker, "POST", {}))).status).toBe(403);
    expect((await ctx.call("/me/applications/999/dismiss", authed(publisher, "POST", {}))).status).toBe(404);
    expect((await ctx.call("/me/applications/nope/dismiss", authed(publisher, "POST", {}))).status).toBe(400);
    expect((await ctx.call(`/me/applications/${applicationId}/dismiss`, authed(publisher, "POST", {}))).status).toBe(200);
    expect((await ctx.call(`/me/applications/${applicationId}/dismiss`, authed(publisher, "POST", {}))).status).toBe(409);
  });
});

describe("blocking", () => {
  it("dismisses with a block: the person cannot apply to any other changa of the owner", async () => {
    const { ctx, publisher, worker, applicationId } = await scene();
    const other = await publish(ctx, publisher, "nonce-0002", 2);
    const result = await ctx.call(`/me/applications/${applicationId}/dismiss`, authed(publisher, "POST", { block: true }));
    expect(await result.json()).toEqual({ ok: true, blocked: true });
    expect((await apply(ctx, worker, other)).status).toBe(403);
    const listed = ((await (await ctx.call("/me/blocks", authed(publisher, "GET"))).json()) as any).blocks;
    expect(listed).toHaveLength(1);
    expect(listed[0].address).toBe(stranger.address.toLowerCase());
  });

  it("blocking an applicant closes all their active applications to the owner's changas", async () => {
    const { ctx, publisher, worker, applicationId } = await scene();
    const second = await publish(ctx, publisher, "nonce-0002", 2);
    const secondApplied = await apply(ctx, worker, second);
    const secondId = ((await secondApplied.json()) as any).application.id as number;
    expect((await ctx.call("/me/blocks", authed(publisher, "POST", { address: stranger.address }))).status).toBe(200);
    expect(status(ctx, applicationId)).toBe("dismissed");
    expect(status(ctx, secondId)).toBe("dismissed");
  });

  it("works in both directions: an applicant who blocks the owner withdraws and cannot apply again", async () => {
    const { ctx, publisher, worker, changaId, applicationId } = await scene();
    expect((await ctx.call("/me/blocks", authed(worker, "POST", { address: owner.address }))).status).toBe(200);
    expect(status(ctx, applicationId)).toBe("withdrawn");
    expect((await apply(ctx, worker, changaId)).status).toBe(403);
    expect((await chatInfo(ctx, publisher, applicationId)).writable).toBe(false);
  });

  it("can be undone, and it validates the address", async () => {
    const { ctx, publisher, worker } = await scene();
    await ctx.call("/me/blocks", authed(publisher, "POST", { address: stranger.address }));
    expect((await ctx.call(`/me/blocks/${stranger.address}`, authed(publisher, "DELETE"))).status).toBe(200);
    expect((await ctx.call(`/me/blocks/${stranger.address}`, authed(publisher, "DELETE"))).status).toBe(404);
    const again = await publish(ctx, publisher, "nonce-0003", 3);
    expect((await apply(ctx, worker, again)).status).toBe(201);
    expect((await ctx.call("/me/blocks", authed(publisher, "POST", { address: "nope" }))).status).toBe(400);
    expect((await ctx.call("/me/blocks", authed(publisher, "POST", { address: owner.address }))).status).toBe(400);
    expect((await ctx.call("/me/blocks", authed(publisher, "POST", {}))).status).toBe(400);
  });

  it("marks the chat list entry as read-only when the pair is blocked", async () => {
    const { ctx, publisher, worker } = await scene();
    await ctx.call("/me/blocks", authed(publisher, "POST", { address: stranger.address }));
    const chats = ((await (await ctx.call("/me/chats", authed(worker, "GET"))).json()) as any).chats;
    expect(chats[0].writable).toBe(false);
    const outsider = await tokenFor(ctx.call, privateKeyToAccount(generatePrivateKey()));
    expect(((await (await ctx.call("/me/chats", authed(outsider.body.token, "GET"))).json()) as any).chats).toEqual([]);
  });
});
