import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { indexedContracts, startBlock } from "./contracts";
import { allowed, clientKey, type Limiter } from "./guard";
import { readCursor, runIndexerRounds, type ChainClient } from "./indexer";
import { relay, type RelayPolicy } from "./relay";
import { createRelayChain, relayTargets } from "./relayChain";
import { createTaskChain } from "./taskChain";
import { isPurgeMinute, purgeOldLogs } from "./maintenance";
import { runTasks } from "./tasks";
import { TtlCache } from "./ttlCache";

interface Env {
  DB: D1Database;
  RPC_URL: string;
  RELAYER_KEY: `0x${string}`;
  RELAY_LIMITER: Limiter;
  READ_LIMITER: Limiter;
  CONFIRMATIONS: string;
  BLOCK_CHUNK: string;
  CHUNKS_PER_RUN: string;
  TASK_BATCH: string;
  TASK_MAX_SENDS: string;
}

const MAX_BLOCKS_WITH_LOGS = 30;
const READ_CACHE_MS = 10_000;
const READ_CACHE_ENTRIES = 200;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function chainClient(rpcUrl: string): ChainClient {
  const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  return {
    getBlockNumber: () => client.getBlockNumber(),
    getLogs: ({ addresses, fromBlock, toBlock }) => client.getLogs({ address: addresses, fromBlock, toBlock }),
    getBlockTimestamp: async (blockNumber) => Number((await client.getBlock({ blockNumber })).timestamp),
  };
}

const relayPolicy: RelayPolicy = {
  targets: relayTargets,
  maxGas: 3_000_000n,
  minDeadlineSeconds: 60,
  maxPerWindow: 30,
  windowSeconds: 3600,
};

const app = new Hono<{ Bindings: Env }>();
const readCache = new TtlCache<unknown>(READ_CACHE_MS, READ_CACHE_ENTRIES);

const readGuard = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  if (!(await allowed(c.env.READ_LIMITER, clientKey(c.req.raw.headers)))) {
    return c.json({ error: "too many requests" }, 429);
  }
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

app.use("/health", readGuard);
app.use("/events", readGuard);
app.use("/orders/*", readGuard);

interface EventRecord {
  args: string;
  [key: string]: unknown;
}

const present = (row: EventRecord) => ({ ...row, args: JSON.parse(row.args) });

const parseLimit = (value: string | undefined): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_LIMIT) : DEFAULT_LIMIT;
};

app.get("/health", async (c) => {
  const lastBlock = await readCursor(c.env.DB, startBlock);
  return c.json({ ok: true, lastIndexedBlock: lastBlock });
});

app.post("/relay", async (c) => {
  if (!(await allowed(c.env.RELAY_LIMITER, clientKey(c.req.raw.headers)))) {
    return c.json({ error: "too many requests" }, 429);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
  if (!c.env.RELAYER_KEY) return c.json({ error: "relayer not configured" }, 503);
  const chain = createRelayChain(c.env.RPC_URL, c.env.RELAYER_KEY);
  const result = await relay(c.env.DB, chain, relayPolicy, body, Math.floor(Date.now() / 1000));
  if (!result.ok) return c.json({ error: result.error }, result.status as 400 | 403 | 422 | 429 | 503);
  return c.json({ txHash: result.txHash });
});

app.get("/orders/:id/timeline", async (c) => {
  const orderId = Number(c.req.param("id"));
  if (!Number.isInteger(orderId) || orderId < 0) return c.json({ error: "invalid order id" }, 400);
  const body = await cachedRead(c.req.url, async () => {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM events WHERE order_id = ? ORDER BY block_number, log_index",
    )
      .bind(orderId)
      .all<EventRecord>();
    return { orderId, events: results.map(present) };
  });
  return c.json(body);
});

app.get("/events", async (c) => {
  const filters: string[] = [];
  const values: (string | number)[] = [];
  const equals = { contract: c.req.query("contract"), name: c.req.query("name") };
  for (const [column, value] of Object.entries(equals)) {
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
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM events ${where} ORDER BY block_number DESC, log_index DESC LIMIT ?`,
    )
      .bind(...values, parseLimit(c.req.query("limit")))
      .all<EventRecord>();
    return { events: results.map(present) };
  });
  return c.json(body);
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const client = chainClient(env.RPC_URL);
    const options = {
      contracts: indexedContracts,
      startBlock,
      confirmations: Number(env.CONFIRMATIONS),
      chunk: Number(env.BLOCK_CHUNK),
      maxBlocksWithLogs: MAX_BLOCKS_WITH_LOGS,
    };
    if (isPurgeMinute(event.scheduledTime)) ctx.waitUntil(purgeOldLogs(env.DB, Math.floor(event.scheduledTime / 1000)));
    ctx.waitUntil(runIndexerRounds(env.DB, client, options, Number(env.CHUNKS_PER_RUN)));
    if (env.RELAYER_KEY) {
      const taskOptions = {
        batchSize: Number(env.TASK_BATCH),
        maxSends: Number(env.TASK_MAX_SENDS),
        eventScanLimit: 500,
        sentGraceSeconds: 120,
        unreadableRetrySeconds: 60,
      };
      ctx.waitUntil(
        runTasks(env.DB, createTaskChain(env.RPC_URL, env.RELAYER_KEY), taskOptions, Math.floor(Date.now() / 1000)).catch(
          (error) => console.error("tasks failed", error),
        ),
      );
    }
  },
};
