import { describe, expect, it } from "vitest";
import { encodeFunctionData, type Abi, type Address, type Hex } from "viem";
import { indexedContracts } from "../src/contracts";
import { relay, type ForwardRequest, type RelayChain, type RelayPolicy } from "../src/relay";
import { relayTargets } from "../src/relayChain";
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
  minRelayerBalance: 1000n,
};

class FakeRelayChain implements RelayChain {
  valid = true;
  reverts = false;
  balance = 10n ** 16n;
  sent: ForwardRequest[] = [];
  relayerBalance = async () => this.balance;
  verify = async () => this.valid;
  estimate = async () => {
    if (this.reverts) throw new Error("revert");
    return 100_000n;
  };
  send = async (request: ForwardRequest) => {
    this.sent.push(request);
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
    chain.valid = false;
    expect(await relay(db, chain, policy, body(), now)).toMatchObject({ status: 400 });
    expect(chain.sent).toHaveLength(0);
  });

  it("rejects a request that would revert", async () => {
    const { db } = createFakeD1();
    const chain = new FakeRelayChain();
    chain.reverts = true;
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

  it("stops when the relayer is out of funds", async () => {
    const { db } = createFakeD1();
    const chain = new FakeRelayChain();
    chain.balance = 0n;
    expect(await relay(db, chain, policy, body(), now)).toMatchObject({ status: 503 });
  });
});
