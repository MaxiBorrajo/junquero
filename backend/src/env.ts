import type { Limiter } from "./guard";

export interface Env {
  DB: D1Database;
  RPC_URL: string;
  RELAYER_KEY: `0x${string}`;
  AUTH_SECRET: string;
  RELAY_LIMITER: Limiter;
  READ_LIMITER: Limiter;
  AUTH_LIMITER: Limiter;
  WRITE_LIMITER: Limiter;
  CONFIRMATIONS: string;
  BLOCK_CHUNK: string;
  CHUNKS_PER_RUN: string;
  TASK_BATCH: string;
  TASK_MAX_SENDS: string;
  REQUIRE_VERIFIED_APPLICANT?: string;
}
