import type { Api } from "../api/client";
import { open, pairFromSecretHex } from "../crypto/chat";
import { fetchCounterpartKey, type KeyStorage } from "../crypto/keyManager";
import { decodeEnvelope, type ChatFile } from "./envelope";
import type { ServerMessage } from "./state";

export const PREVIEW_LENGTH = 70;

// Los textos de los adjuntos en la lista (se arman acá para no depender de la pantalla).
export const PREVIEW_LABELS = { photo: "Foto", photos: "fotos", pdf: "PDF", files: "archivos" };

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
    const envelope = decodeEnvelope(open({ nonce: last.nonce, body: last.body }, theirs, pairFromSecretHex(secret)));
    if (!envelope) return null;
    const text = envelope.text.trim();
    return text ? previewText(text) : envelope.files.length > 0 ? attachmentLabel(envelope.files, PREVIEW_LABELS) : null;
  } catch {
    return null;
  }
}

// Lo que se ve en la lista cuando el último mensaje no tiene texto, solo adjuntos.
export function attachmentLabel(files: ChatFile[], labels: { photo: string; photos: string; pdf: string; files: string }): string {
  if (files.length === 1) return files[0].mime === "application/pdf" ? labels.pdf : labels.photo;
  if (files.every((file) => file.mime.startsWith("image/"))) return `${files.length} ${labels.photos}`;
  return `${files.length} ${labels.files}`;
}

// Descifra el último mensaje que el servidor guardó cifrado y arma el renglón de la lista.
export function previewFromSealed(
  chat: { lastNonce: string | null; lastBody: string | null },
  mine: ReturnType<typeof pairFromSecretHex>,
  theirs: Uint8Array,
  labels: Parameters<typeof attachmentLabel>[1],
): string | null {
  if (!chat.lastNonce || !chat.lastBody) return null;
  const envelope = decodeEnvelope(open({ nonce: chat.lastNonce, body: chat.lastBody }, theirs, mine));
  if (!envelope) return null;
  const text = envelope.text.trim();
  if (text) return previewText(text);
  return envelope.files.length > 0 ? attachmentLabel(envelope.files, labels) : null;
}
