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

// La clave pública de chat de una persona no cambia (sale de una firma fija), así que se pide una sola vez por sesión.
// Solo se guardan los éxitos: si todavía no la registró, se vuelve a preguntar la próxima vez.
const counterpartKeys = new Map<string, Promise<Uint8Array | null>>();

export const clearCounterpartKeys = (): void => counterpartKeys.clear();

export function fetchCounterpartKey(api: Api, address: string): Promise<Uint8Array | null> {
  const id = address.toLowerCase();
  const known = counterpartKeys.get(id);
  if (known) return known;
  const request = (async () => {
    try {
      const { publicKey } = await api.get<{ publicKey: string }>(`/me/chat-keys/${id}`);
      const bytes = new Uint8Array(32);
      for (let i = 0; i < 32; i += 1) bytes[i] = parseInt(publicKey.slice(i * 2, i * 2 + 2), 16);
      return bytes;
    } catch {
      return null;
    }
  })();
  counterpartKeys.set(id, request);
  void request.then((key) => {
    if (key === null && counterpartKeys.get(id) === request) counterpartKeys.delete(id);
  });
  return request;
}
