import { createPublicClient, http, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { readFileSync } from "node:fs";
import { createApi, type Api } from "../src/api/client";
import type { Deployment } from "../src/chain/deployment";
import { forwarderAbi, tokenAbi } from "../src/chain/abis";
import { orderAbi } from "../src/chain/orderAbi";
import { buildLoginMessage } from "../src/session/login";
import { keyPairFromSeed, seedFromSignature, type ChatKeyPair } from "../src/crypto/chat";

const addresses = JSON.parse(readFileSync("/tmp/junquero-e2e/local-addresses.json", "utf8")) as Record<string, Address>;

export const RPC = "http://127.0.0.1:8545";
export const API = "http://127.0.0.1:8787";

export const deployment: Deployment & { arbitration: Address } = {
  chainId: 11155111,
  token: addresses.token!,
  forwarder: addresses.forwarder!,
  escrow: addresses.escrow!,
  arbitration: addresses.arbitration!,
  tokenName: "USDC",
  tokenPermitVersion: "1",
};

export const KEYS = {
  admin: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  payer: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  worker: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  third: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  fourth: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  fifth: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
} as const satisfies Record<string, Hex>;

export const chain = createPublicClient({ chain: sepolia, transport: http(RPC) });

export type Actor = ReturnType<typeof makeActor>;

export function makeActor(key: Hex) {
  const account = privateKeyToAccount(key);
  let token: string | null = null;
  const api: Api = createApi({ baseUrl: API, getToken: () => token, onUnauthorized: () => {} });
  return {
    account,
    api,
    address: account.address,
    setToken: (value: string) => (token = value),
    signTyped: (typed: unknown) => account.signTypedData(typed as Parameters<typeof account.signTypedData>[0]),
    signMessage: (message: string) => account.signMessage({ message }),
  };
}

export async function login(actor: Actor): Promise<void> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const signature = await actor.signMessage(buildLoginMessage(actor.address, issuedAt));
  const result = await createApi({ baseUrl: API, getToken: () => null }).send<{ token: string }>("POST", "/auth/login", { address: actor.address.toLowerCase(), issuedAt, signature });
  actor.setToken(result.token);
}

export async function chatKey(actor: Actor): Promise<ChatKeyPair> {
  const pair = keyPairFromSeed(seedFromSignature(await actor.signMessage("Junquero: clave de chat v1") as Hex));
  const publicKey = Buffer.from(pair.publicKey).toString("hex");
  const signature = await actor.signMessage(`Junquero: esta es mi clave de chat.\nBilletera: ${actor.address.toLowerCase()}\nClave: ${publicKey}`);
  await actor.api.send("PUT", "/me/chat-key", { publicKey, signature });
  return pair;
}

export const readNonces = (actor: Actor) => ({
  token: () => chain.readContract({ address: deployment.token, abi: tokenAbi, functionName: "nonces", args: [actor.address] }),
  forwarder: () => chain.readContract({ address: deployment.forwarder, abi: forwarderAbi, functionName: "nonces", args: [actor.address] }),
  balance: () => chain.readContract({ address: deployment.token, abi: tokenAbi, functionName: "balanceOf", args: [actor.address] }),
});

export const balanceOf = (address: Address): Promise<bigint> => chain.readContract({ address: deployment.token, abi: tokenAbi, functionName: "balanceOf", args: [address] });

export const order = (id: number) => chain.readContract({ address: deployment.escrow, abi: orderAbi, functionName: "getOrder", args: [BigInt(id)] });

export async function mint(to: Address, amount: bigint): Promise<void> {
  const funder = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const { createWalletClient } = await import("viem");
  const wallet = createWalletClient({ account: funder, chain: sepolia, transport: http(RPC) });
  const hash = await wallet.writeContract({ address: deployment.token, abi: parseAbi(["function mint(address to, uint256 amount)"]), functionName: "mint", args: [to, amount] });
  await chain.waitForTransactionReceipt({ hash });
}

export async function tick(): Promise<void> {
  await fetch(`${API}/cdn-cgi/handler/scheduled`);
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

export async function until<T>(description: string, probe: () => Promise<T | null | false>, tries = 40, delayMs = 1500): Promise<T> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    await tick();
    const value = await probe().catch(() => null);
    if (value) return value as T;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`timeout esperando: ${description}`);
}

export const relayDeps = (actor: Actor) => ({
  api: actor.api,
  deployment,
  account: actor.address,
  now: () => Math.floor(Date.now() / 1000),
  readForwarderNonce: readNonces(actor).forwarder,
  signTypedData: actor.signTyped,
});

export async function advanceTime(seconds: number): Promise<void> {
  await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "evm_increaseTime", params: [seconds] }) });
  await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "evm_mine", params: [] }) });
}

export const sha256Hex = async (bytes: Uint8Array): Promise<string> => (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex");

export async function uploadOne(from: Actor, to: Actor, mine: import("../src/crypto/chat").ChatKeyPair, orderId: number, name: string): Promise<string> {
  const { uploadEvidence } = await import("../src/evidence/upload");
  const bytes = Uint8Array.from({ length: 512 }, (_, i) => (i * 7 + name.length) % 256);
  const result = await uploadEvidence(
    { api: from.api, address: from.address, counterpart: to.address, mine, signMessage: from.signMessage as never, hash: sha256Hex },
    orderId,
    bytes,
    { capturedAt: Math.floor(Date.now() / 1000), name, mime: "image/jpeg" },
  );
  return result.hash;
}
