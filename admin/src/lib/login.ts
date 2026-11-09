export const buildLoginMessage = (address: string, issuedAt: number): string =>
  `Junquero: confirmo que esta billetera es mía.\nBilletera: ${address.toLowerCase()}\nEmitido: ${issuedAt}`;

export function utf8Hex(text: string): string {
  let out = "0x";
  for (const byte of new TextEncoder().encode(text)) out += byte.toString(16).padStart(2, "0");
  return out;
}

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export class NoWalletError extends Error {}

export async function connect(provider: Eip1193 | undefined): Promise<string> {
  if (!provider) throw new NoWalletError("no_wallet");
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const first = accounts[0];
  if (!first) throw new Error("no_account");
  return first.toLowerCase();
}

export async function signLogin(provider: Eip1193, address: string, issuedAt: number): Promise<string> {
  return (await provider.request({ method: "personal_sign", params: [utf8Hex(buildLoginMessage(address, issuedAt)), address] })) as string;
}
