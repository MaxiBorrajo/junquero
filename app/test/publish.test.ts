import { hashTypedData, recoverTypedDataAddress, decodeFunctionData, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { createApi } from "../src/api/client";
import { escrowAbi } from "../src/chain/abis";
import { groupAbi } from "../src/chain/group";
import type { Deployment } from "../src/chain/deployment";
import { InsufficientBalance, publishChanga, waitUntilOpen, type PublishDeps, type PublishStep } from "../src/chain/publish";
import { emptyDraft, type Draft } from "../src/publish/draft";

const deployment: Deployment = {
  chainId: 11155111,
  token: "0x057Dc87344bB1f7B213433C959B23bAACc711EEA",
  forwarder: "0xdcED2C36F0F1ad8F923427D6cc1010785F9C4F02",
  escrow: "0x739e7c41627E91F541B7DaCe2D5d3BEb997B0C02",
  tokenName: "USDC",
  tokenPermitVersion: "1",
};
const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const SPEC_HASH = ("0x" + "cd".repeat(32)) as Hex;
const draft: Draft = { ...emptyDraft(), title: "Pintar", category: 1, point: { lat: -34.6, lng: -58.4 }, approx: { lat: -34.601, lng: -58.401 }, startsAt: 1_800_007_200, amount: "25" };

function setup(overrides: Partial<PublishDeps> = {}) {
  const calls: { path: string; body: unknown }[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace("https://x", "");
    calls.push({ path, body: init?.body ? JSON.parse(init.body as string) : undefined });
    if (path === "/me/changas") return new Response(JSON.stringify({ specHash: SPEC_HASH, canonical: "{}" }), { status: 201 });
    if (path === "/relay") return new Response(JSON.stringify({ txHash: "0x" + "ee".repeat(32) }), { status: 200 });
    return new Response("{}", { status: 404 });
  });
  const steps: PublishStep[] = [];
  const deps: PublishDeps = {
    api: createApi({ baseUrl: "https://x", fetcher, getToken: () => "t" }),
    deployment,
    account: account.address as Address,
    now: () => 1_800_000_000,
    nonce: () => "nonce-12345",
    readBalance: async () => 100_000_000n,
    readTokenNonce: async () => 4n,
    readForwarderNonce: async () => 7n,
    signTypedData: (typed) => account.signTypedData(typed as Parameters<typeof account.signTypedData>[0]),
    onStep: (step) => steps.push(step),
    ...overrides,
  };
  return { deps, calls, steps };
}

describe("publicar", () => {
  it("guarda la ficha, firma permiso y pedido, y manda al relayer en orden", async () => {
    const { deps, calls, steps } = setup();
    const result = await publishChanga(deps, draft, 25_000_000n);
    expect(result.specHash).toBe(SPEC_HASH);
    expect(steps).toEqual(["spec", "balance", "permit", "forward", "relay", "confirming"]);
    expect(calls.map((c) => c.path)).toEqual(["/me/changas", "/relay"]);

    const body = calls[1]!.body as { from: string; to: string; data: Hex; gas: string; deadline: number; signature: Hex };
    expect(body.to).toBe(deployment.escrow);
    expect(body.deadline).toBe(1_800_003_600);

    const decoded = decodeFunctionData({ abi: escrowAbi, data: body.data });
    const [params, auth] = decoded.args as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(params).toMatchObject({ amount: 25_000_000n, specHash: SPEC_HASH, mode: 0, modality: 0 });
    expect(auth).toMatchObject({ method: 0, deadline: 1_800_003_600n });

    const forward = {
      domain: { name: "Forwarder", version: "1", chainId: 11155111, verifyingContract: deployment.forwarder },
      types: { ForwardRequest: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "gas", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint48" }, { name: "data", type: "bytes" }] },
      primaryType: "ForwardRequest" as const,
      message: { from: body.from as Address, to: body.to as Address, value: 0n, gas: BigInt(body.gas), nonce: 7n, deadline: body.deadline, data: body.data },
    };
    expect(hashTypedData(forward)).toBeDefined();
    expect((await recoverTypedDataAddress({ ...forward, signature: body.signature })).toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("no firma ni manda nada si falta saldo e informa cuánto falta", async () => {
    const { deps, calls } = setup({ readBalance: async () => 10_000_000n });
    const sign = vi.fn(deps.signTypedData);
    await expect(publishChanga({ ...deps, signTypedData: sign }, draft, 25_000_000n)).rejects.toMatchObject({ missing: 15_000_000n });
    await expect(publishChanga({ ...deps, signTypedData: sign }, draft, 25_000_000n)).rejects.toBeInstanceOf(InsufficientBalance);
    expect(sign).not.toHaveBeenCalled();
    expect(calls.every((c) => c.path === "/me/changas")).toBe(true);
  });

  it("si la persona cancela la firma, no se llama al relayer", async () => {
    const { deps, calls } = setup({ signTypedData: async () => Promise.reject(new Error("User rejected")) });
    await expect(publishChanga(deps, draft, 25_000_000n)).rejects.toThrow("User rejected");
    expect(calls.some((c) => c.path === "/relay")).toBe(false);
  });
});

describe("esperar publicación", () => {
  it("reintenta hasta que el indexador la marque abierta", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return new Response(JSON.stringify({ changas: calls < 3 ? [{ id: 1, status: "draft" }] : [{ id: 1, status: "open" }] }), { status: 200 });
    };
    const api = createApi({ baseUrl: "https://x", fetcher, getToken: () => null });
    const result = await waitUntilOpen(api, SPEC_HASH, { attempts: 5, delayMs: 1, wait: async () => {} });
    expect(result?.status).toBe("open");
    expect(calls).toBe(3);
  });

  it("devuelve null si no aparece a tiempo", async () => {
    const api = createApi({ baseUrl: "https://x", fetcher: async () => new Response("{}", { status: 404 }), getToken: () => null });
    expect(await waitUntilOpen(api, SPEC_HASH, { attempts: 2, delayMs: 1, wait: async () => {} })).toBeNull();
  });
});

describe("publicar una changa grupal", () => {
  it("crea la changa grupal sin pedir saldo ni permiso", async () => {
    const group: Draft = { ...draft, kind: "group", amount: "100", fundingDays: 7 };
    const { deps, calls, steps } = setup({ readBalance: async () => { throw new Error("no debería consultar saldo"); } });
    const signed: unknown[] = [];
    const result = await publishChanga({ ...deps, signTypedData: async (typed) => (signed.push(typed), deps.signTypedData(typed)) }, group, 100_000_000n);
    expect(result.specHash).toBe(SPEC_HASH);
    expect(steps).toEqual(["spec", "forward", "relay", "confirming"]);
    expect(signed).toHaveLength(1);

    const spec = calls[0]!.body as { group: { target: string; fundingDeadline: number } };
    expect(spec.group).toEqual({ target: "100000000", fundingDeadline: 1_800_000_000 + 7 * 86400 });
    const body = calls[1]!.body as { data: Hex };
    const decoded = decodeFunctionData({ abi: groupAbi, data: body.data });
    expect(decoded.functionName).toBe("createGroupOrder");
    expect((decoded.args as unknown as [Record<string, unknown>, Record<string, unknown>])[0]).toMatchObject({ amount: 100_000_000n, specHash: SPEC_HASH });
    expect((decoded.args as unknown as [Record<string, unknown>, Record<string, unknown>])[1]).toMatchObject({ fundingDeadline: 1_800_000_000 + 7 * 86400 });
  });
});
