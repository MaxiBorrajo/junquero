import type { Hex } from "viem";
import type { Api } from "../api/client";
import { CHAT_KEY_MESSAGE, buildChatKeyMessage, keyPairFromSeed, pairFromSecretHex, publicKeyHex, secretKeyHex, seedFromSignature, type ChatKeyPair } from "./chat";

export interface KeyStorage {
  getSecret(address: string): Promise<string | null>;
  setSecret(address: string, secretHex: string): Promise<void>;
  isRegistered(address: string, publicKey: string): Promise<boolean>;
  markRegistered(address: string, publicKey: string): Promise<void>;
}

export interface KeyDeps {
  api: Api;
  storage: KeyStorage;
  address: string;
  signMessage: (message: string) => Promise<Hex>;
}

export async function loadChatKey(deps: KeyDeps): Promise<ChatKeyPair> {
  const address = deps.address.toLowerCase();
  const stored = await deps.storage.getSecret(address);
  let pair: ChatKeyPair;
  if (stored) {
    pair = pairFromSecretHex(stored);
  } else {
    pair = keyPairFromSeed(seedFromSignature(await deps.signMessage(CHAT_KEY_MESSAGE)));
    await deps.storage.setSecret(address, secretKeyHex(pair));
  }
  const publicKey = publicKeyHex(pair);
  if (!(await deps.storage.isRegistered(address, publicKey))) {
    const signature = await deps.signMessage(buildChatKeyMessage(address, publicKey));
    await deps.api.send("PUT", "/me/chat-key", { publicKey, signature });
    await deps.storage.markRegistered(address, publicKey);
  }
  return pair;
}

export async function fetchCounterpartKey(api: Api, address: string): Promise<Uint8Array | null> {
  try {
    const { publicKey } = await api.get<{ publicKey: string }>(`/me/chat-keys/${address.toLowerCase()}`);
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) bytes[i] = parseInt(publicKey.slice(i * 2, i * 2 + 2), 16);
    return bytes;
  } catch {
    return null;
  }
}
