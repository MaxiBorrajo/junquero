import { getAddress, isAddress, isHex, slice, toFunctionSelector, type Abi, type AbiFunction, type Address, type Hex } from "viem";

export interface ForwardRequest {
  from: Address;
  to: Address;
  value: bigint;
  gas: bigint;
  deadline: number;
  data: Hex;
  signature: Hex;
}

export interface RelayTarget {
  address: Address;
  abi: Abi;
}

export interface RelayPolicy {
  targets: RelayTarget[];
  maxGas: bigint;
  minDeadlineSeconds: number;
  maxPerWindow: number;
  windowSeconds: number;
}

export type EstimateResult = { ok: true; gas: bigint } | { ok: false; reason: "invalid_request" | "revert" };

export interface RelayChain {
  estimate(request: ForwardRequest): Promise<EstimateResult>;
  send(request: ForwardRequest, gas: bigint): Promise<Hex>;
}

export type RelayResult =
  | { ok: true; txHash: Hex }
  | { ok: false; status: number; error: string };

const GAS_MARGIN_NUMERATOR = 12n;
const GAS_MARGIN_DENOMINATOR = 10n;

const fail = (status: number, error: string): RelayResult => ({ ok: false, status, error });

export function allowedSelectors(abi: Abi): Set<string> {
  const selectors = abi
    .filter((item): item is AbiFunction => item.type === "function" && item.stateMutability === "nonpayable")
    .map((item) => toFunctionSelector(item));
  return new Set(selectors);
}

export function parseRequest(body: unknown): ForwardRequest | string {
  if (typeof body !== "object" || body === null) return "invalid body";
  const raw = body as Record<string, unknown>;
  if (typeof raw.from !== "string" || !isAddress(raw.from)) return "invalid from";
  if (typeof raw.to !== "string" || !isAddress(raw.to)) return "invalid to";
  if (typeof raw.data !== "string" || !isHex(raw.data) || raw.data.length < 10) return "invalid data";
  if (typeof raw.signature !== "string" || !isHex(raw.signature)) return "invalid signature";
  const deadline = Number(raw.deadline);
  if (!Number.isSafeInteger(deadline) || deadline <= 0) return "invalid deadline";
  let value: bigint;
  let gas: bigint;
  try {
    value = BigInt(String(raw.value ?? "0"));
    gas = BigInt(String(raw.gas));
  } catch {
    return "invalid numbers";
  }
  return {
    from: getAddress(raw.from),
    to: getAddress(raw.to),
    value,
    gas,
    deadline,
    data: raw.data,
    signature: raw.signature,
  };
}

export function checkPolicy(request: ForwardRequest, policy: RelayPolicy, nowSeconds: number): string | null {
  const target = policy.targets.find((item) => item.address.toLowerCase() === request.to.toLowerCase());
  if (!target) return "target not allowed";
  if (!allowedSelectors(target.abi).has(slice(request.data, 0, 4))) return "function not allowed";
  if (request.value !== 0n) return "value must be zero";
  if (request.gas <= 0n || request.gas > policy.maxGas) return "gas out of range";
  if (request.deadline < nowSeconds + policy.minDeadlineSeconds) return "deadline too close or expired";
  return null;
}

async function recentCount(db: D1Database, from: Address, since: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS total FROM relay_log WHERE from_address = ? AND created_at >= ?")
    .bind(from.toLowerCase(), since)
    .first<{ total: number }>();
  return row ? row.total : 0;
}

export async function relay(
  db: D1Database,
  chain: RelayChain,
  policy: RelayPolicy,
  body: unknown,
  nowSeconds: number,
): Promise<RelayResult> {
  const request = parseRequest(body);
  if (typeof request === "string") return fail(400, request);

  const rejection = checkPolicy(request, policy, nowSeconds);
  if (rejection) return fail(403, rejection);

  const used = await recentCount(db, request.from, nowSeconds - policy.windowSeconds);
  if (used >= policy.maxPerWindow) return fail(429, "rate limit reached");

  let estimate: EstimateResult;
  try {
    estimate = await chain.estimate(request);
  } catch {
    return fail(503, "chain unavailable");
  }
  if (!estimate.ok) {
    return estimate.reason === "invalid_request"
      ? fail(400, "invalid signature, nonce or deadline")
      : fail(422, "transaction would revert");
  }

  let txHash: Hex;
  try {
    txHash = await chain.send(request, (estimate.gas * GAS_MARGIN_NUMERATOR) / GAS_MARGIN_DENOMINATOR);
  } catch {
    return fail(503, "relayer unavailable");
  }
  await db
    .prepare("INSERT INTO relay_log (from_address, target, selector, tx_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(request.from.toLowerCase(), request.to.toLowerCase(), slice(request.data, 0, 4), txHash, nowSeconds)
    .run();
  return { ok: true, txHash };
}
