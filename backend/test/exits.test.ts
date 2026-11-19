import { beforeEach, describe, expect, it } from "vitest";
import { readCache } from "../src/app";
import { applicationsHandler } from "../src/applications";
import { createChangasHandler } from "../src/changas";
import { processEvents } from "../src/eventStream";
import { abandonmentsHandler, disputedMilestonesFrom } from "../src/exits";
import { partiesHandler } from "../src/parties";
import { admin, authed, createdEvent, futureSpec, owner, plainEvent, setup, stranger, TOKEN, tokenFor } from "./helpers";

beforeEach(() => readCache.clear());

const handlers = [createChangasHandler(new Map([[TOKEN.toLowerCase(), 6]])), applicationsHandler, partiesHandler, abandonmentsHandler];
const three = [
  { name: "Preparar", amount: "30000000", criteria: "Pared lisa", evidence: "Foto" },
  { name: "Pintar", amount: "30000000", criteria: "Dos manos", evidence: "Foto" },
  { name: "Limpiar", amount: "40000000", criteria: "Todo limpio", evidence: "Foto" },
];

async function agreed(milestones: typeof three) {
  const ctx = setup();
  const publisher = await tokenFor(ctx.call, owner);
  const draft = await ctx.call("/me/changas", authed(publisher.body.token, "POST", futureSpec("nonce-0001", { milestones })));
  const { specHash } = (await draft.json()) as { specHash: string };
  createdEvent(ctx.raw, 1, specHash, owner.address, "100000000");
  await processEvents(ctx.db, handlers, 100);
  const changaId = (ctx.raw.prepare("SELECT id FROM changas WHERE order_id = 1").get() as { id: number }).id;
  const worker = await tokenFor(ctx.call, stranger);
  await ctx.call(`/me/applications/${changaId}`, authed(worker.body.token, "PUT", { message: "hola" }));
  plainEvent(ctx.raw, "OrderAgreed", 1, 500, { payee: stranger.address });
  await processEvents(ctx.db, handlers, 100);
  return { ctx, changaId, publisher: publisher.body.token, worker: worker.body.token };
}

const changaRow = (ctx: Awaited<ReturnType<typeof agreed>>["ctx"]) => {
  const row = ctx.raw.prepare("SELECT spec, status, amount FROM changas WHERE order_id = 1").get() as { spec: string; status: string; amount: string };
  return { ...row, spec: JSON.parse(row.spec) };
};

