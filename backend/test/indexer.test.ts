import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type Abi, type Address, type Hex } from "viem";
import { indexedContracts } from "../src/contracts";
import { decodeLog, type RawLog } from "../src/decode";
import { readCursor, runIndexer, runIndexerRounds, type ChainClient, type IndexerOptions } from "../src/indexer";
import { createFakeD1 } from "./fakeD1";

const escrow = indexedContracts.find((contract) => contract.name === "escrow")!;
const payer = "0x6419B1743FCd4b36a25dd14cacAB1c1d78d22fBa" as Address;
const token = "0x057Dc87344bB1f7B213433C959B23bAACc711EEA" as Address;
const specHash = ("0x" + "ab".repeat(32)) as Hex;

function orderCreated(orderId: bigint, block: bigint, logIndex = 0): RawLog {
  const topics = encodeEventTopics({
    abi: escrow.abi as Abi,
    eventName: "OrderCreated",
    args: { orderId, payer, token },
  }) as Hex[];
  const data = encodeAbiParameters(
    [
      { type: "uint128" },
      { type: "bytes32" },
      { type: "uint8" },
      { type: "uint8" },
      { type: "uint128" },
      { type: "uint8" },
    ],
    [10_000_000n, specHash, 0, 0, 0n, 2],
  );
  return {
    address: escrow.address,
    topics,
    data,
    blockNumber: block,
    transactionHash: ("0x" + block.toString(16).padStart(64, "0")) as Hex,
    logIndex,
  };
}

class FakeChain implements ChainClient {
  failAbove: bigint | null = null;
  calls: { fromBlock: bigint; toBlock: bigint }[] = [];
  constructor(
    public head: bigint,
    public logs: RawLog[],
  ) {}
  async getBlockNumber() {
    return this.head;
  }
  async getLogs({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) {
    this.calls.push({ fromBlock, toBlock });
    if (this.failAbove !== null && toBlock - fromBlock > this.failAbove) throw new Error("range too large");
    return this.logs.filter((log) => log.blockNumber >= fromBlock && log.blockNumber <= toBlock);
  }
  async getBlockTimestamp(blockNumber: bigint) {
    return 1_700_000_000 + Number(blockNumber);
  }
}

const options = (overrides: Partial<IndexerOptions> = {}): IndexerOptions => ({
  contracts: indexedContracts,
  startBlock: 100,
  confirmations: 2,
  chunk: 500,
  maxBlocksWithLogs: 30,
  ...overrides,
});

describe("decodeLog", () => {
  const byAddress = new Map(indexedContracts.map((contract) => [contract.address.toLowerCase(), contract]));

  it("decodes a known event and extracts the order id", () => {
    const row = decodeLog(orderCreated(7n, 120n), 1_700_000_120, byAddress)!;
    expect(row.name).toBe("OrderCreated");
    expect(row.contract).toBe("escrow");
    expect(row.order_id).toBe(7);
    expect(row.case_id).toBeNull();
    expect(JSON.parse(row.args).amount).toBe("10000000");
  });

  it("keeps an unknown event instead of dropping it", () => {
    const log = { ...orderCreated(1n, 120n), topics: [("0x" + "11".repeat(32)) as Hex] as readonly Hex[] };
    const row = decodeLog(log, 1, byAddress)!;
    expect(row.name).toBe("Unknown");
    expect(row.order_id).toBeNull();
  });

  it("ignores logs from addresses that are not ours", () => {
    const log = { ...orderCreated(1n, 120n), address: "0x0000000000000000000000000000000000000001" as Address };
    expect(decodeLog(log, 1, byAddress)).toBeNull();
  });
});

describe("runIndexer", () => {
  it("stores events, advances the cursor and does nothing while there is nothing new", async () => {
    const { db, raw } = createFakeD1();
    const chain = new FakeChain(200n, [orderCreated(1n, 110n), orderCreated(2n, 150n)]);

    const result = await runIndexer(db, chain, options());
    expect(result).toEqual({ from: 100, to: 198, stored: 2 });
    expect(await readCursor(db, 100)).toBe(198);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM events").get()).toEqual({ n: 2 });

    expect(await runIndexer(db, chain, options())).toBeNull();
  });

  it("never indexes the newest unconfirmed blocks", async () => {
    const { db } = createFakeD1();
    const chain = new FakeChain(101n, [orderCreated(1n, 101n)]);
    expect(await runIndexer(db, chain, options())).toBeNull();
    chain.head = 103n;
    expect(await runIndexer(db, chain, options())).toEqual({ from: 100, to: 101, stored: 1 });
  });

  it("is idempotent when a range is read twice", async () => {
    const { db, raw } = createFakeD1();
    const logs = [orderCreated(1n, 110n)];
    await runIndexer(db, new FakeChain(200n, logs), options());
    raw.prepare("UPDATE sync_state SET last_block = 99").run();
    await runIndexer(db, new FakeChain(200n, logs), options());
    expect(raw.prepare("SELECT COUNT(*) AS n FROM events").get()).toEqual({ n: 1 });
  });

  it("splits the range when the provider rejects it", async () => {
    const { db } = createFakeD1();
    const chain = new FakeChain(1000n, [orderCreated(1n, 110n), orderCreated(2n, 140n)]);
    chain.failAbove = 20n;
    const result = await runIndexer(db, chain, options());
    expect(result?.stored).toBeGreaterThan(0);
    expect(result!.to).toBeLessThanOrEqual(121);
    expect(await readCursor(db, 100)).toBe(result!.to);

    const next = await runIndexer(db, chain, options());
    expect(next!.from).toBe(result!.to + 1);
  });

  it("caps the blocks fetched per run and resumes from where it stopped", async () => {
    const { db, raw } = createFakeD1();
    const logs = [orderCreated(1n, 110n), orderCreated(2n, 120n), orderCreated(3n, 130n)];
    const chain = new FakeChain(400n, logs);

    const first = await runIndexer(db, chain, options({ maxBlocksWithLogs: 2 }));
    expect(first).toEqual({ from: 100, to: 129, stored: 2 });
    const second = await runIndexer(db, chain, options({ maxBlocksWithLogs: 2 }));
    expect(second?.stored).toBe(1);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM events").get()).toEqual({ n: 3 });
  });

  it("keeps the order of events inside a block", async () => {
    const { db, raw } = createFakeD1();
    await runIndexer(db, new FakeChain(200n, [orderCreated(2n, 110n, 5), orderCreated(1n, 110n, 1)]), options());
    const rows = raw.prepare("SELECT order_id FROM events ORDER BY block_number, log_index").all();
    expect(rows).toEqual([{ order_id: 1 }, { order_id: 2 }]);
  });

  it("catches up over several rounds and stops when it reaches the confirmed head", async () => {
    const { db, raw } = createFakeD1();
    const logs = [orderCreated(1n, 105n), orderCreated(2n, 125n), orderCreated(3n, 148n)];
    const chain = new FakeChain(160n, logs);

    const results = await runIndexerRounds(db, chain, options({ chunk: 10 }), 10);
    expect(results.length).toBe(6);
    expect(await readCursor(db, 100)).toBe(158);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM events").get()).toEqual({ n: 3 });
  });

  it("limits the rounds per run", async () => {
    const { db } = createFakeD1();
    const results = await runIndexerRounds(db, new FakeChain(1000n, []), options({ chunk: 10 }), 3);
    expect(results.length).toBe(3);
    expect(await readCursor(db, 100)).toBe(129);
  });
});
