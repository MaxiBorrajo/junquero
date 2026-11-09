import type { Api } from "../api/client";
import type { LoginResponse } from "../api/types";

export const buildLoginMessage = (address: string, issuedAt: number): string =>
  `Junquero: confirmo que esta billetera es mía.\nBilletera: ${address.toLowerCase()}\nEmitido: ${issuedAt}`;

export type SignMessage = (message: string) => Promise<string>;

export async function loginWithWallet(api: Api, address: string, sign: SignMessage, nowSeconds: number): Promise<LoginResponse> {
  const lower = address.toLowerCase();
  const signature = await sign(buildLoginMessage(lower, nowSeconds));
  return api.send<LoginResponse>("POST", "/auth/login", { address: lower, issuedAt: nowSeconds, signature });
}

export const isExpired = (expiresAt: number, nowSeconds: number, marginSeconds = 3600): boolean => expiresAt - marginSeconds <= nowSeconds;
