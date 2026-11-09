import { beforeEach, describe, expect, it } from "vitest";
import { readCache } from "../src/app";
import { MAX_FILES_PER_OWNER, MAX_SELFIE_BYTES, purgeOrphanFiles } from "../src/files";
import { admin, authed, futureSpec, owner, setup, sha256, stranger, tokenFor } from "./helpers";

beforeEach(() => readCache.clear());

const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 5]);

const upload = (ctx: ReturnType<typeof setup>, token: string, bytes: Uint8Array, mime = "image/png", path = "/me/files", hash = sha256(bytes)) =>
  ctx.call(path, {
    method: "PUT",
    body: bytes,
    headers: { authorization: `Bearer ${token}`, "content-type": mime, "content-length": String(bytes.length), "x-content-sha256": hash },
  });

const profileBody = { name: "Lucía", work: { lat: -34.6, lng: -58.38, radiusM: 3000 } };

describe("public files", () => {
  it("stores a file verified by its sha256 and serves it to anyone with long caching", async () => {
    const ctx = setup();
    const { body } = await tokenFor(ctx.call);
    const response = await upload(ctx, body.token, png);
    expect(response.status).toBe(201);
    const data = (await response.json()) as { hash: string; url: string };
    expect(data.url).toBe(`/files/${owner.address.toLowerCase()}/${sha256(png)}`);

    const served = await ctx.call(data.url);
    expect(served.status).toBe(200);
    expect(served.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(png);
  });

  it("is idempotent and does not write twice", async () => {
    const ctx = setup();
    const { body } = await tokenFor(ctx.call);
    await upload(ctx, body.token, png);
    const again = await upload(ctx, body.token, png);
    expect(again.status).toBe(200);
    expect(ctx.bucket.objects.size).toBe(1);
  });

  it("rejects a mismatched hash, unsupported types, missing length and oversize files", async () => {
    const ctx = setup();
    const { body } = await tokenFor(ctx.call);
    expect((await upload(ctx, body.token, png, "image/png", "/me/files", "ab".repeat(32))).status).toBe(400);
    expect(ctx.bucket.objects.size).toBe(0);
    expect((await upload(ctx, body.token, png, "application/x-msdownload")).status).toBe(415);
    expect((await upload(ctx, body.token, png, "image/png", "/me/files", "xyz")).status).toBe(400);

    const noLength = await ctx.call("/me/files", {
      method: "PUT",
      body: png,
      headers: { authorization: `Bearer ${body.token}`, "content-type": "image/png", "x-content-sha256": sha256(png) },
    });
    expect(noLength.status).toBe(411);
    const huge = await ctx.call("/me/files", {
      method: "PUT",
      body: png,
      headers: { authorization: `Bearer ${body.token}`, "content-type": "image/png", "content-length": String(26 * 1024 * 1024), "x-content-sha256": sha256(png) },
    });
    expect(huge.status).toBe(413);
  });

  it("requires a session and enforces the per-owner quota", async () => {
    const ctx = setup();
    expect((await ctx.call("/me/files", { method: "PUT", body: png })).status).toBe(401);
    const { body } = await tokenFor(ctx.call);
    for (let i = 0; i < MAX_FILES_PER_OWNER; i++) {
      ctx.raw.prepare("INSERT INTO files (owner, hash, kind, mime, size, created_at) VALUES (?, ?, 'public', 'image/png', 1, 1)").run(owner.address.toLowerCase(), `${i}`.padStart(64, "0"));
    }
    expect((await upload(ctx, body.token, png)).status).toBe(429);
  });

  it("does not serve unknown, invalid or selfie files from the public route", async () => {
    const ctx = setup();
    expect((await ctx.call(`/files/${owner.address}/${"00".repeat(32)}`)).status).toBe(404);
    expect((await ctx.call("/files/nope/abc")).status).toBe(400);
    const { body } = await tokenFor(ctx.call);
    await ctx.call("/me/profile", authed(body.token, "PUT", profileBody));
    await upload(ctx, body.token, png, "image/png", "/me/selfie");
    expect((await ctx.call(`/files/${owner.address}/${sha256(png)}`)).status).toBe(404);
  });

  it("forces download for document types", async () => {
    const ctx = setup();
    const { body } = await tokenFor(ctx.call);
    const doc = new TextEncoder().encode("a,b\n1,2");
    const response = await upload(ctx, body.token, doc, "text/csv");
    const served = await ctx.call(((await response.json()) as any).url);
    expect(served.headers.get("content-disposition")).toBe("attachment");
  });
});

describe("attachments and photo", () => {
  const attachment = (bytes: Uint8Array, overrides = {}) => ({ hash: "0x" + sha256(bytes), name: "a.png", mime: "image/png", size: bytes.length, ...overrides });

  it("accepts a changa that references uploaded files and links them", async () => {
    const ctx = setup();
    const { body } = await tokenFor(ctx.call);
    await upload(ctx, body.token, png);
    const response = await ctx.call("/me/changas", authed(body.token, "POST", futureSpec("nonce-0001", { attachments: [attachment(png)] })));
    expect(response.status).toBe(201);
    expect((ctx.raw.prepare("SELECT linked FROM files").get() as { linked: number }).linked).toBe(1);
  });

  it("rejects attachments that were not uploaded, belong to someone else or do not match", async () => {
    const ctx = setup();
    const a = await tokenFor(ctx.call);
    const b = await tokenFor(ctx.call, stranger);
    const post = (token: string, spec: object) => ctx.call("/me/changas", authed(token, "POST", spec));
    expect((await post(a.body.token, futureSpec("nonce-0001", { attachments: [attachment(png)] }))).status).toBe(400);
    await upload(ctx, a.body.token, png);
    expect((await post(b.body.token, futureSpec("nonce-0002", { attachments: [attachment(png)] }))).status).toBe(400);
    expect((await post(a.body.token, futureSpec("nonce-0003", { attachments: [attachment(png, { size: 999 })] }))).status).toBe(400);
    expect((await post(a.body.token, futureSpec("nonce-0004", { attachments: [attachment(png, { mime: "image/jpeg" })] }))).status).toBe(400);
  });

  it("checks application attachments the same way", async () => {
    const ctx = setup();
    const publisher = await tokenFor(ctx.call);
    const draft = await ctx.call("/me/changas", authed(publisher.body.token, "POST", futureSpec("nonce-0001")));
    const { specHash } = (await draft.json()) as { specHash: string };
    const { createdEvent } = await import("./helpers");
    createdEvent(ctx.raw, 1, specHash, owner.address);
    const { processEvents } = await import("../src/eventStream");
    const { createChangasHandler } = await import("../src/changas");
    await processEvents(ctx.db, [createChangasHandler(new Map())], 100);
    const id = (ctx.raw.prepare("SELECT id FROM changas WHERE order_id = 1").get() as { id: number }).id;

    const worker = await tokenFor(ctx.call, stranger);
    const put = (attachments: unknown[]) => ctx.call(`/me/applications/${id}`, authed(worker.body.token, "PUT", { attachments }));
    expect((await put([attachment(png)])).status).toBe(400);
    await upload(ctx, worker.body.token, png);
    expect((await put([attachment(png)])).status).toBe(201);
  });

  it("sets a profile photo from an uploaded image and exposes its url", async () => {
    const ctx = setup();
    const { body } = await tokenFor(ctx.call);
    await upload(ctx, body.token, png);
    const saved = await ctx.call("/me/profile", authed(body.token, "PUT", { ...profileBody, photo: sha256(png) }));
    expect(saved.status).toBe(200);
    const profile = ((await saved.json()) as any).profile;
    expect(profile.photo.url).toBe(`/files/${owner.address.toLowerCase()}/${sha256(png)}`);
    const publicView = ((await (await ctx.call(`/profiles/${owner.address}`)).json()) as any).profile;
    expect(publicView.photo.hash).toBe(sha256(png));
  });

  it("rejects a profile photo that is missing or not an image", async () => {
    const ctx = setup();
    const { body } = await tokenFor(ctx.call);
    expect((await ctx.call("/me/profile", authed(body.token, "PUT", { ...profileBody, photo: sha256(png) }))).status).toBe(400);
    const doc = new TextEncoder().encode("hola");
    await upload(ctx, body.token, doc, "text/plain");
    expect((await ctx.call("/me/profile", authed(body.token, "PUT", { ...profileBody, photo: sha256(doc) }))).status).toBe(400);
    expect((await ctx.call("/me/profile", authed(body.token, "PUT", { ...profileBody, photo: "zz" }))).status).toBe(400);
  });
});

describe("selfie review", () => {
  const selfie = new Uint8Array([255, 216, 255, 1, 2, 3]);

  async function submitted(ctx: ReturnType<typeof setup>) {
    const user = await tokenFor(ctx.call);
    await ctx.call("/me/profile", authed(user.body.token, "PUT", profileBody));
    const response = await upload(ctx, user.body.token, selfie, "image/jpeg", "/me/selfie");
    return { user, response };
  }

  it("needs a profile first, then leaves the selfie pending and visible only to its owner and admins", async () => {
    const ctx = setup();
    const user = await tokenFor(ctx.call);
    expect((await upload(ctx, user.body.token, selfie, "image/jpeg", "/me/selfie")).status).toBe(409);

    const { response } = await submitted(ctx);
    expect(response.status).toBe(202);
    expect(((await (await ctx.call("/me", authed(user.body.token, "GET"))).json()) as any).profile.selfieStatus).toBe("pending");

    const own = await ctx.call("/me/selfie", authed(user.body.token, "GET"));
    expect(own.status).toBe(200);
    expect(own.headers.get("cache-control")).toBe("private, no-store");
    const other = await tokenFor(ctx.call, stranger);
    expect((await ctx.call("/me/selfie", authed(other.body.token, "GET"))).status).toBe(404);
  });

  it("only admins can list and view pending selfies", async () => {
    const ctx = setup();
    const { user } = await submitted(ctx);
    expect((await ctx.call("/admin/selfies", authed(user.body.token, "GET"))).status).toBe(403);
    expect((await ctx.call("/admin/selfies")).status).toBe(401);

    const boss = await tokenFor(ctx.call, admin);
    const list = ((await (await ctx.call("/admin/selfies", authed(boss.body.token, "GET"))).json()) as any).selfies;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ address: owner.address.toLowerCase(), name: "Lucía" });
    const image = await ctx.call(`/admin/selfies/${owner.address}`, authed(boss.body.token, "GET"));
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(selfie);
  });

  it("approval verifies the profile and deletes the image", async () => {
    const ctx = setup();
    const { user } = await submitted(ctx);
    const boss = await tokenFor(ctx.call, admin);
    const review = await ctx.call(`/admin/selfies/${owner.address}`, authed(boss.body.token, "POST", { approved: true }));
    expect(review.status).toBe(200);
    expect(ctx.bucket.objects.size).toBe(0);
    expect((ctx.raw.prepare("SELECT COUNT(*) AS n FROM files").get() as { n: number }).n).toBe(0);
    const publicView = ((await (await ctx.call(`/profiles/${owner.address}`)).json()) as any).profile;
    expect(publicView.verified).toBe(true);
    expect((await upload(ctx, user.body.token, selfie, "image/jpeg", "/me/selfie")).status).toBe(409);
    expect((await ctx.call(`/admin/selfies/${owner.address}`, authed(boss.body.token, "POST", { approved: true }))).status).toBe(404);
  });

  it("rejection lets the person send a new selfie", async () => {
    const ctx = setup();
    const { user } = await submitted(ctx);
    const boss = await tokenFor(ctx.call, admin);
    await ctx.call(`/admin/selfies/${owner.address}`, authed(boss.body.token, "POST", { approved: false, reason: "Foto borrosa" }));
    expect(((await (await ctx.call("/me", authed(user.body.token, "GET"))).json()) as any).profile.selfieStatus).toBe("rejected");
    const retry = new Uint8Array([255, 216, 255, 9, 9, 9]);
    expect((await upload(ctx, user.body.token, retry, "image/jpeg", "/me/selfie")).status).toBe(202);
    expect(ctx.bucket.objects.size).toBe(1);
  });

  it("replaces a pending selfie and validates the review body and size", async () => {
    const ctx = setup();
    const { user } = await submitted(ctx);
    const newer = new Uint8Array([255, 216, 255, 7, 7, 7]);
    await upload(ctx, user.body.token, newer, "image/jpeg", "/me/selfie");
    expect(ctx.bucket.objects.size).toBe(1);
    const boss = await tokenFor(ctx.call, admin);
    expect((await ctx.call(`/admin/selfies/${owner.address}`, authed(boss.body.token, "POST", { approved: "yes" }))).status).toBe(400);

    const big = await ctx.call("/me/selfie", {
      method: "PUT",
      body: newer,
      headers: { authorization: `Bearer ${user.body.token}`, "content-type": "image/jpeg", "content-length": String(MAX_SELFIE_BYTES + 1), "x-content-sha256": sha256(newer) },
    });
    expect(big.status).toBe(413);
    expect((await upload(ctx, user.body.token, selfie, "application/pdf", "/me/selfie")).status).toBe(415);
  });
});

describe("orphan purge", () => {
  it("removes unlinked files older than a day and keeps linked or recent ones", async () => {
    const ctx = setup();
    const { body } = await tokenFor(ctx.call);
    const keep = new Uint8Array([1, 1, 1]);
    const drop = new Uint8Array([2, 2, 2]);
    await upload(ctx, body.token, keep);
    await upload(ctx, body.token, drop);
    ctx.raw.prepare("UPDATE files SET linked = 1 WHERE hash = ?").run(sha256(keep));
    const removed = await purgeOrphanFiles(ctx.db, ctx.bucket as unknown as R2Bucket, Math.floor(Date.now() / 1000) + 2 * 86400);
    expect(removed).toBe(1);
    expect(ctx.bucket.objects.size).toBe(1);
    expect(await purgeOrphanFiles(ctx.db, ctx.bucket as unknown as R2Bucket, Math.floor(Date.now() / 1000))).toBe(0);
  });
});
