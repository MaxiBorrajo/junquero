import type { Api } from "../api/client";
import type { ChatKeyPair } from "../crypto/chat";
import { fetchCounterpartKey } from "../crypto/keyManager";
import type { EvidenceItem } from "../data/useOrder";
import { unwrapKey, wrapKey } from "./crypto";

export interface ShareDeps {
  api: Api;
  address: string;
  mine: ChatKeyPair;
  orderId: number;
  items: EvidenceItem[];
  jurors: string[];
}

export async function shareWithJurors(deps: ShareDeps): Promise<number> {
  const me = deps.address.toLowerCase();
  const own = deps.items.filter((item) => item.uploader.toLowerCase() === me && item.wrappedKey);
  if (own.length === 0 || deps.jurors.length === 0) return 0;

  const recipients: { address: string; key: Uint8Array }[] = [];
  for (const juror of deps.jurors) {
    const key = await fetchCounterpartKey(deps.api, juror);
    if (key) recipients.push({ address: juror, key });
  }

  let sent = 0;
  for (const item of own) {
    const symmetric = unwrapKey(item.wrappedKey!, deps.mine.publicKey, deps.mine);
    if (!symmetric) continue;
    for (const recipient of recipients) {
      await deps.api.send("PUT", `/me/orders/${deps.orderId}/evidence/${item.hash}/keys`, { recipient: recipient.address, wrapped: wrapKey(symmetric, recipient.key, deps.mine) });
      sent += 1;
    }
  }
  return sent;
}
