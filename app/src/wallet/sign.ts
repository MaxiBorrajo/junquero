import type { Hex } from "viem";
import { signTypedData } from "wagmi/actions";
import { wagmiAdapter } from "./appkit";

export const signTyped = (typed: unknown): Promise<Hex> => signTypedData(wagmiAdapter.wagmiConfig, typed as Parameters<typeof signTypedData>[1]);

export function isRejection(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? error).toLowerCase();
  return message.includes("reject") || message.includes("denied") || message.includes("cancel");
}
