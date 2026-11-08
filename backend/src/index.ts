import { Hono } from "hono";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { indexedContracts, startBlock } from "./contracts";
import { readCursor, runIndexerRounds, type ChainClient } from "./indexer";
import { relay, type RelayPolicy } from "./relay";
import { createRelayChain, relayTargets } from "./relayChain";

interface Env {
  DB: D1Database;
  RPC_URL: string;
  RELAYER_KEY: `0x${string}`;
  CONFIRMATIONS: string;
  BLOCK_CHUNK: string;
  CHUNKS_PER_RUN: string;
}

const MAX_BLOCKS_WITH_LOGS = 30;
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
  minRelayerBalance: 1_000_000_000_000n,
};

const app = new Hono<{ Bindings: Env }>();

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
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM events WHERE order_id = ? ORDER BY block_number, log_index",
  )
    .bind(orderId)
    .all<EventRecord>();
  return c.json({ orderId, events: results.map(present) });
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
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM events ${where} ORDER BY block_number DESC, log_index DESC LIMIT ?`,
  )
    .bind(...values, parseLimit(c.req.query("limit")))
    .all<EventRecord>();
  return c.json({ events: results.map(present) });
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const client = chainClient(env.RPC_URL);
    const options = {
      contracts: indexedContracts,
      startBlock,
      confirmations: Number(env.CONFIRMATIONS),
      chunk: Number(env.BLOCK_CHUNK),
      maxBlocksWithLogs: MAX_BLOCKS_WITH_LOGS,
    };
    ctx.waitUntil(runIndexerRounds(env.DB, client, options, Number(env.CHUNKS_PER_RUN)));
  },
};
