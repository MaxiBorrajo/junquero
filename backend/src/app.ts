import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import {
  listForOwner,
  listMine,
  presentApplication,
  presentForOwner,
  submitApplication,
  validateApplication,
  withdrawApplication,
} from "./applications";
import { buildChatKeyMessage, issueToken, parseLogin, TICKET_TTL_SECONDS, verifyLogin, verifyToken } from "./auth";
import { listChats, markRead, resolveChatAccess } from "./chatAccess";
import { recoverMessageAddress } from "viem";
import { queueNotification, registerToken, removeToken } from "./notifications";
import { isExpoToken } from "./push";
import { getPublished, listByOwner, listOpen, presentChanga, saveDraft, type ListFilters } from "./changas";
import { startBlock } from "./contracts";
import {
  fileHeaders,
  deleteFile,
  linkFiles,
  parseUpload,
  readFile,
  requireOwnedPublicFiles,
  storeFile,
} from "./files";
import { listPendingSelfies, markSelfiePending, pendingSelfieHash, reviewSelfie } from "./selfie";
import type { Env } from "./env";
import { allowed, clientKey } from "./guard";
import { readCursor } from "./indexer";
import { getProfile, presentOwnProfile, presentPublicProfile, upsertProfile, validateProfile } from "./profiles";
import { relay, type RelayPolicy } from "./relay";
import { createRelayChain, relayTargets } from "./relayChain";
import { validateSpec } from "./spec";
import { TtlCache } from "./ttlCache";

type AppEnv = { Bindings: Env; Variables: { address: string } };

const READ_CACHE_MS = 10_000;
const READ_CACHE_ENTRIES = 200;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const LIST_DEFAULT = 30;
const LIST_MAX = 50;
const MAX_BBOX_DEGREES = 2;
const OWN_CHANGAS_LIMIT = 100;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;

export const relayPolicy: RelayPolicy = {
  targets: relayTargets,
  maxGas: 3_000_000n,
  minDeadlineSeconds: 60,
  maxPerWindow: 30,
  windowSeconds: 3600,
};

export const app = new Hono<AppEnv>();
export const readCache = new TtlCache<unknown>(READ_CACHE_MS, READ_CACHE_ENTRIES);
const nowSeconds = () => Math.floor(Date.now() / 1000);

const limitBy = (pick: (env: Env) => Env["READ_LIMITER"]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!(await allowed(pick(c.env), clientKey(c.req.raw.headers)))) return c.json({ error: "too many requests" }, 429);
    await next();
  });

const readGuard = limitBy((env) => env.READ_LIMITER);

const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.env.AUTH_SECRET) return c.json({ error: "auth not configured" }, 503);
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const address = token ? await verifyToken(c.env.AUTH_SECRET, token, nowSeconds()) : null;
  if (!address) return c.json({ error: "unauthorized" }, 401);
  if (c.req.method !== "GET" && !(await allowed(c.env.WRITE_LIMITER, address))) {
    return c.json({ error: "too many requests" }, 429);
  }
  c.set("address", address);
  await next();
});

const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const admins = (c.env.ADMIN_ADDRESSES ?? "").toLowerCase().split(",").map((item) => item.trim());
  if (!admins.includes(c.get("address"))) return c.json({ error: "forbidden" }, 403);
  await next();
});

const stripPrefix = (hash: string) => (hash.startsWith("0x") ? hash.slice(2) : hash);

async function cachedRead(url: string, produce: () => Promise<unknown>): Promise<unknown> {
  const now = Date.now();
  const hit = readCache.get(url, now);
  if (hit !== undefined) return hit;
  const value = await produce();
  readCache.set(url, value, now);
  return value;
}

async function readJson(c: Context<AppEnv>): Promise<unknown | undefined> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

