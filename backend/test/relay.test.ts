import { describe, expect, it } from "vitest";
import { ContractFunctionRevertedError, encodeErrorResult, encodeFunctionData, type Abi, type Address, type Hex } from "viem";
import { indexedContracts } from "../src/contracts";
import { relay, type EstimateResult, type ForwardRequest, type RelayChain, type RelayPolicy } from "../src/relay";
import { classifyEstimateError, relayTargets } from "../src/relayChain";
import { createFakeD1 } from "./fakeD1";

const escrow = indexedContracts.find((contract) => contract.name === "escrow")!;
const user = "0x6419B1743FCd4b36a25dd14cacAB1c1d78d22fBa" as Address;
const now = 1_800_000_000;

const policy: RelayPolicy = {
  targets: relayTargets,
  maxGas: 3_000_000n,
  minDeadlineSeconds: 60,
  maxPerWindow: 2,
  windowSeconds: 3600,
};

class FakeRelayChain implements RelayChain {
  failure: "invalid_request" | "revert" | null = null;
  estimateThrows = false;
  sendThrows = false;
  estimates = 0;
  gasUsed: bigint[] = [];
  sent: ForwardRequest[] = [];
  estimate = async (): Promise<EstimateResult> => {
    this.estimates += 1;
    if (this.estimateThrows) throw new Error("rpc down");
    return this.failure ? { ok: false, reason: this.failure } : { ok: true, gas: 100_000n };
  };
  send = async (request: ForwardRequest, gas: bigint) => {
    if (this.sendThrows) throw new Error("insufficient funds");
    this.sent.push(request);
    this.gasUsed.push(gas);
    return ("0x" + String(this.sent.length).padStart(64, "0")) as Hex;
  };
}

function body(overrides: Record<string, unknown> = {}) {
  const data = encodeFunctionData({ abi: escrow.abi as Abi, functionName: "cancel", args: [1n] } as never);
  return {
    from: user,
    to: escrow.address,
    value: "0",
    gas: "500000",
    deadline: now + 600,
    data,
    signature: "0x" + "11".repeat(65),
    ...overrides,
  };
}

describe("relay", () => {
  it("sends a valid request and logs it", async () => {
    const { db } = createFakeD1();
    const chain = new FakeRelayChain();
    const result = await relay(db, chain, policy, body(), now);
    expect(result.ok).toBe(true);
    expect(chain.sent).toHaveLength(1);
    expect(chain.sent[0].gas).toBe(500000n);
    expect(chain.gasUsed[0]).toBe(120_000n);
    expect(chain.estimates).toBe(1);
  });

  it("rejects a target outside the allowed contracts", async () => {
    const { db } = createFakeD1();
    const result = await relay(db, new FakeRelayChain(), policy, body({ to: user }), now);
    expect(result).toMatchObject({ ok: false, status: 403, error: "target not allowed" });
  });

  it("rejects a function that does not exist on the target", async () => {
    const { db } = createFakeD1();
    const result = await relay(db, new FakeRelayChain(), policy, body({ data: "0xdeadbeef" }), now);
    expect(result).toMatchObject({ ok: false, status: 403, error: "function not allowed" });
  });

  it("rejects value, excessive gas and near deadlines", async () => {
    const { db } = createFakeD1();
    const chain = new FakeRelayChain();
    expect(await relay(db, chain, policy, body({ value: "1" }), now)).toMatchObject({ status: 403 });
    expect(await relay(db, chain, policy, body({ gas: "9000000" }), now)).toMatchObject({ status: 403 });
    expect(await relay(db, chain, policy, body({ deadline: now + 10 }), now)).toMatchObject({ status: 403 });
    expect(chain.sent).toHaveLength(0);
  });

  it("rejects malformed bodies", async () => {
    const { db } = createFakeD1();
    const chain = new FakeRelayChain();
    expect(await relay(db, chain, policy, null, now)).toMatchObject({ status: 400 });
    expect(await relay(db, chain, policy, body({ from: "nope" }), now)).toMatchObject({ status: 400 });
    expect(await relay(db, chain, policy, body({ gas: "abc" }), now)).toMatchObject({ status: 400 });
  });

  it("rejects an invalid signature before spending gas", async () => {
    const { db } = createFakeD1();
    const chain = new FakeRelayChain();
    chain.failure = "invalid_request";
    expect(await relay(db, chain, policy, body(), now)).toMatchObject({ status: 400 });
    expect(chain.sent).toHaveLength(0);
  });

  it("rejects a request that would revert", async () => {
    const { db } = createFakeD1();
    const chain = new FakeRelayChain();
    chain.failure = "revert";
    expect(await relay(db, chain, policy, body(), now)).toMatchObject({ status: 422 });
    expect(chain.sent).toHaveLength(0);
  });

  it("limits requests per account within the window and frees it afterwards", async () => {
    const { db } = createFakeD1();
    const chain = new FakeRelayChain();
    await relay(db, chain, policy, body(), now);
    await relay(db, chain, policy, body(), now + 1);
    expect(await relay(db, chain, policy, body({ deadline: now + 700 }), now + 2)).toMatchObject({ status: 429 });
    expect(await relay(db, chain, policy, body({ deadline: now + 5000 }), now + 3700)).toMatchObject({ ok: true });
  });

  it("reports an unavailable relayer when sending fails and does not count it", async () => {
    const { db, raw } = createFakeD1();
    const chain = new FakeRelayChain();
    chain.sendThrows = true;
    expect(await relay(db, chain, policy, body(), now)).toMatchObject({ status: 503, error: "relayer unavailable" });
    expect((raw.prepare("SELECT COUNT(*) AS n FROM relay_log").get() as { n: number }).n).toBe(0);
  });

  it("reports an unavailable chain when the estimate cannot be made", async () => {
    const { db } = createFakeD1();
    const chain = new FakeRelayChain();
    chain.estimateThrows = true;
    expect(await relay(db, chain, policy, body(), now)).toMatchObject({ status: 503, error: "chain unavailable" });
  });

  it("does not spend any chain call on requests the policy rejects", async () => {
    const { db } = createFakeD1();
    const chain = new FakeRelayChain();
    await relay(db, chain, policy, body({ to: user }), now);
    await relay(db, chain, policy, body({ value: "1" }), now);
    expect(chain.estimates).toBe(0);
  });
});

describe("classifyEstimateError", () => {
  const forwarderAbi = indexedContracts.find((contract) => contract.name === "forwarder")!.abi as Abi;

  function revert(errorName: string, args: unknown[]) {
    const data = encodeErrorResult({ abi: forwarderAbi, errorName, args } as never);
    return new ContractFunctionRevertedError({ abi: forwarderAbi, data, functionName: "execute" });
  }

  it("treats forwarder validation errors as an invalid request", () => {
    expect(classifyEstimateError(revert("ERC2771ForwarderInvalidSigner", [user, user]))).toEqual({
      ok: false,
      reason: "invalid_request",
    });
    expect(classifyEstimateError(revert("ERC2771ForwarderExpiredRequest", [1]))).toEqual({
      ok: false,
      reason: "invalid_request",
    });
  });

  it("treats any other revert as a failing transaction and ignores non-reverts", () => {
    expect(classifyEstimateError(revert("FailedCall", []))).toEqual({ ok: false, reason: "revert" });
    expect(classifyEstimateError(new Error("network"))).toBeNull();
  });
});
