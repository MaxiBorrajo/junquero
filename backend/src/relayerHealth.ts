import { createPublicClient, http, type Hex } from "viem";
import { relayerAddress } from "./relayChain";

// Cada acción que pasa por el relayer cuesta gas de ETH. Con menos de EMPTY ya no alcanza ni para una; por debajo de LOW conviene recargarlo.
export const RELAYER_LOW_WEI = 50_000_000_000_000_000n; // 0,05 ETH
export const RELAYER_EMPTY_WEI = 5_000_000_000_000_000n; // 0,005 ETH

export type RelayerLevel = "ok" | "low" | "empty" | "unknown";

export function relayerLevel(balance: bigint | null): RelayerLevel {
  if (balance === null) return "unknown";
  if (balance < RELAYER_EMPTY_WEI) return "empty";
  if (balance < RELAYER_LOW_WEI) return "low";
  return "ok";
}

export interface RelayerHealth {
  address: string;
  balanceWei: string | null;
  level: RelayerLevel;
}

export async function readRelayerHealth(rpcUrl: string, privateKey: Hex, read?: (address: `0x${string}`) => Promise<bigint>): Promise<RelayerHealth> {
  const address = relayerAddress(privateKey);
  let balance: bigint | null = null;
  try {
    balance = read ? await read(address) : await createPublicClient({ transport: http(rpcUrl) }).getBalance({ address });
  } catch {
    balance = null;
  }
  return { address, balanceWei: balance === null ? null : balance.toString(), level: relayerLevel(balance) };
}