const parseLimit = (value: string | undefined, fallback: number, max: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

const optionalInt = (value: string | undefined): number | undefined | null => {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

app.use("/health", readGuard);
app.use("/events", readGuard);
app.use("/orders/*", readGuard);
app.use("/changas", readGuard);
app.use("/changas/*", readGuard);
app.use("/profiles/*", readGuard);
app.use("/chat/*", readGuard);
app.use("/files/*", limitBy((env) => env.FILE_LIMITER));
app.use("/auth/*", limitBy((env) => env.AUTH_LIMITER));
app.use("/me", requireAuth);
app.use("/me/*", requireAuth);
app.use("/admin/*", requireAuth, requireAdmin);

app.get("/health", async (c) => c.json({ ok: true, lastIndexedBlock: await readCursor(c.env.DB, startBlock) }));

app.post("/relay", limitBy((env) => env.RELAY_LIMITER), async (c) => {
  const body = await readJson(c);
  if (body === undefined) return c.json({ error: "invalid json" }, 400);
  if (!c.env.RELAYER_KEY) return c.json({ error: "relayer not configured" }, 503);
  const chain = createRelayChain(c.env.RPC_URL, c.env.RELAYER_KEY);
  const result = await relay(c.env.DB, chain, relayPolicy, body, nowSeconds());
  if (!result.ok) return c.json({ error: result.error }, result.status as 400 | 403 | 422 | 429 | 503);
  return c.json({ txHash: result.txHash });
});

app.post("/auth/login", async (c) => {
  if (!c.env.AUTH_SECRET) return c.json({ error: "auth not configured" }, 503);
  const request = parseLogin(await readJson(c));
  if (!request) return c.json({ error: "invalid login" }, 400);
  const now = nowSeconds();
  const address = await verifyLogin(request, now);
  if (!address) return c.json({ error: "invalid signature or expired message" }, 401);
  const { token, expiresAt } = await issueToken(c.env.AUTH_SECRET, address, now);
  return c.json({ token, expiresAt, address });
});

app.get("/me", async (c) => {
  const row = await getProfile(c.env.DB, c.get("address"));
  return c.json({ address: c.get("address"), profile: row ? presentOwnProfile(row) : null });
});

app.put("/me/profile", async (c) => {
  const body = await readJson(c);
  if (body === undefined) return c.json({ error: "invalid json" }, 400);
  const result = validateProfile(body);
  if (!result.ok) return c.json({ error: result.error }, 400);
  if (result.profile.photo) {
    const image = await c.env.DB.prepare("SELECT mime FROM files WHERE owner = ? AND hash = ? AND kind = 'public'")
      .bind(c.get("address"), result.profile.photo)
      .first<{ mime: string }>();
    if (!image?.mime.startsWith("image/")) return c.json({ error: "photo must be an uploaded image" }, 400);
    await linkFiles(c.env.DB, c.get("address"), [result.profile.photo]);
  }
  await upsertProfile(c.env.DB, c.get("address"), result.profile, nowSeconds());
  const row = await getProfile(c.env.DB, c.get("address"));
  return c.json({ profile: presentOwnProfile(row!) });
});

app.get("/profiles/:address", async (c) => {
  const address = c.req.param("address");
  if (!ADDRESS.test(address)) return c.json({ error: "invalid address" }, 400);
  const row = await getProfile(c.env.DB, address.toLowerCase());
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ profile: presentPublicProfile(row) });
});

app.post("/me/changas", async (c) => {
  const body = await readJson(c);
  if (body === undefined) return c.json({ error: "invalid json" }, 400);
  const now = nowSeconds();
  const result = validateSpec(body, now);
  if (!result.ok) return c.json({ error: result.error }, 400);
  const attachments = result.spec.attachments.map((item) => ({ ...item, hash: stripPrefix(item.hash) }));
  const missing = await requireOwnedPublicFiles(c.env.DB, c.get("address"), attachments);
  if (missing) return c.json({ error: missing }, 400);
  const saved = await saveDraft(c.env.DB, c.get("address"), result.spec, result.canonical, result.hash, now);
  if (!saved.ok) return c.json({ error: saved.error }, 429);
  await linkFiles(c.env.DB, c.get("address"), attachments.map((item) => item.hash));
  return c.json({ specHash: result.hash, canonical: result.canonical }, saved.created ? 201 : 200);
});

app.get("/me/changas", async (c) => {
  const rows = await listByOwner(c.env.DB, c.get("address"), OWN_CHANGAS_LIMIT);
  return c.json({ changas: rows.map(presentChanga) });
});

