import { privateKeyToAccount } from "viem/accounts";
import { decodeFunctionData, type Address, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { createApi } from "../src/api/client";
import { contributeToGroup, type ContributeDeps } from "../src/chain/contributeFlow";
import type { Deployment } from "../src/chain/deployment";
import { groupAbi } from "../src/chain/group";
import { InsufficientBalance } from "../src/chain/publish";
import { emptyDraft, groupContributionRange, validatePrice, type Draft } from "../src/publish/draft";

const deployment: Deployment = {
  chainId: 11155111,
  token: "0x057Dc87344bB1f7B213433C959B23bAACc711EEA",
  forwarder: "0xdcED2C36F0F1ad8F923427D6cc1010785F9C4F02",
  escrow: "0x739e7c41627E91F541B7DaCe2D5d3BEb997B0C02",
  tokenName: "USDC",
  tokenPermitVersion: "1",
};
const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

function setup(balance = 100_000_000n) {
  const calls: { path: string; body: any }[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace("https://x", "");
    calls.push({ path, body: init?.body ? JSON.parse(init.body as string) : undefined });
    return new Response(JSON.stringify({ txHash: "0x" + "ee".repeat(32) }), { status: 200 });
  });
  const signed: string[] = [];
  const deps: ContributeDeps = {
    api: createApi({ baseUrl: "https://x", fetcher, getToken: () => "t" }),
    deployment,
    account: account.address as Address,
    now: () => 1_800_000_000,
    readForwarderNonce: async () => 7n,
    readBalance: async () => balance,
    readTokenNonce: async () => 4n,
    signTypedData: async (typed) => {
      signed.push((typed as { primaryType: string }).primaryType);
      return account.signTypedData(typed as Parameters<typeof account.signTypedData>[0]);
    },
  };
  return { deps, calls, signed };
}

describe("aporte inicial a una changa grupal", () => {
  it("firma el permiso y el pedido y manda el aporte por el relayer", async () => {
    const { deps, calls, signed } = setup();
    await contributeToGroup(deps, 9n, 20_000_000n);
    expect(signed).toEqual(["Permit", "ForwardRequest"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe("/relay");
    const decoded = decodeFunctionData({ abi: groupAbi, data: calls[0].body.data as Hex });
    expect(decoded.functionName).toBe("contribute");
    expect(decoded.args?.[0]).toBe(9n);
    expect(decoded.args?.[1]).toBe(20_000_000n);
  });

  it("no firma nada si falta saldo", async () => {
    const { deps, calls, signed } = setup(5_000_000n);
    await expect(contributeToGroup(deps, 9n, 20_000_000n)).rejects.toBeInstanceOf(InsufficientBalance);
    expect(signed).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe("validar el aporte inicial al crear el grupo", () => {
  const group = (overrides: Partial<Draft> = {}): Draft => ({ ...emptyDraft(), kind: "group", amount: "100", evidence: ["Foto"], ...overrides });

  it("calcula el rango de 5% a 50% de la meta", () => {
    expect(groupContributionRange(100_000_000n)).toEqual({ min: 5_000_000n, max: 50_000_000n });
  });

  it("acepta un aporte dentro del rango o vacío", () => {
    expect(validatePrice(group({ ownContribution: "" })).ownContribution).toBeUndefined();
    expect(validatePrice(group({ ownContribution: "5" })).ownContribution).toBeUndefined();
    expect(validatePrice(group({ ownContribution: "50" })).ownContribution).toBeUndefined();
    expect(validatePrice(group({ ownContribution: "25,5" })).ownContribution).toBeUndefined();
  });

  it("rechaza uno fuera del rango o que no es un monto", () => {
    expect(validatePrice(group({ ownContribution: "4,99" })).ownContribution).toBe("range");
    expect(validatePrice(group({ ownContribution: "51" })).ownContribution).toBe("range");
    expect(validatePrice(group({ ownContribution: "abc" })).ownContribution).toBe("amount");
    expect(validatePrice(group({ ownContribution: "0" })).ownContribution).toBe("amount");
  });

  it("no se pide en una changa individual", () => {
    expect(validatePrice({ ...group({ ownContribution: "1" }), kind: "individual" }).ownContribution).toBeUndefined();
  });
});
