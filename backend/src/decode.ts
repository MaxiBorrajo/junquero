import { decodeEventLog, type Abi, type Address, type Hex } from "viem";
import type { IndexedContract } from "./contracts";

export interface RawLog {
  address: Address;
  topics: readonly Hex[];
  data: Hex;
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
}

export interface EventRow {
  block_number: number;
  block_timestamp: number;
  tx_hash: string;
  log_index: number;
  contract: string;
  address: string;
  name: string;
  order_id: number | null;
  case_id: number | null;
  args: string;
}

const serialize = (value: unknown): string =>
  JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item));

const asId = (value: unknown): number | null => (typeof value === "bigint" ? Number(value) : null);

export function decodeLog(
  log: RawLog,
  timestamp: number,
  contracts: ReadonlyMap<string, IndexedContract>,
): EventRow | null {
  const contract = contracts.get(log.address.toLowerCase());
  if (!contract) return null;

  let name = "Unknown";
  let args: unknown = { topics: log.topics, data: log.data };
  try {
    const decoded = decodeEventLog({ abi: contract.abi as Abi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
    name = String(decoded.eventName);
    args = decoded.args ?? {};
  } catch {}

  const fields = (args ?? {}) as Record<string, unknown>;
  return {
    block_number: Number(log.blockNumber),
    block_timestamp: timestamp,
    tx_hash: log.transactionHash,
    log_index: log.logIndex,
    contract: contract.name,
    address: log.address.toLowerCase(),
    name,
    order_id: asId(fields.orderId),
    case_id: asId(fields.caseId),
    args: serialize(args),
  };
}