app.put("/me/files", async (c) => {
  const upload = parseUpload(c.req.raw.headers, "public");
  if (!upload.ok) return c.json({ error: upload.error }, upload.status);
  const owner = c.get("address");
  const outcome = await storeFile(c.env.DB, c.env.FILES, owner, "public", upload.value, c.req.raw.body, nowSeconds());
  if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
  return c.json({ hash: upload.value.hash, url: `/files/${owner}/${upload.value.hash}` }, outcome.created ? 201 : 200);
});

app.put("/me/selfie", async (c) => {
  const upload = parseUpload(c.req.raw.headers, "selfie");
  if (!upload.ok) return c.json({ error: upload.error }, upload.status);
  const owner = c.get("address");
  const profile = await getProfile(c.env.DB, owner);
  if (!profile) return c.json({ error: "create your profile first" }, 409);
  if (profile.selfie_status === "approved") return c.json({ error: "selfie already verified" }, 409);

  const previous = await pendingSelfieHash(c.env.DB, owner);
  const now = nowSeconds();
  const outcome = await storeFile(c.env.DB, c.env.FILES, owner, "selfie", upload.value, c.req.raw.body, now, true);
  if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
  if (previous && previous.hash !== upload.value.hash) await deleteFile(c.env.DB, c.env.FILES, owner, previous.hash);
  await markSelfiePending(c.env.DB, owner, now);
  return c.json({ selfieStatus: "pending" }, 202);
});

app.get("/me/selfie", async (c) => {
  const owner = c.get("address");
  const stored = await pendingSelfieHash(c.env.DB, owner);
  const file = stored ? await readFile(c.env.DB, c.env.FILES, owner, stored.hash, "selfie") : null;
  if (!file) return c.json({ error: "not found" }, 404);
  return new Response(file.object.body, { headers: fileHeaders(file.mime, file.size, false) });
});

app.get("/admin/selfies", async (c) => c.json({ selfies: await listPendingSelfies(c.env.DB, 50) }));

app.get("/admin/selfies/:address", async (c) => {
  const address = c.req.param("address").toLowerCase();
  const stored = ADDRESS.test(address) ? await pendingSelfieHash(c.env.DB, address) : null;
  const file = stored ? await readFile(c.env.DB, c.env.FILES, address, stored.hash, "selfie") : null;
  if (!file) return c.json({ error: "not found" }, 404);
  return new Response(file.object.body, { headers: fileHeaders(file.mime, file.size, false) });
});

app.post("/admin/selfies/:address", async (c) => {
  const address = c.req.param("address").toLowerCase();
  const body = (await readJson(c)) as { approved?: unknown } | undefined;
  if (!ADDRESS.test(address) || typeof body?.approved !== "boolean") return c.json({ error: "approved must be true or false" }, 400);
  const reviewed = await reviewSelfie(c.env.DB, address, body.approved, nowSeconds());
  if (!reviewed) return c.json({ error: "no pending selfie" }, 404);
  const stored = await pendingSelfieHash(c.env.DB, address);
  if (stored) await deleteFile(c.env.DB, c.env.FILES, address, stored.hash);
  await queueNotification(c.env.DB, address, body.approved ? "selfie_approved" : "selfie_rejected", "selfie").run();
  return c.json({ selfieStatus: body.approved ? "approved" : "rejected" });
});

app.get("/files/:owner/:hash", async (c) => {
  const owner = c.req.param("owner").toLowerCase();
  const hash = c.req.param("hash").toLowerCase();
  if (!ADDRESS.test(owner) || !/^[0-9a-f]{64}$/.test(hash)) return c.json({ error: "invalid file" }, 400);
  const file = await readFile(c.env.DB, c.env.FILES, owner, hash, "public");
  if (!file) return c.json({ error: "not found" }, 404);
  return new Response(file.object.body, { headers: fileHeaders(file.mime, file.size, true) });
});

