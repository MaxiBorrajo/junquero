import type { Api } from "../api/client";
import { open, pairFromSecretHex } from "../crypto/chat";
import { fetchCounterpartKey, type KeyStorage } from "../crypto/keyManager";
import type { ServerMessage } from "./state";

export const PREVIEW_LENGTH = 70;

export function previewText(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH - 1)}…` : flat;
}

export async function loadPreview(api: Api, storage: Pick<KeyStorage, "getSecret">, me: string, chat: { applicationId: number; counterpart: string; lastSeq: number }): Promise<string | null> {
  if (chat.lastSeq <= 0) return null;
  const secret = await storage.getSecret(me.toLowerCase());
  if (!secret) return null;
  const theirs = await fetchCounterpartKey(api, chat.counterpart);
  if (!theirs) return null;
  try {
    const { messages } = await api.get<{ messages: ServerMessage[] }>(`/me/chats/${chat.applicationId}/messages?after=${chat.lastSeq - 1}&limit=1`);
    const last = messages.at(-1);
    if (!last) return null;
    const plain = open({ nonce: last.nonce, body: last.body }, theirs, pairFromSecretHex(secret));
    return plain === null ? null : previewText(plain);
  } catch {
    return null;
  }
}
