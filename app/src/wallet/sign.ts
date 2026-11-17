import { Linking } from "react-native";
import type { Hex } from "viem";
import { signMessage, signTypedData } from "wagmi/actions";
import { APP_SCHEME } from "../config";
import { wagmiAdapter } from "./appkit";
import { withWallet as ask } from "./withWallet";

const WALLET_LINK = "metamask://";
const openWallet = () => Linking.openURL(WALLET_LINK);

// Pantalla en la que se pidió la firma: al terminar, la app se vuelve a abrir con el link de esa misma pantalla y no pierde el lugar.
let returnPath = "/";
export const setReturnPath = (path: string): void => {
  returnPath = path;
};
const backToApp = () => Linking.openURL(`${APP_SCHEME}://${returnPath.replace(/^\//, "")}`);

export const signTyped = (typed: unknown): Promise<Hex> => ask(() => signTypedData(wagmiAdapter.wagmiConfig, typed as Parameters<typeof signTypedData>[1]), openWallet, backToApp);

export const signText = (message: string): Promise<Hex> => ask(() => signMessage(wagmiAdapter.wagmiConfig, { message }), openWallet, backToApp);

export function isRejection(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? error).toLowerCase();
  return message.includes("reject") || message.includes("denied") || message.includes("cancel");
}

// La sesión de WalletConnect quedó desfasada (la billetera ya no reconoce la conexión): hay que reconectar.
export function isStaleWalletSession(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? error).toLowerCase();
  return message.includes("no matching key") || message.includes("invalid id") || message.includes("session topic") || message.includes("session not found") || message.includes("wallet not connected") || message.includes("connector not connected");
}
