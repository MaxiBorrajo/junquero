import { deployment } from "../chain/deployment";
import type { RelayDeps } from "../chain/orderActions";
import { readForwarderNonce } from "../chain/reader";
import type { Api } from "../api/client";
import { signTyped } from "../wallet/sign";

export function relayDepsFor(api: Api, address: string): RelayDeps {
  const account = address as `0x${string}`;
  return { api, deployment, account, now: () => Math.floor(Date.now() / 1000), readForwarderNonce: () => readForwarderNonce(account), signTypedData: signTyped };
}
