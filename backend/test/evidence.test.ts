import { beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { readCache } from "../src/app";
import { applicationsHandler } from "../src/applications";
import { buildEvidenceMessage } from "../src/auth";
import { createChangasHandler } from "../src/changas";
import { MAX_ITEMS_PER_UPLOADER, metaDigest } from "../src/evidence";
import { processEvents } from "../src/eventStream";
import { MAX_EVIDENCE_BYTES } from "../src/files";
import { partiesHandler } from "../src/parties";
import { authed, createdEvent, futureSpec, owner, plainEvent, setup, sha256, stranger, TOKEN, tokenFor } from "./helpers";

beforeEach(() => readCache.clear());

const handlers = [createChangasHandler(new Map([[TOKEN.toLowerCase(), 6]])), applicationsHandler, partiesHandler];
const juror = privateKeyToAccount(generatePrivateKey());
const meta = "bWV0YWRhdGEgY2lmcmFkYQ==";
const wrapped = "d3JhcHBlZGtleXdyYXBwZWRrZXk=";

async function agreed(ctx: ReturnType<typeof setup>, state = "OrderAgreed") {
  const publisher = await tokenFor(ctx.call, owner);
  const draft = await ctx.call("/me/changas", authed(publisher.body.token, "POST", futureSpec("nonce-0001")));
  const { specHash } = (await draft.json()) as { specHash: string };
  createdEvent(ctx.raw, 1, specHash, owner.address);
  if (state === "OrderAgreed") plainEvent(ctx.raw, "OrderAgreed", 1, 500, { payee: stranger.address });
  await processEvents(ctx.db, handlers, 100);
  const worker = await tokenFor(ctx.call, stranger);
  return { payer: publisher.body.token, payee: worker.body.token };
}

const cipher = (seed: number, length = 64) => new Uint8Array(length).map((_, i) => (i * seed + 7) % 256);

const uploadCipher = (ctx: ReturnType<typeof setup>, token: string, bytes: Uint8Array, mime = "application/octet-stream") =>
  ctx.call("/me/evidence-files", {
    method: "PUT",
    body: bytes,
    headers: { authorization: `Bearer ${token}`, "content-type": mime, "content-length": String(bytes.length), "x-content-sha256": sha256(bytes) },
  });

async function register(ctx: ReturnType<typeof setup>, token: string, bytes: Uint8Array, account = stranger, overrides: Record<string, unknown> = {}) {
  const hash = sha256(bytes);
  const signature = await account.signMessage({ message: buildEvidenceMessage(1, hash, await metaDigest(meta)) });
  return ctx.call("/me/orders/1/evidence", authed(token, "POST", { hash, kind: "photo", meta, signature, ...overrides }));
}

async function uploaded(ctx: ReturnType<typeof setup>, token: string, seed = 3) {
  const bytes = cipher(seed);
  await uploadCipher(ctx, token, bytes);
  return { bytes, hash: sha256(bytes) };
}

describe("uploading and registering", () => {
  it("lets the provider upload encrypted evidence and both parties read it", async () => {
    const ctx = setup();
    const { payer, payee } = await agreed(ctx);
    const { bytes, hash } = await uploaded(ctx, payee);
    expect((await register(ctx, payee, bytes)).status).toBe(201);
    expect((await register(ctx, payee, bytes)).status).toBe(200);

    const share = await ctx.call(`/me/orders/1/evidence/${hash}/keys`, authed(payee, "PUT", { recipient: owner.address, wrapped }));
    expect(share.status).toBe(200);

    const list = ((await (await ctx.call("/me/orders/1/evidence", authed(payer, "GET"))).json()) as any);
    expect(list.role).toBe("payer");
    expect(list.evidence).toHaveLength(1);
    expect(list.evidence[0]).toMatchObject({ hash, uploader: stranger.address.toLowerCase(), kind: "photo", meta, size: bytes.length, wrappedKey: wrapped });

    const download = await ctx.call(`/me/orders/1/evidence/${hash}`, authed(payer, "GET"));
    expect(download.status).toBe(200);
    expect(download.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
  });

  it("requires the file to be uploaded first, and the signature to come from the uploader", async () => {
    const ctx = setup();
    const { payee } = await agreed(ctx);
    const bytes = cipher(5);
    expect((await register(ctx, payee, bytes)).status).toBe(404);
    await uploadCipher(ctx, payee, bytes);
    expect((await register(ctx, payee, bytes, owner)).status).toBe(400);
    expect((await register(ctx, payee, bytes, stranger, { meta: "b3RybyBtZXRhZGF0bw==" })).status).toBe(400);
  });

  it("rejects malformed registrations", async () => {
    const ctx = setup();
    const { payee } = await agreed(ctx);
    const { bytes } = await uploaded(ctx, payee);
    for (const overrides of [{ hash: "xyz" }, { kind: "audio" }, { meta: "" }, { meta: "A".repeat(2049) }, { signature: "0x12" }]) {
      expect((await register(ctx, payee, bytes, stranger, overrides)).status).toBe(400);
    }
    expect((await ctx.call("/me/orders/1/evidence", authed(payee, "POST", null))).status).toBe(400);
  });

  it("only accepts opaque ciphertext within the size limit", async () => {
    const ctx = setup();
    const { payee } = await agreed(ctx);
    expect((await uploadCipher(ctx, payee, cipher(2), "image/png")).status).toBe(415);
    const oversize = await ctx.call("/me/evidence-files", {
      method: "PUT",
      body: cipher(2),
      headers: { authorization: `Bearer ${payee}`, "content-type": "application/octet-stream", "content-length": String(MAX_EVIDENCE_BYTES + 1), "x-content-sha256": sha256(cipher(2)) },
    });
    expect(oversize.status).toBe(413);
  });

  it("does not accept evidence while the order is not agreed, or for unknown orders", async () => {
    const ctx = setup();
    const { payee } = await agreed(ctx, "open");
    const { bytes } = await uploaded(ctx, payee);
    expect((await register(ctx, payee, bytes)).status).toBe(403);

    const other = setup();
    const { payee: token } = await agreed(other);
    plainEvent(other.raw, "OrderSettled", 1, 600, { payee: stranger.address });
    await processEvents(other.db, handlers, 100);
    const done = await uploaded(other, token);
    expect((await register(other, token, done.bytes)).status).toBe(409);
    expect((await other.call("/me/orders/99/evidence", authed(token, "GET"))).status).toBe(404);
    expect((await other.call("/me/orders/0/evidence", authed(token, "GET"))).status).toBe(400);
  });

  it("limits items per uploader", async () => {
    const ctx = setup();
    const { payee } = await agreed(ctx);
    for (let i = 0; i < MAX_ITEMS_PER_UPLOADER; i++) {
      ctx.raw.prepare("INSERT INTO evidence (order_id, hash, uploader, kind, meta, signature, size, created_at) VALUES (1, ?, ?, 'photo', 'x', 'y', 1, 1)").run(`${i}`.padStart(64, "0"), stranger.address.toLowerCase());
    }
    const { bytes } = await uploaded(ctx, payee);
    expect((await register(ctx, payee, bytes)).status).toBe(429);
  });
});

describe("who can see what", () => {
  it("keeps outsiders out", async () => {
    const ctx = setup();
    const { payee } = await agreed(ctx);
    const { bytes, hash } = await uploaded(ctx, payee);
    await register(ctx, payee, bytes);
    const outsider = await tokenFor(ctx.call, privateKeyToAccount(generatePrivateKey()));
    expect((await ctx.call("/me/orders/1/evidence", authed(outsider.body.token, "GET"))).status).toBe(403);
    expect((await ctx.call(`/me/orders/1/evidence/${hash}`, authed(outsider.body.token, "GET"))).status).toBe(403);
    expect((await ctx.call(`/me/orders/1/evidence/${hash}`)).status).toBe(401);
    expect((await ctx.call("/me/orders/1/evidence/zz", authed(payee, "GET"))).status).toBe(404);
  });

  it("shows jurors only the items whose key a party wrapped for them", async () => {
    const ctx = setup();
    const { payer, payee } = await agreed(ctx);
    const first = await uploaded(ctx, payee, 3);
    const second = await uploaded(ctx, payee, 4);
    await register(ctx, payee, first.bytes);
    await register(ctx, payee, second.bytes);

    ctx.raw.prepare("INSERT INTO events (block_number, log_index, block_timestamp, tx_hash, contract, address, name, order_id, case_id, args) VALUES (700, 0, 1, '0x9', 'arbitration', '0x', 'CaseOpened', 1, 4, '{}')").run();
    ctx.raw.prepare("INSERT INTO events (block_number, log_index, block_timestamp, tx_hash, contract, address, name, case_id, args) VALUES (701, 0, 1, '0x9', 'arbitration', '0x', 'JuryDrawn', 4, ?)").run(JSON.stringify({ jurors: [juror.address] }));
    await processEvents(ctx.db, handlers, 100);

    const panel = await tokenFor(ctx.call, juror);
    const empty = ((await (await ctx.call("/me/orders/1/evidence", authed(panel.body.token, "GET"))).json()) as any);
    expect(empty).toMatchObject({ role: "juror", evidence: [] });
    expect((await ctx.call(`/me/orders/1/evidence/${first.hash}`, authed(panel.body.token, "GET"))).status).toBe(404);

    expect((await ctx.call(`/me/orders/1/evidence/${first.hash}/keys`, authed(payee, "PUT", { recipient: juror.address, wrapped }))).status).toBe(200);
    const visible = ((await (await ctx.call("/me/orders/1/evidence", authed(panel.body.token, "GET"))).json()) as any).evidence;
    expect(visible.map((item: any) => item.hash)).toEqual([first.hash]);
    expect(visible[0].wrappedKey).toBe(wrapped);
    expect((await ctx.call(`/me/orders/1/evidence/${first.hash}`, authed(panel.body.token, "GET"))).status).toBe(200);
    expect((await ctx.call(`/me/orders/1/evidence/${second.hash}`, authed(panel.body.token, "GET"))).status).toBe(404);

    expect((await ctx.call(`/me/orders/1/evidence/${first.hash}/keys`, authed(panel.body.token, "PUT", { recipient: owner.address, wrapped }))).status).toBe(403);
    const all = (await (await ctx.call("/me/orders/1/evidence", authed(payer, "GET"))).json()) as any;
    expect(all.evidence).toHaveLength(2);
  });

  it("lets a juror not upload evidence", async () => {
    const ctx = setup();
    await agreed(ctx);
    ctx.raw.prepare("INSERT INTO order_cases (case_id, order_id) VALUES (4, 1)").run();
    ctx.raw.prepare("INSERT INTO case_jurors (case_id, juror) VALUES (4, ?)").run(juror.address.toLowerCase());
    const panel = await tokenFor(ctx.call, juror);
    const bytes = cipher(9);
    await uploadCipher(ctx, panel.body.token, bytes);
    expect((await register(ctx, panel.body.token, bytes, juror)).status).toBe(403);
  });
});

describe("sharing keys", () => {
  it("allows wrapping for the other party, for yourself and for drawn jurors only", async () => {
    const ctx = setup();
    const { payee } = await agreed(ctx);
    const { bytes, hash } = await uploaded(ctx, payee);
    await register(ctx, payee, bytes);
    const put = (body: unknown, path = hash) => ctx.call(`/me/orders/1/evidence/${path}/keys`, authed(payee, "PUT", body));
    expect((await put({ recipient: stranger.address, wrapped })).status).toBe(200);
    expect((await put({ recipient: owner.address, wrapped })).status).toBe(200);
    expect((await put({ recipient: juror.address, wrapped })).status).toBe(403);
    expect((await put({ recipient: "nope", wrapped })).status).toBe(400);
    expect((await put({ recipient: owner.address, wrapped: "" })).status).toBe(400);
    expect((await put({ recipient: owner.address, wrapped }, "ab".repeat(32))).status).toBe(404);
    expect((await put({ recipient: owner.address, wrapped }, "zz")).status).toBe(400);
    const stored = ctx.raw.prepare("SELECT recipient FROM evidence_keys ORDER BY recipient").all() as any[];
    expect(stored).toHaveLength(2);
  });
});
