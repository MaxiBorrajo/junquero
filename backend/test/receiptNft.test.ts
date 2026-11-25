import { beforeEach, describe, expect, it } from "vitest";
import { keccak256, toBytes, type Hex } from "viem";
import { readCache, slowCache } from "../src/app";
import { applicationsHandler } from "../src/applications";
import { createChangasHandler } from "../src/changas";
import { processEvents } from "../src/eventStream";
import { escrowDomain } from "../src/agreements";
import { notificationsHandler } from "../src/notifications";
import { partiesHandler } from "../src/parties";
import { parseRelease, releaseTypes, ZERO_HASH } from "../src/releases";
import { receiptsHandler, receiptsOf } from "../src/receipts";
import { authed, createdEvent, futureSpec, owner, plainEvent, setup, stranger, TOKEN, tokenFor } from "./helpers";

beforeEach(() => {
  readCache.clear();
  slowCache.clear();
});

const handlers = [createChangasHandler(new Map([[TOKEN.toLowerCase(), 6]])), applicationsHandler, partiesHandler, receiptsHandler, notificationsHandler];
const now = () => Math.floor(Date.now() / 1000);
const EVIDENCE = ("0x" + "ab".repeat(32)) as Hex;
const COMMENT = "Excelente trabajo, muy prolijo y puntual.";
const COMMENT_HASH = keccak256(toBytes(COMMENT));

// Una changa entregada (orden 1) entre `owner` (quien publica) y `stranger` (quien trabaja).
async function delivered() {
  const ctx = setup();
  const payer = await tokenFor(ctx.call, owner);
  await ctx.call("/me/profile", authed(payer.body.token, "PUT", { name: "Ana M.", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } }));
  const draft = await ctx.call("/me/changas", authed(payer.body.token, "POST", futureSpec("nonce-0001")));
  const { specHash } = (await draft.json()) as { specHash: string };
  createdEvent(ctx.raw, 1, specHash, owner.address, "100000000", 101);
  plainEvent(ctx.raw, "OrderAgreed", 1, 102, { payee: stranger.address });
  plainEvent(ctx.raw, "OrderDelivered", 1, 103);
  await processEvents(ctx.db, handlers, 100);
  const worker = await tokenFor(ctx.call, stranger);
  return { ctx, payer, worker, specHash };
}

const releaseBody = async (signedComment: Hex, sentComment?: Hex) => {
  const expiry = now() + 7200;
  const signature = await owner.signTypedData({
    domain: escrowDomain,
    types: releaseTypes,
    primaryType: "Release",
    message: { orderId: 1n, payee: stranger.address, amount: 100000000n, rating: 5, evidenceHash: EVIDENCE, expiry, commentHash: signedComment },
  });
  return { amount: "100000000", rating: 5, evidenceHash: EVIDENCE, expiry, signature, ...(sentComment === undefined ? {} : { commentHash: sentComment }) };
};

// Emite en la cadena (simulada) el comprobante de la orden 1: nota 5 y la huella del comentario.
function minted(ctx: Awaited<ReturnType<typeof delivered>>["ctx"], specHash: string, commentHash: string = COMMENT_HASH) {
  plainEvent(ctx.raw, "OrderSettled", 1, 104, { payee: stranger.address, rating: "5" });
  plainEvent(ctx.raw, "ReceiptClaimed", 1, 105, { payee: stranger.address, category: "2", month: "202611" });
  plainEvent(ctx.raw, "ReceiptMinted", 1, 106, { orderId: "1", payee: stranger.address, payer: owner.address, rating: "5", commentHash, specHash, amount: "100000000" });
}

