import { app } from "./app";
import { createChangasHandler, purgeStaleDrafts } from "./changas";
import { deployedTokenDecimals, indexedContracts, startBlock } from "./contracts";
import type { Env } from "./env";
import { processEvents } from "./eventStream";
import { runIndexerRounds, type ChainClient } from "./indexer";
import { isPurgeMinute, purgeOldLogs } from "./maintenance";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { createTaskChain } from "./taskChain";
import { runTasks, watchedHandler } from "./tasks";

const MAX_BLOCKS_WITH_LOGS = 30;
const EVENT_SCAN_LIMIT = 500;
const SENT_GRACE_SECONDS = 120;
const UNREADABLE_RETRY_SECONDS = 60;

function chainClient(rpcUrl: string): ChainClient {
  const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  return {
    getBlockNumber: () => client.getBlockNumber(),
    getLogs: ({ addresses, fromBlock, toBlock }) => client.getLogs({ address: addresses, fromBlock, toBlock }),
    getBlockTimestamp: async (blockNumber) => Number((await client.getBlock({ blockNumber })).timestamp),
  };
}

const changasHandler = createChangasHandler(deployedTokenDecimals);

async function processAndRun(env: Env, nowSeconds: number): Promise<void> {
  await processEvents(env.DB, [watchedHandler, changasHandler], EVENT_SCAN_LIMIT);
  if (!env.RELAYER_KEY) return;
  const options = {
    batchSize: Number(env.TASK_BATCH),
    maxSends: Number(env.TASK_MAX_SENDS),
    sentGraceSeconds: SENT_GRACE_SECONDS,
    unreadableRetrySeconds: UNREADABLE_RETRY_SECONDS,
  };
  await runTasks(env.DB, createTaskChain(env.RPC_URL, env.RELAYER_KEY), options, nowSeconds);
}

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const nowSeconds = Math.floor(event.scheduledTime / 1000);
    if (isPurgeMinute(event.scheduledTime)) {
      ctx.waitUntil(Promise.all([purgeOldLogs(env.DB, nowSeconds), purgeStaleDrafts(env.DB, nowSeconds)]));
    }
    const options = {
      contracts: indexedContracts,
      startBlock,
      confirmations: Number(env.CONFIRMATIONS),
      chunk: Number(env.BLOCK_CHUNK),
      maxBlocksWithLogs: MAX_BLOCKS_WITH_LOGS,
    };
    ctx.waitUntil(runIndexerRounds(env.DB, chainClient(env.RPC_URL), options, Number(env.CHUNKS_PER_RUN)));
    ctx.waitUntil(processAndRun(env, nowSeconds).catch((error) => console.error("processing failed", error)));
  },
};
