import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
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
import { createMarkChain } from "./markChain";
import { enqueueMark, runMarks } from "./marks";
import { blockUser, dismissApplication, listBlocks, unblockUser } from "./blocks";
import { listChats, markRead, resolveChatAccess } from "./chatAccess";
import { isHex, recoverMessageAddress, type Hex } from "viem";
import { queueNotification, registerToken, removeToken } from "./notifications";
import { isExpoToken } from "./push";
import { getPublished, listByOwner, listOpen, presentChanga, saveDraft, type ListFilters } from "./changas";
import { startBlock } from "./contracts";
import { activitySummary, listNotifications } from "./activity";
import { canDownload, listEvidence, parseEvidence, parseEvidenceBatch, registerEvidence, registerEvidenceBatch, resolveEvidenceAccess, shareKey } from "./evidence";
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
import { getProfile, presentOwnProfile, presentPublicProfile, profileStats, upsertProfile, validateProfile } from "./profiles";
import { emergencyCases, listChangas as adminChangas, listLog, listUsers, logAction, parseReason, setHidden, summary as adminSummary } from "./admin";
import { casesFor } from "./cases";
import { cancelRelease, parseRelease, readRelease, submitRelease } from "./releases";
import { createReport, listReports, resolveReport } from "./reports";
import { accept as acceptAgreement, cancel as cancelAgreement, listMine as listAgreements, presentAgreement, propose, validateProposal } from "./agreements";
import { summaryFor } from "./summary";
import { notifyChat } from "./chatNotify";
import { listChatEvents, recordAgreementEvent, recordApplicationEvent, recordOrderEvent } from "./chatEvents";
import { createAgreementChain } from "./agreementChain";
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
// Datos que cambian poco y se piden mucho (el historial de un perfil): un minuto de caché.
const SLOW_CACHE_MS = 60_000;
const BBOX_GRID = 0.05;
export const slowCache = new TtlCache<unknown>(SLOW_CACHE_MS, READ_CACHE_ENTRIES);
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
  // Escrituras y lecturas tienen su tope por persona (las lecturas antes no tenían ninguno).
  const limiter = c.req.method === "GET" ? c.env.READ_LIMITER : c.env.WRITE_LIMITER;
  if (!(await allowed(limiter, `${c.req.method === "GET" ? "read" : "write"}:${address}`))) {
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

async function cachedSlow<T>(key: string, produce: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = slowCache.get(key, now);
  if (hit !== undefined) return hit as T;
  const value = await produce();
  slowCache.set(key, value, now);
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
const adminCors = cors({
  origin: (origin, c) => ((c.env as Env).ADMIN_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean).includes(origin) ? origin : null,
  allowHeaders: ["authorization", "content-type"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  maxAge: 3600,
});
app.use("/admin/*", adminCors);
app.use("/auth/*", adminCors);
app.use("/health", adminCors);
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
  return c.json({ profile: { ...presentPublicProfile(row), stats: await cachedSlow(`stats:${address.toLowerCase()}`, () => profileStats(c.env.DB, address.toLowerCase())) } });
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
  const body = (await readJson(c)) as { approved?: unknown; reason?: unknown } | undefined;
  if (!ADDRESS.test(address) || typeof body?.approved !== "boolean") return c.json({ error: "approved must be true or false" }, 400);
  const parsed = body.approved && body.reason === undefined ? ({ ok: true, reason: "approved" } as const) : parseReason(body.reason);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const reviewed = await reviewSelfie(c.env.DB, address, body.approved, nowSeconds());
  if (!reviewed) return c.json({ error: "no pending selfie" }, 404);
  const stored = await pendingSelfieHash(c.env.DB, address);
  if (stored) await deleteFile(c.env.DB, c.env.FILES, address, stored.hash);
  await queueNotification(c.env.DB, address, body.approved ? "selfie_approved" : "selfie_rejected", "selfie").run();
  await logAction(c.env.DB, c.get("address"), body.approved ? "selfie_approved" : "selfie_rejected", address, parsed.reason, nowSeconds()).run();
  return c.json({ selfieStatus: body.approved ? "approved" : "rejected" });
});

app.get("/admin/summary", async (c) => c.json(await cachedRead(c.req.url, () => adminSummary(c.env.DB, nowSeconds()))));

app.get("/admin/changas", async (c) => {
  const query = c.req.query();
  const before = optionalInt(query.before);
  if (before === null) return c.json({ error: "invalid filter" }, 400);
  return c.json({ changas: await adminChangas(c.env.DB, { status: query.status || undefined, before, limit: parseLimit(query.limit, 50, 100) }) });
});

app.post("/admin/changas/:id/hidden", async (c) => {
  const id = parseChangaId(c.req.param("id"));
  const body = (await readJson(c)) as { hidden?: unknown; reason?: unknown } | undefined;
  if (id === null || typeof body?.hidden !== "boolean") return c.json({ error: "hidden must be true or false" }, 400);
  const parsed = parseReason(body.reason);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  if (!(await setHidden(c.env.DB, id, body.hidden))) return c.json({ error: "changa not found" }, 404);
  readCache.clear();
  await logAction(c.env.DB, c.get("address"), body.hidden ? "changa_hidden" : "changa_restored", String(id), parsed.reason, nowSeconds()).run();
  return c.json({ hidden: body.hidden });
});

app.get("/admin/cases", async (c) => c.json({ cases: await emergencyCases(c.env.DB, parseLimit(c.req.query("limit"), 50, 100)) }));

app.post("/admin/cases/:id/emergency", async (c) => {
  const id = parseChangaId(c.req.param("id"));
  const body = (await readJson(c)) as { payeeWins?: unknown; reason?: unknown; txHash?: unknown } | undefined;
  if (id === null || typeof body?.payeeWins !== "boolean" || typeof body.txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash)) {
    return c.json({ error: "payeeWins, reason and txHash are required" }, 400);
  }
  const parsed = parseReason(body.reason);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  await logAction(c.env.DB, c.get("address"), "emergency_resolved", `case:${id}`, `${body.payeeWins ? "a favor de quien hizo la changa" : "a favor de quien publicó"}: ${parsed.reason} (${body.txHash})`, nowSeconds()).run();
  return c.json({ ok: true });
});

