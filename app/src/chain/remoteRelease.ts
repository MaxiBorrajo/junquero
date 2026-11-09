import type { Address, Hex } from "viem";
import type { Api } from "../api/client";
import { encodeReleaseMilestone, milestoneReleaseTypedData } from "./milestones";
import { encodeRelease, releaseTypedData, RELEASE_VALIDITY_SECONDS } from "./orderActions";
import type { Deployment } from "./deployment";

export interface RemoteRelease {
  index: number | null;
  payee: string;
  amount: string;
  rating: number;
  evidenceHash: string;
  expiry: number;
  signature: string;
}

export interface ApproveInput {
  api: Api;
  deployment: Deployment;
  orderId: number;
  payee: Address;
  index: number | null;
  amount: bigint;
  rating: number;
  evidenceHash: Hex;
  now: number;
  sign: (typed: unknown) => Promise<Hex>;
}

export async function approveRemotely(input: ApproveInput): Promise<void> {
  const expiry = input.now + RELEASE_VALIDITY_SECONDS;
  const base = { orderId: BigInt(input.orderId), amount: input.amount, rating: input.rating, evidenceHash: input.evidenceHash, expiry };
  const signature =
    input.index === null
      ? await input.sign(releaseTypedData(input.deployment, { ...base, payee: input.payee }))
      : await input.sign(milestoneReleaseTypedData(input.deployment, { ...base, index: input.index }));
  await input.api.send("POST", `/me/orders/${input.orderId}/release`, {
    ...(input.index === null ? {} : { index: input.index }),
    amount: input.amount.toString(),
    rating: input.rating,
    evidenceHash: input.evidenceHash,
    expiry,
    signature,
  });
}

export function releaseCall(orderId: number, release: RemoteRelease): Hex {
  const data = { orderId: BigInt(orderId), amount: BigInt(release.amount), rating: release.rating, evidenceHash: release.evidenceHash as Hex, expiry: release.expiry };
  return release.index === null
    ? encodeRelease({ ...data, payee: release.payee as Address }, release.signature as Hex)
    : encodeReleaseMilestone({ ...data, index: release.index }, release.signature as Hex);
}
