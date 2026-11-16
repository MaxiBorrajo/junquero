import { app, setSyncRunner } from "./app";
import { purgeAgreements } from "./agreements";
import { purgeReleases } from "./releases";
import { applicationsHandler } from "./applications";
import { chatEventsHandler } from "./chatEvents";
import { ratingsHandler } from "./ratings";
import { withChatNotify } from "./chatNotify";
import { partiesHandler } from "./parties";
import { createChangasHandler, purgeStaleDrafts } from "./changas";
import { deployedTokenDecimals, indexedContracts, startBlock } from "./contracts";
import type { Env } from "./env";
import { hasUnprocessedEvents, processEvents } from "./eventStream";
import { readCursor, runIndexerRounds, type ChainClient } from "./indexer";
import { purgeExpiredFiles, purgeOrphanFiles } from "./files";
import { hasNoLogs, verifySignature, withSyncLock } from "./hook";
import { isPurgeMinute, purgeOldLogs } from "./maintenance";
import { deliverDue, notificationsHandler, purgeSentNotifications } from "./notifications";
import { createPublicClient, http, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { createMarkChain } from "./markChain";
import { runMarks } from "./marks";
import { relayerLock } from "./relayerLock";
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

const projections = [watchedHandler, changasHandler, applicationsHandler, notificationsHandler, partiesHandler, chatEventsHandler, ratingsHandler];

// Indexa la cadena y después arma las tablas de consulta con los eventos nuevos, en ese orden y de una sola vez.
// ¿Hay algo para hacer? Un bloque nuevo ya confirmado o eventos guardados sin procesar. Si no, no se toma el candado ni se
// escribe nada: el reloj de cada minuto cuesta una consulta y una lectura a la red en vez de varias escrituras.
async function chainHasWork(env: Env, confirmations: number): Promise<boolean> {
  const cursor = await readCursor(env.DB, startBlock);
  const head = await chainClient(env.RPC_URL).getBlockNumber();
  if (BigInt(cursor) + 1n <= head - BigInt(confirmations)) return true;
  return hasUnprocessedEvents(env.DB);
}

async function syncChain(env: Env, confirmations: number): Promise<void> {
  if (!(await chainHasWork(env, confirmations))) return;
  await withSyncLock(env.DB, Date.now(), async () => {
    const options = {
      contracts: indexedContracts,
      startBlock,
      confirmations,
      chunk: Number(env.BLOCK_CHUNK),
      maxBlocksWithLogs: MAX_BLOCKS_WITH_LOGS,
    };
    await runIndexerRounds(env.DB, chainClient(env.RPC_URL), options, Number(env.CHUNKS_PER_RUN));
    // Los hechos nuevos de la cadena (acordado, llegó, entregó...) le avisan a los chats abiertos.
    await withChatNotify(env, () => processEvents(env.DB, projections, EVENT_SCAN_LIMIT));
  });
}

async function runRobot(env: Env, nowSeconds: number): Promise<void> {
  if (!env.RELAYER_KEY) return;
  const options = {
    batchSize: Number(env.TASK_BATCH),
    maxSends: Number(env.TASK_MAX_SENDS),
    sentGraceSeconds: SENT_GRACE_SECONDS,
    unreadableRetrySeconds: UNREADABLE_RETRY_SECONDS,
  };
  await runTasks(env.DB, createTaskChain(env.RPC_URL, env.RELAYER_KEY, relayerLock(env)), options, nowSeconds);
  await runMarks(env.DB, createMarkChain(env.RPC_URL, env.RELAYER_KEY as Hex, relayerLock(env)), nowSeconds);
}

async function chainHook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!env.ALCHEMY_WEBHOOK_SIGNING_KEY) return new Response("hook not configured", { status: 503 });
  const body = await request.text();
  if (!(await verifySignature(body, env.ALCHEMY_WEBHOOK_SIGNING_KEY, request.headers.get("x-alchemy-signature")))) return new Response("invalid signature", { status: 401 });
  if (hasNoLogs(body)) return new Response("ok");
  ctx.waitUntil(syncChain(env, Number(env.HOOK_CONFIRMATIONS ?? "0")).catch((error) => console.error("hook sync failed", error)));
  return new Response("ok");
}

setSyncRunner((env) => syncChain(env, Number(env.HOOK_CONFIRMATIONS ?? "0")));

export { ChatRoom } from "./chatRoom";
export { RelayerGate } from "./relayerGate";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (request.method === "POST" && new URL(request.url).pathname === "/hooks/chain") return chainHook(request, env, ctx);
    return app.fetch(request, env, ctx);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const nowSeconds = Math.floor(event.scheduledTime / 1000);
    if (isPurgeMinute(event.scheduledTime)) {
      ctx.waitUntil(Promise.all([purgeOldLogs(env.DB, nowSeconds), purgeStaleDrafts(env.DB, nowSeconds), purgeOrphanFiles(env.DB, env.FILES, nowSeconds), purgeExpiredFiles(env.DB, env.FILES, nowSeconds), purgeSentNotifications(env.DB, nowSeconds, 7 * 24 * 3600), withChatNotify(env, () => purgeAgreements(env.DB, nowSeconds)), purgeReleases(env.DB, nowSeconds)]));
    }
    ctx.waitUntil(syncChain(env, Number(env.CONFIRMATIONS)).catch((error) => console.error("sync failed", error)));
    ctx.waitUntil(deliverDue(env.DB, (url, init) => fetch(url, init), nowSeconds).catch((error) => console.error("push failed", error)));
    ctx.waitUntil(runRobot(env, nowSeconds).catch((error) => console.error("processing failed", error)));
  },
};
