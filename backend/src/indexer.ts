import type { Address } from "viem";
import type { IndexedContract } from "./contracts";
import { decodeLog, type EventRow, type RawLog } from "./decode";

export interface ChainClient {
  getBlockNumber(): Promise<bigint>;
  getLogs(range: { addresses: Address[]; fromBlock: bigint; toBlock: bigint }): Promise<RawLog[]>;
  getBlockTimestamp(blockNumber: bigint): Promise<number>;
}

export interface IndexerOptions {
  contracts: IndexedContract[];
  startBlock: number;
  confirmations: number;
  chunk: number;
  maxBlocksWithLogs: number;
}

export interface IndexResult {
  from: number;
  to: number;
  stored: number;
}

const INSERT_BATCH = 50;

const INSERT_EVENT = `INSERT OR IGNORE INTO events
  (id, block_number, block_timestamp, tx_hash, log_index, contract, address, name, order_id, case_id, args)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const UPSERT_CURSOR = `INSERT INTO sync_state (id, last_block) VALUES (1, ?)
  ON CONFLICT(id) DO UPDATE SET last_block = excluded.last_block WHERE excluded.last_block > sync_state.last_block`;

export async function readCursor(db: D1Database, startBlock: number): Promise<number> {
  const row = await db.prepare("SELECT last_block FROM sync_state WHERE id = 1").first<{ last_block: number }>();
  return row ? row.last_block : startBlock - 1;
}

async function fetchLogs(
  client: ChainClient,
  addresses: Address[],
  from: bigint,
  to: bigint,
): Promise<{ logs: RawLog[]; to: bigint }> {
  let end = to;
  for (;;) {
    try {
      return { logs: await client.getLogs({ addresses, fromBlock: from, toBlock: end }), to: end };
    } catch (error) {
      if (end === from) throw error;
      end = from + (end - from) / 2n;
    }
  }
}

function limitToBlockBudget(logs: RawLog[], budget: number, to: bigint): { logs: RawLog[]; to: bigint } {
  const blocks = [...new Set(logs.map((log) => log.blockNumber))].sort((a, b) => (a < b ? -1 : 1));
  if (blocks.length <= budget) return { logs, to };
  const cutoff = blocks[budget];
  return { logs: logs.filter((log) => log.blockNumber < cutoff), to: cutoff - 1n };
}

async function timestamps(client: ChainClient, logs: RawLog[]): Promise<Map<bigint, number>> {
  const blocks = [...new Set(logs.map((log) => log.blockNumber))];
  const entries = await Promise.all(blocks.map(async (block) => [block, await client.getBlockTimestamp(block)] as const));
  return new Map(entries);
}

async function store(db: D1Database, rows: EventRow[], lastBlock: number): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const statements = rows.slice(i, i + INSERT_BATCH).map((row) =>
      db
        .prepare(INSERT_EVENT)
        .bind(
          row.id,
          row.block_number,
          row.block_timestamp,
          row.tx_hash,
          row.log_index,
          row.contract,
          row.address,
          row.name,
          row.order_id,
          row.case_id,
          row.args,
        ),
    );
    await db.batch(statements);
  }
  await db.prepare(UPSERT_CURSOR).bind(lastBlock).run();
}

export async function runIndexer(
  db: D1Database,
  client: ChainClient,
  options: IndexerOptions,
): Promise<IndexResult | null> {
  const cursor = await readCursor(db, options.startBlock);
  const head = await client.getBlockNumber();
  const safe = head - BigInt(options.confirmations);
  const from = BigInt(cursor) + 1n;
  if (from > safe) return null;

  let to = from + BigInt(options.chunk) - 1n;
  if (to > safe) to = safe;

  const addresses = options.contracts.map((contract) => contract.address);
  const fetched = await fetchLogs(client, addresses, from, to);
  const limited = limitToBlockBudget(fetched.logs, options.maxBlocksWithLogs, fetched.to);
  const byAddress = new Map(options.contracts.map((contract) => [contract.address.toLowerCase(), contract]));
  const times = await timestamps(client, limited.logs);

  const rows = limited.logs
    .map((log) => decodeLog(log, times.get(log.blockNumber) ?? 0, byAddress))
    .filter((row): row is EventRow => row !== null)
    .sort((a, b) => a.block_number - b.block_number || a.log_index - b.log_index);

  await store(db, rows, Number(limited.to));
  return { from: Number(from), to: Number(limited.to), stored: rows.length };
}

export async function runIndexerRounds(
  db: D1Database,
  client: ChainClient,
  options: IndexerOptions,
  rounds: number,
): Promise<IndexResult[]> {
  const results: IndexResult[] = [];
  for (let i = 0; i < rounds; i++) {
    const result = await runIndexer(db, client, options);
    if (!result) break;
    results.push(result);
  }
  return results;
}