describe("liberación con comentario", () => {
  it("la huella del comentario va en la firma y la ve quien cobra", async () => {
    const w = await delivered();
    const body = await releaseBody(COMMENT_HASH, COMMENT_HASH);
    expect((await w.ctx.call("/me/orders/1/release", authed(w.payer.body.token, "POST", body))).status).toBe(201);

    const seen = (await (await w.ctx.call("/me/orders/1/release", authed(w.worker.body.token, "GET"))).json()) as any;
    expect(seen.release.commentHash).toBe(COMMENT_HASH);
  });

  it("sin comentario la huella es cero, y el campo es opcional", async () => {
    const w = await delivered();
    expect((await w.ctx.call("/me/orders/1/release", authed(w.payer.body.token, "POST", await releaseBody(ZERO_HASH)))).status).toBe(201);
    const seen = (await (await w.ctx.call("/me/orders/1/release", authed(w.worker.body.token, "GET"))).json()) as any;
    expect(seen.release.commentHash).toBe(ZERO_HASH);
  });

  it("rechaza una huella distinta de la que se firmó", async () => {
    const w = await delivered();
    const otherHash = keccak256(toBytes("Otro texto"));
    expect((await w.ctx.call("/me/orders/1/release", authed(w.payer.body.token, "POST", await releaseBody(COMMENT_HASH, otherHash)))).status).toBe(400);
    // Firmó un comentario pero no lo manda: la firma no coincide con cero.
    expect((await w.ctx.call("/me/orders/1/release", authed(w.payer.body.token, "POST", await releaseBody(COMMENT_HASH)))).status).toBe(400);
  });

  it("valida el formato de la huella y la ignora en los hitos", () => {
    const base = { amount: "100", rating: 5, evidenceHash: EVIDENCE, expiry: now() + 600, signature: "0x12" };
    expect(parseRelease({ ...base, commentHash: "0x12" })).toEqual({ ok: false, error: "invalid commentHash" });
    const milestone = parseRelease({ ...base, index: 0, commentHash: COMMENT_HASH });
    expect(milestone.ok && milestone.value.commentHash).toBe(ZERO_HASH);
    const single = parseRelease({ ...base, commentHash: COMMENT_HASH.toUpperCase().replace("0X", "0x") });
    expect(single.ok && single.value.commentHash).toBe(COMMENT_HASH);
  });
});

describe("comentario de la calificación", () => {
  it("quien publicó lo guarda y recibe la huella del texto", async () => {
    const w = await delivered();
    const response = await w.ctx.call("/me/orders/1/rating-comment", authed(w.payer.body.token, "POST", { text: `  ${COMMENT}  ` }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ hash: COMMENT_HASH });
    expect(w.ctx.raw.prepare("SELECT payer, hash, text FROM rating_comments WHERE order_id = 1").get()).toMatchObject({ payer: owner.address.toLowerCase(), hash: COMMENT_HASH, text: COMMENT });

    // Se puede corregir antes de firmar: queda el último.
    await w.ctx.call("/me/orders/1/rating-comment", authed(w.payer.body.token, "POST", { text: "Mejor de lo esperado." }));
    expect(w.ctx.raw.prepare("SELECT COUNT(*) AS n, text FROM rating_comments").get()).toMatchObject({ n: 1, text: "Mejor de lo esperado." });
  });

  it("solo quien publicó, y solo si la orden existe", async () => {
    const w = await delivered();
    expect((await w.ctx.call("/me/orders/1/rating-comment", authed(w.worker.body.token, "POST", { text: COMMENT }))).status).toBe(403);
    expect((await w.ctx.call("/me/orders/9/rating-comment", authed(w.payer.body.token, "POST", { text: COMMENT }))).status).toBe(404);
    expect((await w.ctx.call("/me/orders/x/rating-comment", authed(w.payer.body.token, "POST", { text: COMMENT }))).status).toBe(400);
    expect((await w.ctx.call("/me/orders/1/rating-comment", { method: "POST", body: JSON.stringify({ text: COMMENT }) })).status).toBe(401);
  });

  it("rechaza texto vacío, demasiado largo y con datos de contacto (es público)", async () => {
    const w = await delivered();
    const post = (body: unknown) => w.ctx.call("/me/orders/1/rating-comment", authed(w.payer.body.token, "POST", body));
    expect((await post({ text: "   " })).status).toBe(400);
    expect((await post({ text: "a".repeat(281) })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post({ text: "Escribime al 11 5555 1234 por cualquier cosa" })).status).toBe(400);
    expect((await post({ text: "Mi mail es ana@correo.com" })).status).toBe(400);
    expect((await post({ text: "a".repeat(280) })).status).toBe(201);
  });
});

