import type { Address, Hex } from "viem";
import type { Api } from "../api/client";
import type { Changa } from "../api/types";
import { buildSpec, type Draft } from "../publish/draft";
import { encodeCreateGroup } from "./group";
import { FORWARD_VALIDITY_SECONDS, GAS_CREATE_ORDER, PERMIT_VALIDITY_SECONDS, encodeCreateOrder, forwardTypedData, permitTypedData, relayBody } from "./createOrder";
import type { Deployment } from "./deployment";

export type PublishStep = "spec" | "balance" | "permit" | "forward" | "relay" | "confirming";

export interface PublishDeps {
  api: Api;
  deployment: Deployment;
  account: Address;
  now: () => number;
  nonce: () => string;
  readBalance: () => Promise<bigint>;
  readTokenNonce: () => Promise<bigint>;
  readForwarderNonce: () => Promise<bigint>;
  signTypedData: (typed: unknown) => Promise<Hex>;
  onStep?: (step: PublishStep) => void;
}

export class InsufficientBalance extends Error {
  constructor(readonly missing: bigint) {
    super("insufficient_balance");
  }
}

export interface PublishResult {
  specHash: Hex;
  txHash: Hex;
}

export async function publishChanga(deps: PublishDeps, draft: Draft, amount: bigint): Promise<PublishResult> {
  const { api, deployment, account } = deps;

  deps.onStep?.("spec");
  const spec = buildSpec(draft, deps.nonce(), deps.now());
  const savedRequest = api.send<{ specHash: Hex }>("POST", "/me/changas", spec);

  if (spec.group) {
    const [saved, groupNonce] = await Promise.all([savedRequest, deps.readForwarderNonce()]);
    deps.onStep?.("forward");
    const groupData = encodeCreateGroup(
      deployment,
      { amount, specHash: saved.specHash, modality: spec.modality === "remote" ? 1 : 0, startsAt: spec.startsAt ?? 0, deadline: spec.deadline ?? 0, category: spec.category },
      spec.group.fundingDeadline,
    );
    const groupDeadline = deps.now() + FORWARD_VALIDITY_SECONDS;
    const groupSignature = await deps.signTypedData(forwardTypedData(deployment, account, deployment.escrow, groupData, groupNonce, groupDeadline, GAS_CREATE_ORDER));
    deps.onStep?.("relay");
    const sent = await api.send<{ txHash: Hex }>("POST", "/relay", relayBody(account, deployment.escrow, groupData, GAS_CREATE_ORDER, groupDeadline, groupSignature));
    deps.onStep?.("confirming");
    return { specHash: saved.specHash, txHash: sent.txHash };
  }

  const [saved, balance, permitNonce, forwardNonce] = await Promise.all([savedRequest, deps.readBalance(), deps.readTokenNonce(), deps.readForwarderNonce()]);
  deps.onStep?.("balance");
  if (balance < amount) throw new InsufficientBalance(amount - balance);

  deps.onStep?.("permit");
  const permitDeadline = BigInt(deps.now() + PERMIT_VALIDITY_SECONDS);
  const permitSignature = await deps.signTypedData(permitTypedData(deployment, account, amount, permitNonce, permitDeadline));

  const data = encodeCreateOrder(deployment, { amount, specHash: saved.specHash, spec }, permitSignature, permitDeadline);

  deps.onStep?.("forward");
  const forwardDeadline = deps.now() + FORWARD_VALIDITY_SECONDS;
  const forwardSignature = await deps.signTypedData(forwardTypedData(deployment, account, deployment.escrow, data, forwardNonce, forwardDeadline, GAS_CREATE_ORDER));

  deps.onStep?.("relay");
  const { txHash } = await api.send<{ txHash: Hex }>("POST", "/relay", relayBody(account, deployment.escrow, data, GAS_CREATE_ORDER, forwardDeadline, forwardSignature));

  deps.onStep?.("confirming");
  return { specHash: saved.specHash, txHash };
}

export async function waitUntilOpen(api: Api, specHash: string, options: { attempts: number; delayMs: number; wait?: (ms: number) => Promise<void>; statuses?: string[] }): Promise<Changa | null> {
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    try {
      const { changas } = await api.get<{ changas: Changa[] }>(`/changas/${specHash}`);
      const found = changas.find((item) => (options.statuses ?? ["open"]).includes(item.status));
      if (found) return found;
    } catch {}
    await wait(options.delayMs);
  }
  return null;
}
