import type { Hex } from "viem";
import { PERMIT_VALIDITY_SECONDS, permitTypedData } from "./createOrder";
import { encodeContribute } from "./group";
import { sendViaRelay, type RelayDeps } from "./orderActions";
import { InsufficientBalance } from "./publish";

export interface ContributeDeps extends RelayDeps {
  readBalance: () => Promise<bigint>;
  readTokenNonce: () => Promise<bigint>;
}

// Suma un aporte a una changa grupal: firma el permiso del depósito y manda el pedido por el relayer.
export async function contributeToGroup(deps: ContributeDeps, orderId: bigint, amount: bigint): Promise<Hex> {
  const balance = await deps.readBalance();
  if (balance < amount) throw new InsufficientBalance(amount - balance);
  const deadline = BigInt(deps.now() + PERMIT_VALIDITY_SECONDS);
  const signature = await deps.signTypedData(permitTypedData(deps.deployment, deps.account, amount, await deps.readTokenNonce(), deadline));
  return sendViaRelay(deps, encodeContribute(orderId, amount, { method: 0, nonce: 0n, deadline, signature }));
}