describe("datos públicos del comprobante", () => {
  it("responde 404 hasta que se emite y 400 con un número inválido", async () => {
    const w = await delivered();
    expect((await w.ctx.call("/receipts/1")).status).toBe(404);
    expect((await w.ctx.call("/receipts/1.svg")).status).toBe(404);
    expect((await w.ctx.call("/receipts/abc")).status).toBe(400);
  });

  it("devuelve el JSON y la imagen, con el comentario que coincide y sin el monto", async () => {
    const w = await delivered();
    await w.ctx.call("/me/orders/1/rating-comment", authed(w.payer.body.token, "POST", { text: COMMENT }));
    minted(w.ctx, w.specHash);
    await processEvents(w.ctx.db, handlers, 100);

    const response = await w.ctx.call("/receipts/1");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("max-age");
    const json = (await response.json()) as { name: string; image: string; attributes: { trait_type: string; value: string | number }[] };
    expect(json.name).toBe("Comprobante: Cambiar una canilla");
    expect(json.image).toMatch(/\/receipts\/1\.svg$/);
    const byName = Object.fromEntries(json.attributes.map((a) => [a.trait_type, a.value]));
    expect(byName).toEqual({ Rubro: "Mudanzas", Mes: 202611, Nota: 5, Modalidad: "Presencial", Comentario: COMMENT });
    expect(JSON.stringify(json)).not.toContain("100000000");

    const svg = await w.ctx.call("/receipts/1.svg");
    expect(svg.status).toBe(200);
    expect(svg.headers.get("content-type")).toContain("image/svg+xml");
    const text = await svg.text();
    expect(text).toContain("<svg");
    // La tarjeta parte el título en renglones.
    expect(text).toContain("Cambiar una");
    expect(text).toContain("canilla");
    expect(text).toContain("Ana M.");
    expect(text).not.toContain(owner.address.toLowerCase());
    expect(text).not.toContain("100000000");
  });

  it("no muestra un comentario que no coincide con la huella del comprobante", async () => {
    const w = await delivered();
    await w.ctx.call("/me/orders/1/rating-comment", authed(w.payer.body.token, "POST", { text: "Este texto se cambió después." }));
    minted(w.ctx, w.specHash);
    await processEvents(w.ctx.db, handlers, 100);

    const json = (await (await w.ctx.call("/receipts/1")).json()) as { attributes: { trait_type: string }[] };
    expect(json.attributes.map((a) => a.trait_type)).not.toContain("Comentario");
  });

  it("sin comentario en la cadena (huella cero) tampoco hay comentario", async () => {
    const w = await delivered();
    await w.ctx.call("/me/orders/1/rating-comment", authed(w.payer.body.token, "POST", { text: COMMENT }));
    minted(w.ctx, w.specHash, ZERO_HASH);
    await processEvents(w.ctx.db, handlers, 100);

    const json = (await (await w.ctx.call("/receipts/1")).json()) as { attributes: { trait_type: string }[] };
    expect(json.attributes.map((a) => a.trait_type)).not.toContain("Comentario");
  });
});

describe("comprobantes de un perfil", () => {
  it("suma nota, comentario, nombre de quien calificó y modalidad, y distingue el reclamado a mano", async () => {
    const w = await delivered();
    await w.ctx.call("/me/orders/1/rating-comment", authed(w.payer.body.token, "POST", { text: COMMENT }));
    minted(w.ctx, w.specHash);
    // Otro trabajo cuyo comprobante se reclamó a mano, sin nota.
    plainEvent(w.ctx.raw, "ReceiptClaimed", 2, 107, { payee: stranger.address, category: "1", month: "202610" });
    await processEvents(w.ctx.db, handlers, 100);

    const list = await receiptsOf(w.ctx.db, stranger.address);
    expect(list).toHaveLength(2);
    const rated = list.find((item) => item.orderId === 1)!;
    expect(rated).toMatchObject({ rated: true, rating: 5, comment: COMMENT, commentHash: COMMENT_HASH, payerName: "Ana M.", remote: false, category: 2, month: 202611, title: "Cambiar una canilla" });
    const manual = list.find((item) => item.orderId === 2)!;
    expect(manual).toMatchObject({ rated: false, rating: null, comment: null, commentHash: null, payerName: null });

    const viaApi = (await (await w.ctx.call(`/profiles/${stranger.address}/receipts`)).json()) as { receipts: unknown[] };
    expect(viaApi.receipts).toHaveLength(2);
  });

  it("no cuenta dos veces el comprobante emitido (ReceiptClaimed y ReceiptMinted en la misma transacción)", async () => {
    const w = await delivered();
    minted(w.ctx, w.specHash);
    await processEvents(w.ctx.db, handlers, 100);
    expect(w.ctx.raw.prepare("SELECT COUNT(*) AS n FROM receipts").get()).toMatchObject({ n: 1 });
  });
});

describe("aviso al cobrar", () => {
  it("avisa a quien trabajó que recibió su comprobante", async () => {
    const w = await delivered();
    minted(w.ctx, w.specHash);
    await processEvents(w.ctx.db, handlers, 100);
    expect(w.ctx.raw.prepare("SELECT address, ref FROM notifications WHERE kind = 'receipt_minted'").all()).toEqual([{ address: stranger.address.toLowerCase(), ref: "1" }]);
  });
});