describe("trabajo que se reabre", () => {
  it("con dos hitos que faltan, quedan los pendientes y el primero figura como hecho", async () => {
    const { ctx } = await agreed(three);
    plainEvent(ctx.raw, "MilestonePaid", 1, 501, { index: "0", paid: "30000000", rating: "5" });
    plainEvent(ctx.raw, "OrderAbandoned", 1, 502, { by: stranger.address, reopenedWith: "70000000" });
    await processEvents(ctx.db, handlers, 100);
    const row = changaRow(ctx);
    expect(row.status).toBe("open");
    expect(row.amount).toBe("70000000");
    expect(row.spec.doneMilestones.map((m: { name: string }) => m.name)).toEqual(["Preparar"]);
    expect(row.spec.milestones.map((m: { name: string }) => m.name)).toEqual(["Pintar", "Limpiar"]);
  });

  it("si falta un solo hito, queda como pago único y los hechos se acumulan", async () => {
    const { ctx } = await agreed(three);
    plainEvent(ctx.raw, "MilestonePaid", 1, 501, { index: "0", paid: "30000000", rating: "5" });
    plainEvent(ctx.raw, "MilestonePaid", 1, 502, { index: "1", paid: "30000000", rating: "5" });
    plainEvent(ctx.raw, "OrderAbandoned", 1, 503, { by: stranger.address, reopenedWith: "40000000" });
    await processEvents(ctx.db, handlers, 100);
    const row = changaRow(ctx);
    expect(row.spec.milestones).toBeUndefined();
    expect(row.spec.doneMilestones.map((m: { name: string }) => m.name)).toEqual(["Preparar", "Pintar"]);
    expect(row.amount).toBe("40000000");
  });

  it("si no se había pagado ningún hito, el plan queda igual", async () => {
    const { ctx } = await agreed(three);
    plainEvent(ctx.raw, "OrderAbandoned", 1, 502, { by: stranger.address, reopenedWith: "100000000" });
    await processEvents(ctx.db, handlers, 100);
    const row = changaRow(ctx);
    expect(row.spec.milestones).toHaveLength(3);
    expect(row.spec.doneMilestones).toBeUndefined();
  });

  it("si quien trabajaba cancela tras acordar, queda anotado en su historial; si cancela quien publicó, no", async () => {
    const { ctx } = await agreed(three);
    plainEvent(ctx.raw, "OrderCancelled", 1, 502, { by: owner.address, reason: 0, refunded: "100000000" });
    await processEvents(ctx.db, handlers, 100);
    expect(ctx.raw.prepare("SELECT COUNT(*) AS n FROM abandonments").get()).toEqual({ n: 0 });
    const other = await agreed(three);
    plainEvent(other.ctx.raw, "OrderCancelled", 1, 502, { by: stranger.address, reason: 1, refunded: "100000000" });
    await processEvents(other.ctx.db, handlers, 100);
    expect(other.ctx.raw.prepare("SELECT payee FROM abandonments").all()).toEqual([{ payee: stranger.address.toLowerCase() }]);
  });

  it("quien dejó el trabajo no puede volver a postularse y queda anotado en su historial", async () => {
    const { ctx, changaId, worker } = await agreed(three);
    plainEvent(ctx.raw, "OrderAbandoned", 1, 502, { by: stranger.address, reopenedWith: "100000000" });
    await processEvents(ctx.db, handlers, 100);
    const again = await ctx.call(`/me/applications/${changaId}`, authed(worker, "PUT", { message: "perdón" }));
    expect(again.status).toBe(403);
    await ctx.call("/me/profile", authed(worker, "PUT", { name: "Beto", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } }));
    const profile = await ctx.call(`/profiles/${stranger.address}`);
    expect(((await profile.json()) as { profile: { stats: { abandoned: number } } }).profile.stats.abandoned).toBe(1);
  });
});

describe("motivo al terminar o dejar", () => {
  it("lo pide, lo guarda solo de quien corresponde y lo muestran las dos partes", async () => {
    const { ctx, publisher, worker } = await agreed(three);
    const post = (token: string, body: unknown) => ctx.call("/me/orders/1/exit-reason", authed(token, "POST", body));
    expect((await post(worker, { kind: "abandoned", reason: "corto" })).status).toBe(400);
    expect((await post(publisher, { kind: "abandoned", reason: "No es mi trabajo, no puedo" })).status).toBe(403);
    expect((await post(worker, { kind: "abandoned", reason: "No puedo seguir por salud" })).status).toBe(201);
    const read = await ctx.call("/me/orders/1/exit-reasons", authed(publisher, "GET"));
    expect(((await read.json()) as { reasons: { reason: string }[] }).reasons[0]?.reason).toBe("No puedo seguir por salud");
    const outsider = await tokenFor(ctx.call, admin);
    expect((await ctx.call("/me/orders/1/exit-reasons", authed(outsider.body.token, "GET"))).status).toBe(404);
  });
});

describe("motivo con un reclamo abierto", () => {
  it("no se guarda mientras el trabajo está en reclamo", async () => {
    const { ctx, worker } = await agreed(three);
    plainEvent(ctx.raw, "DisputeOpened", 1, 501, { claimant: owner.address });
    await processEvents(ctx.db, handlers, 100);
    const res = await ctx.call("/me/orders/1/exit-reason", authed(worker, "POST", { kind: "abandoned", reason: "No puedo seguir por salud" }));
    expect(res.status).toBe(409);
  });
});

