import type { Api } from "../api/client";
import { readBytes, sha256Hex } from "../lib/files";
import type { PickedFile } from "../lib/pick";
import { signText } from "../wallet/sign";
import { uploadEvidenceBatch, type EvidenceFile } from "./upload";
import type { ChatKeyPair } from "../crypto/chat";

// Sube el relato de un reclamo y, si hay, los archivos que lo acompañan, todo junto y con una sola firma. No avisa "subieron pruebas":
// el aviso es el del reclamo.
export async function uploadStatement(api: Api, address: string, counterpart: string, mine: ChatKeyPair, orderId: number, text: string, extra: PickedFile[] = []): Promise<void> {
  const capturedAt = Math.floor(Date.now() / 1000);
  const files: EvidenceFile[] = [{ file: new TextEncoder().encode(text), meta: { capturedAt, name: "relato.txt", mime: "text/plain" } }];
  for (const item of extra) files.push({ file: await readBytes(item.uri), meta: { capturedAt, name: item.name, mime: item.mime } });
  await uploadEvidenceBatch({ api, address, counterpart, mine, signMessage: signText, hash: sha256Hex, quiet: true }, orderId, files);
}