app.put("/me/push-token", async (c) => {
  const body = (await readJson(c)) as { token?: unknown; platform?: unknown } | undefined;
  if (!isExpoToken(body?.token)) return c.json({ error: "token must be an Expo push token" }, 400);
  const platform = body?.platform === "ios" ? "ios" : "android";
  await registerToken(c.env.DB, c.get("address"), body!.token as string, platform, nowSeconds());
  return c.json({ ok: true });
});

app.delete("/me/push-token", async (c) => {
  const body = (await readJson(c)) as { token?: unknown } | undefined;
  if (!isExpoToken(body?.token)) return c.json({ error: "token must be an Expo push token" }, 400);
  const removed = await removeToken(c.env.DB, c.get("address"), body!.token as string);
  return removed ? c.json({ ok: true }) : c.json({ error: "token not found" }, 404);
});

const CHAT_PAGE = 100;

type ChatContext = Context<AppEnv>;

async function chatFor(c: ChatContext, rawId: string) {
  const applicationId = parseChangaId(rawId);
  if (applicationId === null) return { response: c.json({ error: "invalid chat id" }, 400) } as const;
  const result = await resolveChatAccess(c.env.DB, applicationId, c.get("address"));
  if (!result.ok) return { response: c.json({ error: result.error }, result.status) } as const;
  return { applicationId, access: result.access } as const;
}

const callRoom = (c: ChatContext, applicationId: number, path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set("x-address", c.get("address"));
  headers.set("x-application-id", String(applicationId));
  const stub = c.env.CHAT.get(c.env.CHAT.idFromName(String(applicationId)));
  return stub.fetch(new Request(`https://chat${path}`, { ...init, headers }));
};

app.put("/me/chat-key", async (c) => {
  const body = (await readJson(c)) as { publicKey?: unknown; signature?: unknown } | undefined;
  const key = typeof body?.publicKey === "string" ? body.publicKey.toLowerCase() : "";
  if (!/^[0-9a-f]{64}$/.test(key) || typeof body?.signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(body.signature)) {
    return c.json({ error: "publicKey (64 hex characters) and signature are required" }, 400);
  }
  let signer: string;
  try {
    signer = await recoverMessageAddress({
      message: buildChatKeyMessage(c.get("address"), key),
      signature: body.signature as `0x${string}`,
    });
  } catch {
    return c.json({ error: "invalid signature" }, 400);
  }
  if (signer.toLowerCase() !== c.get("address")) return c.json({ error: "signature does not match your wallet" }, 400);
  await c.env.DB.prepare(
    `INSERT INTO chat_keys (address, public_key, created_at) VALUES (?, ?, ?)
     ON CONFLICT(address) DO UPDATE SET public_key = excluded.public_key, created_at = excluded.created_at`,
  )
    .bind(c.get("address"), key, nowSeconds())
    .run();
  return c.json({ publicKey: key });
});

app.get("/me/chat-keys/:address", async (c) => {
  const address = c.req.param("address").toLowerCase();
  if (!ADDRESS.test(address)) return c.json({ error: "invalid address" }, 400);
  const row = await c.env.DB.prepare("SELECT public_key FROM chat_keys WHERE address = ?").bind(address).first<{ public_key: string }>();
  return row ? c.json({ address, publicKey: row.public_key }) : c.json({ error: "no chat key" }, 404);
});

app.get("/me/chats", async (c) => c.json({ chats: await listChats(c.env.DB, c.get("address"), OWN_CHANGAS_LIMIT) }));

app.get("/me/chats/:id/messages", async (c) => {
  const chat = await chatFor(c, c.req.param("id"));
  if ("response" in chat) return chat.response;
  const params = new URLSearchParams({ after: c.req.query("after") ?? "0", limit: c.req.query("limit") ?? String(CHAT_PAGE) });
  const room = await callRoom(c, chat.applicationId, `/history?${params}`);
  const data = (await room.json()) as object;
  return c.json({ ...data, writable: chat.access.writable }, room.status as 200 | 400);
});

app.post("/me/chats/:id/messages", async (c) => {
  const chat = await chatFor(c, c.req.param("id"));
  if ("response" in chat) return chat.response;
  const body = await readJson(c);
  if (body === undefined) return c.json({ error: "invalid json" }, 400);
  const room = await callRoom(c, chat.applicationId, "/send", { method: "POST", body: JSON.stringify(body) });
  return c.json((await room.json()) as object, room.status as 200 | 201 | 400 | 403 | 429);
});