app.get("/admin/users", async (c) => {
  const query = c.req.query();
  return c.json({ users: await listUsers(c.env.DB, { query: query.q?.slice(0, 40) || undefined, before: query.before?.toLowerCase(), limit: parseLimit(query.limit, 50, 100) }) });
});

app.get("/admin/log", async (c) => {
  const before = optionalInt(c.req.query("before"));
  if (before === null) return c.json({ error: "invalid filter" }, 400);
  return c.json({ log: await listLog(c.env.DB, parseLimit(c.req.query("limit"), 50, 100), before) });
});

app.get("/files/:owner/:hash", async (c) => {
  const owner = c.req.param("owner").toLowerCase();
  const hash = c.req.param("hash").toLowerCase();
  if (!ADDRESS.test(owner) || !/^[0-9a-f]{64}$/.test(hash)) return c.json({ error: "invalid file" }, 400);
  // Los archivos públicos no cambian nunca (el nombre es su hash): se sirven desde la caché del borde y solo la primera vez
  // se lee la base y el almacenamiento.
  const edge = typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
  const cached = edge ? await edge.match(c.req.raw).catch(() => undefined) : undefined;
  if (cached) return cached;
  const file = await readFile(c.env.DB, c.env.FILES, owner, hash, "public");
  if (!file) return c.json({ error: "not found" }, 404);
  const response = new Response(file.object.body, { headers: fileHeaders(file.mime, file.size, true) });
  if (edge) {
    try {
      c.executionCtx.waitUntil(edge.put(c.req.raw, response.clone()).catch(() => undefined));
    } catch {
      // sin contexto de ejecución (pruebas)
    }
  }
  return response;
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

const parseOrderId = (value: string): number | null => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

async function evidenceFor(c: Context<AppEnv>, rawOrderId: string) {
  const orderId = parseOrderId(rawOrderId);
  if (orderId === null) return { response: c.json({ error: "invalid order id" }, 400) } as const;
  const result = await resolveEvidenceAccess(c.env.DB, orderId, c.get("address"));
  if (!result.ok) return { response: c.json({ error: result.error }, result.status) } as const;
  return { orderId, access: result.access } as const;
}

app.put("/me/evidence-files", async (c) => {
  const upload = parseUpload(c.req.raw.headers, "evidence");
  if (!upload.ok) return c.json({ error: upload.error }, upload.status);
  const outcome = await storeFile(c.env.DB, c.env.FILES, c.get("address"), "evidence", upload.value, c.req.raw.body, nowSeconds());
  if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
  return c.json({ hash: upload.value.hash }, outcome.created ? 201 : 200);
});

app.post("/me/orders/:orderId/evidence", async (c) => {
  const found = await evidenceFor(c, c.req.param("orderId"));
  if ("response" in found) return found.response;
  const parsed = parseEvidence(await readJson(c));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const outcome = await registerEvidence(c.env.DB, found.orderId, c.get("address"), parsed.value, found.access, nowSeconds());
  if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
  if (outcome.created) await record(c, recordOrderEvent(c.env.DB, "evidence", found.orderId, c.get("address"), parsed.value.hash, nowSeconds(), { count: 1 }));
  return c.json({ hash: parsed.value.hash }, outcome.created ? 201 : 200);
});

app.post("/me/orders/:orderId/evidence/batch", async (c) => {
  const found = await evidenceFor(c, c.req.param("orderId"));
  if ("response" in found) return found.response;
  const parsed = parseEvidenceBatch(await readJson(c));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const outcome = await registerEvidenceBatch(c.env.DB, found.orderId, c.get("address"), parsed.value, found.access, nowSeconds());
  if (!outcome.ok) return c.json({ error: outcome.error, index: outcome.index }, outcome.status);
  if (outcome.hashes.length > 0) await record(c, recordOrderEvent(c.env.DB, "evidence", found.orderId, c.get("address"), outcome.hashes[0]!, nowSeconds(), { count: outcome.hashes.length }));
  return c.json({ hashes: outcome.hashes }, 201);
});

app.get("/me/orders/:orderId/evidence", async (c) => {
  const found = await evidenceFor(c, c.req.param("orderId"));
  if ("response" in found) return found.response;
  return c.json({ role: found.access.role, evidence: await listEvidence(c.env.DB, found.orderId, c.get("address"), found.access) });
});

app.get("/me/orders/:orderId/evidence/:hash", async (c) => {
  const found = await evidenceFor(c, c.req.param("orderId"));
  if ("response" in found) return found.response;
  const hash = c.req.param("hash").toLowerCase();
  const item = /^[0-9a-f]{64}$/.test(hash) ? await canDownload(c.env.DB, found.orderId, hash, c.get("address"), found.access) : null;
  const file = item ? await readFile(c.env.DB, c.env.FILES, item.uploader, hash, "evidence") : null;
  if (!file) return c.json({ error: "not found" }, 404);
  return new Response(file.object.body, { headers: fileHeaders("application/octet-stream", file.size, false) });
});

app.put("/me/orders/:orderId/evidence/:hash/keys", async (c) => {
  const found = await evidenceFor(c, c.req.param("orderId"));
  if ("response" in found) return found.response;
  const hash = c.req.param("hash").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) return c.json({ error: "invalid hash" }, 400);
  const outcome = await shareKey(c.env.DB, found.orderId, hash, c.get("address"), found.access, await readJson(c), nowSeconds());
  return outcome.ok ? c.json({ ok: true }) : c.json({ error: outcome.error }, outcome.status);
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

// Anota un hecho en el historial del chat y avisa a los chats abiertos para que se actualicen al instante.
async function record(c: Context<AppEnv>, statement: D1PreparedStatement): Promise<void> {
  const { results } = await statement.all<{ application_id: number }>();
  if (results.length === 0) return;
  try {
    c.executionCtx.waitUntil(notifyChat(c.env, results.map((row) => row.application_id)));
  } catch {
    // sin contexto de ejecución (pruebas): el celular se pone al día solo
  }
}

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

app.get("/me/chats/:id/events", async (c) => {
  const chat = await chatFor(c, c.req.param("id"));
  if ("response" in chat) return chat.response;
  return c.json({ events: await listChatEvents(c.env.DB, chat.applicationId) });
});

app.get("/me/chats", async (c) => c.json({ chats: await listChats(c.env.DB, c.get("address"), OWN_CHANGAS_LIMIT) }));

app.get("/me/chats/:id/messages", async (c) => {
  const chat = await chatFor(c, c.req.param("id"));
  if ("response" in chat) return chat.response;
  const params = new URLSearchParams({ after: c.req.query("after") ?? "0", limit: c.req.query("limit") ?? String(CHAT_PAGE) });
  const room = await callRoom(c, chat.applicationId, `/history?${params}`);
  const data = (await room.json()) as object;
  const { writable, role, waitingForOwner, contactsAllowed, applicationMessage, changaId, specHash } = chat.access;
  return c.json({ ...data, writable, role, waitingForOwner, contactsAllowed, applicationMessage, changaId, specHash }, room.status as 200 | 400);
});

app.post("/me/chats/:id/messages", async (c) => {
  const chat = await chatFor(c, c.req.param("id"));
  if ("response" in chat) return chat.response;
  const body = await readJson(c);
  if (body === undefined) return c.json({ error: "invalid json" }, 400);
  const room = await callRoom(c, chat.applicationId, "/send", { method: "POST", body: JSON.stringify(body) });
  return c.json((await room.json()) as object, room.status as 200 | 201 | 400 | 403 | 429);
});

// Adjuntos del chat: los bytes llegan ya cifrados desde el celular; el servidor solo guarda un objeto opaco.
app.put("/me/chats/:id/files", async (c) => {
  const chat = await chatFor(c, c.req.param("id"));
  if ("response" in chat) return chat.response;
  if (!chat.access.canSend) return c.json({ error: "chat is not writable" }, 403);
  const upload = parseUpload(c.req.raw.headers, "chat");
  if (!upload.ok) return c.json({ error: upload.error }, upload.status);
  const outcome = await storeFile(c.env.DB, c.env.FILES, c.get("address"), "chat", upload.value, c.req.raw.body, nowSeconds(), true);
  if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
  return c.json({ hash: upload.value.hash }, outcome.created ? 201 : 200);
});

app.get("/me/chats/:id/files/:hash", async (c) => {
  const chat = await chatFor(c, c.req.param("id"));
  if ("response" in chat) return chat.response;
  const hash = c.req.param("hash").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) return c.json({ error: "invalid file" }, 400);
  const row = await c.env.DB
    .prepare("SELECT owner FROM files WHERE hash = ? AND kind = 'chat' AND owner IN (?, ?) LIMIT 1")
    .bind(hash, chat.access.owner, chat.access.applicant)
    .first<{ owner: string }>();
  const file = row ? await readFile(c.env.DB, c.env.FILES, row.owner, hash, "chat") : null;
  if (!file) return c.json({ error: "not found" }, 404);
  return new Response(file.object.body, { headers: fileHeaders(file.mime, file.size, false) });
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
  if (outcome.reactivated) await record(c, recordApplicationEvent(c.env.DB, "applied", outcome.row.id, c.get("address"), nowSeconds()));
  if (outcome.created) {
    const changa = await c.env.DB.prepare("SELECT owner FROM changas WHERE id = ?").bind(changaId).first<{ owner: string }>();
    if (changa) await queueNotification(c.env.DB, changa.owner, "application_new", String(changaId)).run();
    // El contrato tiene que saber que hubo una postulación: cancelar la changa deja de ser gratis.
    await enqueueMark(c.env.DB, changaId).run();
    if (c.env.RELAYER_KEY) {
      try {
        c.executionCtx.waitUntil(runMarks(c.env.DB, createMarkChain(c.env.RPC_URL, c.env.RELAYER_KEY as Hex), nowSeconds()).catch((error) => console.error("mark failed", error)));
      } catch {
        // sin contexto de ejecución (pruebas): lo retoma el reloj
      }
    }
  }
  return c.json({ application: presentApplication(outcome.row) }, outcome.created ? 201 : 200);
});

// Borra un borrador que nunca llegó a publicarse (por ejemplo si se canceló una firma). Una changa publicada no se toca.
app.delete("/me/drafts/:specHash", async (c) => {
  const specHash = c.req.param("specHash").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(specHash)) return c.json({ error: "invalid spec hash" }, 400);
  const result = await c.env.DB.prepare("DELETE FROM changas WHERE owner = ? AND spec_hash = ? AND order_id IS NULL").bind(c.get("address"), specHash).run();
  return (result.meta?.changes ?? 0) > 0 ? c.json({ ok: true }) : c.json({ error: "draft not found" }, 404);
});

app.delete("/me/applications/:changaId", async (c) => {
  const changaId = parseChangaId(c.req.param("changaId"));
  if (changaId === null) return c.json({ error: "invalid changa id" }, 400);
  const active = await c.env.DB.prepare("SELECT id FROM applications WHERE changa_id = ? AND applicant = ? AND status = 'active'").bind(changaId, c.get("address")).first<{ id: number }>();
  const withdrawn = await withdrawApplication(c.env.DB, changaId, c.get("address"), nowSeconds());
  if (withdrawn && active) await record(c, recordApplicationEvent(c.env.DB, "withdrawn", active.id, c.get("address"), nowSeconds()));
  return withdrawn ? c.json({ ok: true }) : c.json({ error: "no active application" }, 404);
});

app.post("/me/applications/:id/dismiss", async (c) => {
  const id = parseChangaId(c.req.param("id"));
  if (id === null) return c.json({ error: "invalid application id" }, 400);
  const body = (await readJson(c)) as { block?: unknown } | undefined;
  if (body === undefined) return c.json({ error: "invalid json" }, 400);
  const result = await dismissApplication(c.env.DB, c.get("address"), id, nowSeconds());
  if (!result.ok) return c.json({ error: result.error }, result.status);
  // Si además se bloquea, el chat solo dice que la descartaron: no se revela el bloqueo.
  await record(c, recordApplicationEvent(c.env.DB, "dismissed", id, c.get("address"), nowSeconds()));
  if (body.block === true) {
    const blocked = await blockUser(c.env.DB, c.get("address"), result.applicant, nowSeconds());
    if (!blocked.ok) return c.json({ error: blocked.error }, blocked.status);
  }
  return c.json({ ok: true, blocked: body.block === true });
});

app.get("/me/blocks", async (c) => c.json({ blocks: await listBlocks(c.env.DB, c.get("address")) }));

app.post("/me/blocks", async (c) => {
  const body = (await readJson(c)) as { address?: unknown } | undefined;
  if (body === undefined || typeof body.address !== "string") return c.json({ error: "address is required" }, 400);
  const result = await blockUser(c.env.DB, c.get("address"), body.address, nowSeconds());
  return result.ok ? c.json({ ok: true }) : c.json({ error: result.error }, result.status);
});

app.delete("/me/blocks/:address", async (c) => {
  const removed = await unblockUser(c.env.DB, c.get("address"), c.req.param("address"));
  return removed ? c.json({ ok: true }) : c.json({ error: "not blocked" }, 404);
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

app.post("/me/orders/:orderId/agreement", async (c) => {
  const orderId = parseOrderId(c.req.param("orderId"));
  if (orderId === null) return c.json({ error: "invalid order id" }, 400);
  const body = await readJson(c);
  if (body === undefined) return c.json({ error: "invalid json" }, 400);
  const parsed = validateProposal(body);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const result = await propose(c.env.DB, c.get("address"), orderId, parsed.value, nowSeconds());
  if (!result.ok) return c.json({ error: result.error }, result.status);
  await record(c, recordAgreementEvent(c.env.DB, "proposed", orderId, result.row.payee, c.get("address"), nowSeconds()));
  return c.json({ agreement: presentAgreement(result.row, nowSeconds()) }, 201);
});

app.get("/me/cases", async (c) => c.json(await casesFor(c.env.DB, c.get("address"))));

app.post("/me/orders/:orderId/release", async (c) => {
  const orderId = parseOrderId(c.req.param("orderId"));
  if (orderId === null) return c.json({ error: "invalid order id" }, 400);
  const parsed = parseRelease(await readJson(c));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const result = await submitRelease(c.env.DB, orderId, c.get("address"), parsed.value, nowSeconds());
  if (result.ok) await record(c, recordOrderEvent(c.env.DB, "approved", orderId, c.get("address"), String(nowSeconds()), nowSeconds()));
  return result.ok ? c.json({ ok: true }, 201) : c.json({ error: result.error }, result.status);
});

app.get("/me/orders/:orderId/release", async (c) => {
  const orderId = parseOrderId(c.req.param("orderId"));
  if (orderId === null) return c.json({ error: "invalid order id" }, 400);
  const result = await readRelease(c.env.DB, orderId, c.get("address"), nowSeconds());
  return result.ok ? c.json({ release: result.release }) : c.json({ error: result.error }, result.status);
});

app.delete("/me/orders/:orderId/release", async (c) => {
  const orderId = parseOrderId(c.req.param("orderId"));
  if (orderId === null) return c.json({ error: "invalid order id" }, 400);
  const result = await cancelRelease(c.env.DB, orderId, c.get("address"));
  return result.ok ? c.json({ ok: true }) : c.json({ error: result.error }, result.status);
});

app.get("/me/contributions", async (c) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT g.order_id AS orderId, c.id AS changaId, c.spec_hash AS specHash, c.status AS status, json_extract(c.spec, '$.title') AS title
       FROM group_contributors g LEFT JOIN changas c ON c.order_id = g.order_id WHERE g.address = ? ORDER BY g.order_id DESC LIMIT 50`,
    )
    .bind(c.get("address"))
    .all();
  return c.json({ contributions: results });
});

app.post("/me/reports", async (c) => {
  const result = await createReport(c.env.DB, c.get("address"), await readJson(c), nowSeconds());
  return result.ok ? c.json({ ok: true }, 201) : c.json({ error: result.error }, result.status);
});

app.get("/admin/reports", async (c) => c.json({ reports: await listReports(c.env.DB, c.req.query("status") === "resolved" ? "resolved" : "open", parseLimit(c.req.query("limit"), 50, 100)) }));

app.post("/admin/reports/:id", async (c) => {
  const id = parseChangaId(c.req.param("id"));
  const body = (await readJson(c)) as { action?: unknown; reason?: unknown } | undefined;
  if (id === null || (body?.action !== "dismiss" && body?.action !== "hide")) return c.json({ error: "action must be dismiss or hide" }, 400);
  const parsed = parseReason(body.reason);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const report = await resolveReport(c.env.DB, id, c.get("address"), body.action, nowSeconds());
  if (!report) return c.json({ error: "report not found" }, 404);
  if (body.action === "hide" && report.kind === "changa") {
    await setHidden(c.env.DB, Number(report.target), true);
    readCache.clear();
  }
  await logAction(c.env.DB, c.get("address"), body.action === "hide" ? "report_hide" : "report_dismissed", `${report.kind}:${report.target}`, parsed.reason, nowSeconds()).run();
  return c.json({ ok: true });
});

app.get("/me/summary", async (c) => {
  const seen = Number(c.req.query("seenNotification") ?? 0);
  const seenId = Number.isSafeInteger(seen) && seen >= 0 ? seen : 0;
  return c.json(await cachedRead(`summary:${c.get("address")}:${seenId}`, () => summaryFor(c.env.DB, c.get("address"), seenId, nowSeconds())));
});

app.get("/me/activity", async (c) => c.json(await cachedRead(`activity:${c.get("address")}`, () => activitySummary(c.env.DB, c.get("address")))));

app.get("/me/notifications", async (c) => c.json({ notifications: await listNotifications(c.env.DB, c.get("address"), nowSeconds()) }));

app.get("/me/agreements", async (c) => c.json({ agreements: await listAgreements(c.env.DB, c.get("address"), nowSeconds()) }));

app.post("/me/orders/:orderId/agreement/accept", async (c) => {
  const orderId = parseOrderId(c.req.param("orderId"));
  if (orderId === null) return c.json({ error: "invalid order id" }, 400);
  if (!c.env.RELAYER_KEY) return c.json({ error: "relayer not configured" }, 503);
  const body = (await readJson(c)) as { signature?: unknown } | undefined;
  if (!body || typeof body.signature !== "string" || !isHex(body.signature)) return c.json({ error: "invalid signature" }, 400);
  const result = await acceptAgreement(c.env.DB, createAgreementChain(c.env.RPC_URL, c.env.RELAYER_KEY), orderId, c.get("address"), body.signature, nowSeconds());
  if (!result.ok) return c.json({ error: result.error }, result.status);
  await record(c, recordAgreementEvent(c.env.DB, "accepted", orderId, c.get("address"), c.get("address"), nowSeconds()));
  return c.json({ txHash: result.txHash });
});

app.delete("/me/orders/:orderId/agreement", async (c) => {
  const orderId = parseOrderId(c.req.param("orderId"));
  if (orderId === null) return c.json({ error: "invalid order id" }, 400);
  const before = await c.env.DB.prepare("SELECT payee FROM agreements WHERE order_id = ?").bind(orderId).first<{ payee: string }>();
  const result = await cancelAgreement(c.env.DB, orderId, c.get("address"), nowSeconds());
  if (!result.ok) return c.json({ error: result.error }, result.status);
  if (before) await record(c, recordAgreementEvent(c.env.DB, before.payee === c.get("address") ? "rejected" : "cancelled", orderId, before.payee, c.get("address"), nowSeconds()));
  return c.json({ ok: true });
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
    // El recuadro se ajusta a una grilla de 0,05° (unos 5 km) hacia afuera: dos personas (o la misma moviendo apenas el mapa)
    // piden exactamente lo mismo y comparten la caché. Se trae un poco de más y la pantalla muestra solo lo que cae adentro.
    filters.bbox = { minLat: Math.floor(minLat / BBOX_GRID) * BBOX_GRID, maxLat: Math.ceil(maxLat / BBOX_GRID) * BBOX_GRID, minLng: Math.floor(minLng / BBOX_GRID) * BBOX_GRID, maxLng: Math.ceil(maxLng / BBOX_GRID) * BBOX_GRID };
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

  const key = `changas:${JSON.stringify(filters)}`;
  const body = await cachedRead(key, async () => ({ changas: (await listOpen(c.env.DB, filters)).map(presentChanga) }));
  c.header("Cache-Control", "public, max-age=10");
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