describe("reclamo de un hito", () => {
  it("no cierra el trabajo: vuelve a acordado y sigue con los demás hitos", async () => {
    const { ctx } = await agreed(three);
    plainEvent(ctx.raw, "DisputeOpened", 1, 501, { claimant: owner.address });
    await processEvents(ctx.db, handlers, 100);
    expect(changaRow(ctx).status).toBe("disputed");
    plainEvent(ctx.raw, "DisputeResolved", 1, 502, { payeeShareBps: "5000" });
    await processEvents(ctx.db, handlers, 100);
    expect(changaRow(ctx).status).toBe("agreed");
  });

  it("si era el último hito, el trabajo queda cerrado", async () => {
    const { ctx } = await agreed(three);
    plainEvent(ctx.raw, "DisputeOpened", 1, 501, { claimant: owner.address });
    plainEvent(ctx.raw, "OrderSettled", 1, 502, { payee: stranger.address, paid: "1", rating: "3" });
    plainEvent(ctx.raw, "DisputeResolved", 1, 503, { payeeShareBps: "5000" });
    await processEvents(ctx.db, handlers, 100);
    expect(changaRow(ctx).status).toBe("settled");
  });

  it("en un trabajo sin hitos, el veredicto lo cierra", async () => {
    const ctx = setup();
    const publisher = await tokenFor(ctx.call, owner);
    const draft = await ctx.call("/me/changas", authed(publisher.body.token, "POST", futureSpec("nonce-0001")));
    const { specHash } = (await draft.json()) as { specHash: string };
    createdEvent(ctx.raw, 1, specHash, owner.address);
    plainEvent(ctx.raw, "DisputeOpened", 1, 501, { claimant: owner.address });
    plainEvent(ctx.raw, "DisputeResolved", 1, 502, { payeeShareBps: "5000" });
    await processEvents(ctx.db, handlers, 100);
    expect((ctx.raw.prepare("SELECT status FROM changas WHERE order_id = 1").get() as { status: string }).status).toBe("settled");
  });
});

describe("hitos cerrados por reclamo", () => {
  const ev = (name: string, args: object = {}) => ({ name, args: JSON.stringify(args) });
  it("marca el hito que se resolvió por reclamo, aunque haya hitos pagados antes y después", () => {
    const list = [ev("OrderAgreed"), ev("MilestonePaid", { index: "0" }), ev("DisputeResolved", { payeeShareBps: "5000" }), ev("MilestonePaid", { index: "2" })];
    expect(disputedMilestonesFrom(list)).toEqual([{ index: 1, payeeShareBps: 5000 }]);
  });

  it("empieza de cero cuando el trabajo se reabre y se vuelve a acordar", () => {
    const list = [ev("OrderAgreed"), ev("DisputeResolved", { payeeShareBps: "0" }), ev("OrderAbandoned"), ev("OrderAgreed"), ev("MilestonePaid", { index: "0" })];
    expect(disputedMilestonesFrom(list)).toEqual([]);
  });

  it("lo ven las partes y nadie más", async () => {
    const { ctx, publisher, worker } = await agreed(three);
    plainEvent(ctx.raw, "DisputeResolved", 1, 501, { payeeShareBps: "2500" });
    await processEvents(ctx.db, handlers, 100);
    for (const token of [publisher, worker]) {
      const res = await ctx.call("/me/orders/1/disputed-milestones", authed(token, "GET"));
      expect(((await res.json()) as { disputed: unknown[] }).disputed).toEqual([{ index: 0, payeeShareBps: 2500 }]);
    }
    const outsider = await tokenFor(ctx.call, admin);
    expect((await ctx.call("/me/orders/1/disputed-milestones", authed(outsider.body.token, "GET"))).status).toBe(404);
  });
});
