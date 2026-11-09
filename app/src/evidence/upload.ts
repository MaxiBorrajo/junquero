import type { Hex } from "viem";
import type { Api } from "../api/client";
import type { ChatKeyPair } from "../crypto/chat";
import { fetchCounterpartKey } from "../crypto/keyManager";
import { encryptEvidence, wrapKey, type EvidenceMeta } from "./crypto";

export interface EvidenceEntry {
  fileHash: string;
  metaHash: string;
}

export const buildEvidenceBatchMessage = (orderId: number, entries: EvidenceEntry[]): string =>
  `Junquero: firmo estas ${entries.length} pruebas de la changa ${orderId}.\n${entries
    .map((entry, index) => `${index + 1}. Archivo: ${entry.fileHash.toLowerCase()}\n${index + 1}. Datos: ${entry.metaHash.toLowerCase()}`)
    .join("\n")}`;

export const MAX_BATCH_ITEMS = 20;

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

export interface EvidenceFile {
  file: Uint8Array;
  meta: EvidenceMeta;
}

export interface UploadedEvidence {
  hashes: string[];
}

export async function uploadEvidenceBatch(deps: UploadDeps, orderId: number, files: EvidenceFile[]): Promise<UploadedEvidence> {
  if (files.length === 0 || files.length > MAX_BATCH_ITEMS) throw new Error("invalid_batch_size");
  const counterpartKey = await fetchCounterpartKey(deps.api, deps.counterpart);
  if (!counterpartKey) throw new Error("counterpart_without_key");

  const prepared: { key: Uint8Array; fileHash: string; metaHash: string; meta: string; kind: EvidenceKind }[] = [];
  for (const item of files) {
    const encrypted = encryptEvidence(item.file, item.meta);
    const fileHash = await deps.hash(encrypted.cipher);
    await deps.api.upload("/me/evidence-files", encrypted.cipher, {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(encrypted.cipher.byteLength),
      "X-Content-SHA256": fileHash,
    });
    prepared.push({ key: encrypted.key, fileHash, metaHash: await deps.hash(new TextEncoder().encode(encrypted.meta)), meta: encrypted.meta, kind: kindOf(item.meta.mime) });
  }

  const signature = await deps.signMessage(buildEvidenceBatchMessage(orderId, prepared.map(({ fileHash, metaHash }) => ({ fileHash, metaHash }))));
  await deps.api.send("POST", `/me/orders/${orderId}/evidence/batch`, {
    items: prepared.map((item) => ({ hash: item.fileHash, kind: item.kind, meta: item.meta })),
    signature,
  });

  for (const item of prepared) {
    await deps.api.send("PUT", `/me/orders/${orderId}/evidence/${item.fileHash}/keys`, { recipient: deps.address.toLowerCase(), wrapped: wrapKey(item.key, deps.mine.publicKey, deps.mine) });
    await deps.api.send("PUT", `/me/orders/${orderId}/evidence/${item.fileHash}/keys`, { recipient: deps.counterpart.toLowerCase(), wrapped: wrapKey(item.key, counterpartKey, deps.mine) });
  }
  return { hashes: prepared.map((item) => item.fileHash) };
}

export async function uploadEvidence(deps: UploadDeps, orderId: number, file: Uint8Array, meta: EvidenceMeta): Promise<{ hash: string }> {
  const { hashes } = await uploadEvidenceBatch(deps, orderId, [{ file, meta }]);
  return { hash: hashes[0]! };
}
