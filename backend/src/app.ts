import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { issueToken, parseLogin, verifyLogin, verifyToken } from "./auth";
import { getPublished, listByOwner, listOpen, presentChanga, saveDraft, type ListFilters } from "./changas";
import { startBlock } from "./contracts";
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
app.use("/auth/*", limitBy((env) => env.AUTH_LIMITER));
app.use("/me", requireAuth);
app.use("/me/*", requireAuth);

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
  const saved = await saveDraft(c.env.DB, c.get("address"), result.spec, result.canonical, result.hash, now);
  if (!saved.ok) return c.json({ error: saved.error }, 429);
  return c.json({ specHash: result.hash, canonical: result.canonical }, saved.created ? 201 : 200);
});

app.get("/me/changas", async (c) => {
  const rows = await listByOwner(c.env.DB, c.get("address"), OWN_CHANGAS_LIMIT);
  return c.json({ changas: rows.map(presentChanga) });
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
