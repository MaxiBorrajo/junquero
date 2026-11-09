import { beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { readCache } from "../src/app";
import { applicationsHandler } from "../src/applications";
import { createChangasHandler } from "../src/changas";
import { processEvents } from "../src/eventStream";
import { admin, authed, createdEvent, futureSpec, owner, setup, TOKEN, tokenFor } from "./helpers";

beforeEach(() => readCache.clear());
const handlers = [createChangasHandler(new Map([[TOKEN.toLowerCase(), 6]])), applicationsHandler];

async function world() {
  const ctx = setup();
  const boss = await tokenFor(ctx.call, admin);
  const user = await tokenFor(ctx.call, owner);
  await ctx.call("/me/profile", authed(user.body.token, "PUT", { name: "Ana", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 2000 } }));
  const draft = await ctx.call("/me/changas", authed(user.body.token, "POST", futureSpec()));
  const { specHash } = (await draft.json()) as { specHash: string };
  createdEvent(ctx.raw, 1, specHash, owner.address, "10000000", 101);
  await processEvents(ctx.db, handlers, 100);
  return { ctx, boss, user, specHash };
}

const get = (w: Awaited<ReturnType<typeof world>>, path: string, token = w.boss.body.token) => w.ctx.call(path, authed(token, "GET"));

describe("admin access", () => {
  it("only admins can read the panel endpoints", async () => {
    const w = await world();
    for (const path of ["/admin/summary", "/admin/changas", "/admin/users", "/admin/log"]) {
      expect((await get(w, path, w.user.body.token)).status).toBe(403);
      expect((await w.ctx.call(path)).status).toBe(401);
      expect((await get(w, path)).status).toBe(200);
    }
  });

  it("answers the browser preflight only for allowed origins", async () => {
    const w = await world();
    (w.ctx.env as any).ADMIN_ORIGINS = "https://panel.example";
    const allowed = await w.ctx.call("/admin/summary", { method: "OPTIONS", headers: { origin: "https://panel.example", "access-control-request-method": "GET", "access-control-request-headers": "authorization" } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://panel.example");
    const denied = await w.ctx.call("/admin/summary", { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "GET" } });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("summary, lists and log", () => {
  it("counts changas, volume and users", async () => {
    const w = await world();
    const body = (await (await get(w, "/admin/summary")).json()) as any;
    expect(body.changasByStatus).toEqual({ open: 1 });
    expect(body.escrowVolume).toBe(10_000_000);
    expect(body.usersBySelfie).toEqual({ none: 1 });
    expect(body).toMatchObject({ activeApplications: 0, pendingAgreements: 0, relaysLastHour: 0, queuedNotifications: 0, newUsersLastWeek: 1 });
  });

  it("lists changas with title and filters by status", async () => {
    const w = await world();
    const all = ((await (await get(w, "/admin/changas")).json()) as any).changas;
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ title: "Cambiar una canilla", status: "open", hidden: false, amount: "10000000" });
    expect(((await (await get(w, "/admin/changas?status=agreed")).json()) as any).changas).toHaveLength(0);
    expect((await get(w, "/admin/changas?before=abc")).status).toBe(400);
  });

  it("searches users by name or address", async () => {
    const w = await world();
    const byName = ((await (await get(w, "/admin/users?q=an")).json()) as any).users;
    expect(byName).toMatchObject([{ name: "Ana", published: 1, applications: 0, selfieStatus: "none" }]);
    expect(((await (await get(w, "/admin/users?q=zzz")).json()) as any).users).toHaveLength(0);
    expect(((await (await get(w, `/admin/users?q=${owner.address.slice(2, 10)}`)).json()) as any).users).toHaveLength(1);
  });
});

describe("hiding a changa", () => {
  const hide = (w: Awaited<ReturnType<typeof world>>, id: number, body: unknown) => w.ctx.call(`/admin/changas/${id}/hidden`, authed(w.boss.body.token, "POST", body));

  it("requires a reason, removes it from the public list and logs the action", async () => {
    const w = await world();
    const id = (w.ctx.raw.prepare("SELECT id FROM changas WHERE order_id = 1").get() as { id: number }).id;
    expect((await hide(w, id, { hidden: true })).status).toBe(400);
    expect((await hide(w, id, { hidden: true, reason: "ab" })).status).toBe(400);
    expect((await hide(w, id, { hidden: true, reason: "Contenido inapropiado" })).status).toBe(200);

    const bbox = "minLat=-35&maxLat=-34&minLng=-59&maxLng=-58";
    expect(((await (await w.ctx.call(`/changas?${bbox}`)).json()) as any).changas).toHaveLength(0);
    expect((await w.ctx.call(`/changas/${w.specHash}`)).status).toBe(404);
    expect(((await (await get(w, "/admin/changas")).json()) as any).changas[0]).toMatchObject({ hidden: true });

    expect((await hide(w, id, { hidden: false, reason: "Revisado y correcto" })).status).toBe(200);
    expect(((await (await w.ctx.call(`/changas?${bbox}`)).json()) as any).changas).toHaveLength(1);

    const log = ((await (await get(w, "/admin/log")).json()) as any).log;
    expect(log.map((entry: any) => [entry.action, entry.target, entry.reason, entry.admin])).toEqual([
      ["changa_restored", String(id), "Revisado y correcto", admin.address.toLowerCase()],
      ["changa_hidden", String(id), "Contenido inapropiado", admin.address.toLowerCase()],
    ]);
  });

  it("404 for unknown changas", async () => {
    const w = await world();
    expect((await hide(w, 99, { hidden: true, reason: "No existe" })).status).toBe(404);
  });
});

describe("selfie review audit", () => {
  it("rejecting needs a reason and every decision is logged", async () => {
    const ctx = setup();
    const boss = await tokenFor(ctx.call, admin);
    const person = privateKeyToAccount(generatePrivateKey());
    const user = await tokenFor(ctx.call, person);
    await ctx.call("/me/profile", authed(user.body.token, "PUT", { name: "Luz", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 2000 } }));
    ctx.raw.prepare("UPDATE profiles SET selfie_status = 'pending'").run();
    const noReason = await ctx.call(`/admin/selfies/${person.address}`, authed(boss.body.token, "POST", { approved: false }));
    expect(noReason.status).toBe(400);
    expect((await ctx.call(`/admin/selfies/${person.address}`, authed(boss.body.token, "POST", { approved: false, reason: "Foto borrosa" }))).status).toBe(200);
    const log = ((await (await ctx.call("/admin/log", authed(boss.body.token, "GET"))).json()) as any).log;
    expect(log).toMatchObject([{ action: "selfie_rejected", target: person.address.toLowerCase(), reason: "Foto borrosa" }]);
  });
});
