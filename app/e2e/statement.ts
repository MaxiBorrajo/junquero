import type { ChatKeyPair } from "../src/crypto/chat";
import { uploadEvidence } from "../src/evidence/upload";
import { sha256Hex, type Actor } from "./harness";

export async function uploadStatement(from: Actor, to: Actor, mine: ChatKeyPair, orderId: number, text: string): Promise<void> {
  await uploadEvidence(
    { api: from.api, address: from.address, counterpart: to.address, mine, signMessage: from.signMessage as never, hash: sha256Hex },
    orderId,
    new TextEncoder().encode(text),
    { capturedAt: Math.floor(Date.now() / 1000), name: "relato.txt", mime: "text/plain" },
  );
}
