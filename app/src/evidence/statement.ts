import type { Api } from "../api/client";
import { sha256Hex } from "../lib/files";
import { signText } from "../wallet/sign";
import { uploadEvidence } from "./upload";
import type { ChatKeyPair } from "../crypto/chat";

export async function uploadStatement(api: Api, address: string, counterpart: string, mine: ChatKeyPair, orderId: number, text: string): Promise<void> {
  await uploadEvidence(
    { api, address, counterpart, mine, signMessage: signText, hash: sha256Hex, quiet: true },
    orderId,
    new TextEncoder().encode(text),
    { capturedAt: Math.floor(Date.now() / 1000), name: "relato.txt", mime: "text/plain" },
  );
}