app.post("/me/chats/:id/read", async (c) => {
  const chat = await chatFor(c, c.req.param("id"));
  if ("response" in chat) return chat.response;
  const body = (await readJson(c)) as { seq?: unknown } | undefined;
  if (!Number.isSafeInteger(body?.seq) || (body!.seq as number) < 0) return c.json({ error: "seq must be a non negative integer" }, 400);
  await markRead(c.env.DB, chat.applicationId, c.get("address"), body!.seq as number);
  return c.json({ ok: true });
});

app.post("/me/chats/:id/ticket", async (c) => {
  const chat = await chatFor(c, c.req.param("id"));
  if ("response" in chat) return chat.response;
  const { token, expiresAt } = await issueToken(c.env.AUTH_SECRET, c.get("address"), nowSeconds(), TICKET_TTL_SECONDS);
  return c.json({ ticket: token, expiresAt });
});

app.get("/chat/:id/ws", async (c) => {
  if (c.req.header("upgrade") !== "websocket") return c.json({ error: "expected a websocket" }, 426);
  if (!c.env.AUTH_SECRET) return c.json({ error: "auth not configured" }, 503);
  const address = await verifyToken(c.env.AUTH_SECRET, c.req.query("ticket") ?? "", nowSeconds());
  if (!address) return c.json({ error: "unauthorized" }, 401);
  const applicationId = parseChangaId(c.req.param("id"));
  if (applicationId === null) return c.json({ error: "invalid chat id" }, 400);
  const access = await resolveChatAccess(c.env.DB, applicationId, address);
  if (!access.ok) return c.json({ error: access.error }, access.status);
  const stub = c.env.CHAT.get(c.env.CHAT.idFromName(String(applicationId)));
  return stub.fetch(
    new Request("https://chat/ws", {
      headers: { upgrade: "websocket", "x-address": address, "x-application-id": String(applicationId) },
    }),
  );
});

const parseChangaId = (value: string): number | null => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

app.put("/me/applications/:changaId", async (c) => {
  const changaId = parseChangaId(c.req.param("changaId"));
  if (changaId === null) return c.json({ error: "invalid changa id" }, 400);
  const body = await readJson(c);
  if (body === undefined) return c.json({ error: "invalid json" }, 400);
  const parsed = validateApplication(body);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const attached = parsed.value.attachments.map((item) => ({ ...item, hash: stripPrefix(item.hash) }));
  const missing = await requireOwnedPublicFiles(c.env.DB, c.get("address"), attached);
  if (missing) return c.json({ error: missing }, 400);
  const outcome = await submitApplication(
    c.env.DB,
    changaId,
    c.get("address"),
    parsed.value,
    nowSeconds(),
    c.env.REQUIRE_VERIFIED_APPLICANT === "true",
  );
  if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
  await linkFiles(c.env.DB, c.get("address"), attached.map((item) => item.hash));
  if (outcome.created) {
    const changa = await c.env.DB.prepare("SELECT owner FROM changas WHERE id = ?").bind(changaId).first<{ owner: string }>();
    if (changa) await queueNotification(c.env.DB, changa.owner, "application_new", String(changaId)).run();
  }
  return c.json({ application: presentApplication(outcome.row) }, outcome.created ? 201 : 200);
});

app.delete("/me/applications/:changaId", async (c) => {
  const changaId = parseChangaId(c.req.param("changaId"));
  if (changaId === null) return c.json({ error: "invalid changa id" }, 400);
  const withdrawn = await withdrawApplication(c.env.DB, changaId, c.get("address"), nowSeconds());
  return withdrawn ? c.json({ ok: true }) : c.json({ error: "no active application" }, 404);
});

app.get("/me/applications", async (c) => c.json({ applications: await listMine(c.env.DB, c.get("address"), OWN_CHANGAS_LIMIT) }));

