import type { Hex } from "viem";
import type { Api } from "../api/client";
import type { ChatKeyPair } from "../crypto/chat";
import { fetchCounterpartKey } from "../crypto/keyManager";
import { encryptEvidence, wrapKey, type EvidenceMeta } from "./crypto";

export const buildEvidenceMessage = (orderId: number, fileHash: string, metaHash: string): string =>
  `Junquero: firmo esta prueba de la changa ${orderId}.\nArchivo: ${fileHash.toLowerCase()}\nDatos: ${metaHash.toLowerCase()}`;

export type EvidenceKind = "photo" | "video" | "document";

export const kindOf = (mime: string): EvidenceKind => (mime.startsWith("image/") ? "photo" : mime.startsWith("video/") ? "video" : "document");

export interface UploadDeps {
  api: Api;
  address: string;
  counterpart: string;
  mine: ChatKeyPair;
  signMessage: (message: string) => Promise<Hex>;
  hash: (bytes: Uint8Array) => Promise<string>;
}

export interface UploadedEvidence {
  hash: string;
}

export async function uploadEvidence(deps: UploadDeps, orderId: number, file: Uint8Array, meta: EvidenceMeta): Promise<UploadedEvidence> {
  const hash = deps.hash;
  const counterpartKey = await fetchCounterpartKey(deps.api, deps.counterpart);
  if (!counterpartKey) throw new Error("counterpart_without_key");

  const encrypted = encryptEvidence(file, meta);
  const fileHash = await hash(encrypted.cipher);
  await deps.api.upload("/me/evidence-files", encrypted.cipher, {
    "Content-Type": "application/octet-stream",
    "Content-Length": String(encrypted.cipher.byteLength),
    "X-Content-SHA256": fileHash,
  });

  const metaHash = await hash(new TextEncoder().encode(encrypted.meta));
  const signature = await deps.signMessage(buildEvidenceMessage(orderId, fileHash, metaHash));
  await deps.api.send("POST", `/me/orders/${orderId}/evidence`, { hash: fileHash, kind: kindOf(meta.mime), meta: encrypted.meta, signature });

  await deps.api.send("PUT", `/me/orders/${orderId}/evidence/${fileHash}/keys`, { recipient: deps.address.toLowerCase(), wrapped: wrapKey(encrypted.key, deps.mine.publicKey, deps.mine) });
  await deps.api.send("PUT", `/me/orders/${orderId}/evidence/${fileHash}/keys`, { recipient: deps.counterpart.toLowerCase(), wrapped: wrapKey(encrypted.key, counterpartKey, deps.mine) });
  return { hash: fileHash };
}
