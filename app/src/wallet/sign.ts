import type { Hex } from "viem";
import { signTypedData } from "wagmi/actions";
import { wagmiAdapter } from "./appkit";

export const signTyped = (typed: unknown): Promise<Hex> => signTypedData(wagmiAdapter.wagmiConfig, typed as Parameters<typeof signTypedData>[1]);

export function isRejection(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? error).toLowerCase();
  return message.includes("reject") || message.includes("denied") || message.includes("cancel");
}

// La sesión de WalletConnect quedó desfasada (la billetera ya no reconoce la conexión): hay que reconectar.
export function isStaleWalletSession(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? error).toLowerCase();
  return message.includes("no matching key") || message.includes("invalid id") || message.includes("session topic") || message.includes("session not found") || message.includes("wallet not connected") || message.includes("connector not connected");
}