app.get("/me/changas/:changaId/applications", async (c) => {
  const changaId = parseChangaId(c.req.param("changaId"));
  if (changaId === null) return c.json({ error: "invalid changa id" }, 400);
  const result = await listForOwner(c.env.DB, changaId, c.get("address"));
  if (result.status === 404) return c.json({ error: "changa not found" }, 404);
  if (result.status === 403) return c.json({ error: "only the owner can see the applications" }, 403);
  return c.json({ applications: result.rows.map(presentForOwner) });
});

app.get("/changas", async (c) => {
  const query = c.req.query();
  const remote = query.modality === "remote";
  const filters: ListFilters = { remote, limit: parseLimit(query.limit, LIST_DEFAULT, LIST_MAX) };

  if (!remote) {
    const [minLat, maxLat, minLng, maxLng] = [query.minLat, query.maxLat, query.minLng, query.maxLng].map(Number);
    const valid = [minLat, maxLat, minLng, maxLng].every(Number.isFinite);
    if (!valid || minLat > maxLat || minLng > maxLng) return c.json({ error: "bbox is required: minLat, maxLat, minLng, maxLng" }, 400);
    if (maxLat - minLat > MAX_BBOX_DEGREES || maxLng - minLng > MAX_BBOX_DEGREES) return c.json({ error: "bbox is too large" }, 400);
    filters.bbox = { minLat, maxLat, minLng, maxLng };
  }

  const category = optionalInt(query.category);
  const minAmount = optionalInt(query.minAmount);
  const maxAmount = optionalInt(query.maxAmount);
  const before = optionalInt(query.before);
  if ([category, minAmount, maxAmount, before].includes(null)) return c.json({ error: "invalid filter" }, 400);
  if (category !== undefined) filters.category = category as number;
  if (minAmount !== undefined) filters.minAmountMicro = minAmount as number;
  if (maxAmount !== undefined) filters.maxAmountMicro = maxAmount as number;
  if (before !== undefined) filters.before = before as number;

  const body = await cachedRead(c.req.url, async () => ({ changas: (await listOpen(c.env.DB, filters)).map(presentChanga) }));
  return c.json(body);
});

app.get("/changas/:specHash", async (c) => {
  const specHash = c.req.param("specHash").toLowerCase();
  if (!HEX32.test(specHash)) return c.json({ error: "invalid hash" }, 400);
  const rows = await getPublished(c.env.DB, specHash);
  if (!rows.length) return c.json({ error: "not found" }, 404);
  return c.json({ changas: rows.map(presentChanga) });
});

interface EventRecord {
  args: string;
  tx_hash: string;
  log_index: number;
  [key: string]: unknown;
}

const presentEvent = (row: EventRecord) => ({ ...row, id: `${row.tx_hash}:${row.log_index}`, args: JSON.parse(row.args) });

app.get("/orders/:id/timeline", async (c) => {
  const orderId = Number(c.req.param("id"));
  if (!Number.isInteger(orderId) || orderId < 0) return c.json({ error: "invalid order id" }, 400);
  const body = await cachedRead(c.req.url, async () => {
    const { results } = await c.env.DB.prepare("SELECT * FROM events WHERE order_id = ? ORDER BY block_number, log_index")
      .bind(orderId)
      .all<EventRecord>();
    return { orderId, events: results.map(presentEvent) };
  });
  return c.json(body);
});

app.get("/events", async (c) => {
  const filters: string[] = [];
  const values: (string | number)[] = [];
  for (const [column, value] of Object.entries({ contract: c.req.query("contract"), name: c.req.query("name") })) {
    if (value) {
      filters.push(`${column} = ?`);
      values.push(value);
    }
  }
  const before = Number(c.req.query("beforeBlock"));
  if (Number.isInteger(before) && before > 0) {
    filters.push("block_number < ?");
    values.push(before);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const body = await cachedRead(c.req.url, async () => {
    const { results } = await c.env.DB.prepare(`SELECT * FROM events ${where} ORDER BY block_number DESC, log_index DESC LIMIT ?`)
      .bind(...values, parseLimit(c.req.query("limit"), DEFAULT_LIMIT, MAX_LIMIT))
      .all<EventRecord>();
    return { events: results.map(presentEvent) };
  });
  return c.json(body);
});
