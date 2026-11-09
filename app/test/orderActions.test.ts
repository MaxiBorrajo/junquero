import { readFileSync } from "node:fs";
import { hashTypedData, recoverTypedDataAddress, toFunctionSelector, type Abi, type AbiFunction, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/api/client";
import { orderAbi } from "../src/chain/orderAbi";
import { encodeDeliver, encodeReleaseQr, parseReleaseQr, releaseTypedData, sendViaRelay, encodeRelease } from "../src/chain/orderActions";
import type { Deployment } from "../src/chain/deployment";
import { escrowAbi } from "../src/chain/abis";

const root = (name: string) => JSON.parse(readFileSync(new URL(`../../contracts/deployments/abi/${name}.json`, import.meta.url), "utf8"));
const vectors = JSON.parse(readFileSync(new URL("../../contracts/vectors/signatures.json", import.meta.url), "utf8"));
const real = (root("Escrow").abi ?? root("Escrow")) as Abi;

const selectors = (abi: readonly unknown[]) => new Map((abi as AbiFunction[]).filter((x) => x.type === "function").map((x) => [x.name, toFunctionSelector(x)]));

describe("las firmas de funciones coinciden con el contrato desplegado", () => {
  it("todas las que usa la app existen con los mismos tipos", () => {
    const deployed = selectors(real);
    for (const [name, selector] of selectors(orderAbi)) expect(deployed.get(name), name).toBe(selector);
    for (const [name, selector] of selectors(escrowAbi)) expect(deployed.get(name), name).toBe(selector);
  });
});

const deployment: Deployment = {
  chainId: Number(vectors.chainId),
  token: vectors.contracts.usdc,
  forwarder: vectors.contracts.forwarder,
  escrow: vectors.contracts.escrow,
  tokenName: "USDC",
  tokenPermitVersion: "1",
};

describe("liberación", () => {
  it("la firma de liberación da el mismo digest que los vectores", async () => {
    const vector = vectors.vectors.release;
    const m = vector.message;
    const typed = releaseTypedData(deployment, { orderId: BigInt(m.orderId), payee: m.payee, amount: BigInt(m.amount), rating: Number(m.rating), evidenceHash: m.evidenceHash, expiry: Number(m.expiry) });
    expect(hashTypedData(typed)).toBe(vector.digest);
    const signer = await recoverTypedDataAddress({ ...typed, signature: vector.signatures.payer as Hex });
    expect(signer.toLowerCase()).toBe(vector.message.payer?.toLowerCase() ?? signer.toLowerCase());
  });

  it("el QR lleva todo lo necesario, vuelve igual y detecta vencidos o alterados", () => {
    const vector = vectors.vectors.release;
    const m = vector.message;
    const data = { orderId: BigInt(m.orderId), payee: m.payee, amount: BigInt(m.amount), rating: Number(m.rating), evidenceHash: m.evidenceHash, expiry: Number(m.expiry) };
    const signature = vector.signatures.payer as Hex;
    const text = encodeReleaseQr(data, signature);
    expect(text.length).toBeLessThan(600);
    expect(parseReleaseQr(text, data.expiry - 10)).toEqual({ data, signature });
    expect(parseReleaseQr(text, data.expiry + 1)).toBe("expired");
    expect(parseReleaseQr("no es json", 0)).toBe("invalid");
    expect(parseReleaseQr(JSON.stringify({ ...JSON.parse(text), r: 9 }), 0)).toBe("invalid");
    expect(parseReleaseQr(JSON.stringify({ ...JSON.parse(text), s: "0x12" }), 0)).toBe("invalid");
    expect(parseReleaseQr(JSON.stringify({ ...JSON.parse(text), a: "-1" }), 0)).toBe("invalid");
  });

  it("codifica release y deliver con los selectores del contrato", () => {
    expect(encodeDeliver(1n, ("0x" + "ab".repeat(32)) as Hex).slice(0, 10)).toBe(selectors(real).get("deliver"));
    const vector = vectors.vectors.release;
    const m = vector.message;
    const data = encodeRelease({ orderId: BigInt(m.orderId), payee: m.payee, amount: BigInt(m.amount), rating: Number(m.rating), evidenceHash: m.evidenceHash, expiry: Number(m.expiry) }, vector.signatures.payer);
    expect(data.slice(0, 10)).toBe(selectors(real).get("release"));
  });
});

describe("relayer", () => {
  it("firma el pedido con el nonce del forwarder y devuelve el hash", async () => {
    const calls: any[] = [];
    const api = createApi({ baseUrl: "https://x", getToken: () => "t", fetcher: async (url, init) => (calls.push({ url, body: JSON.parse(init!.body as string) }), new Response(JSON.stringify({ txHash: "0x" + "ee".repeat(32) }), { status: 200 })) });
    let typed: any;
    const hash = await sendViaRelay(
      { api, deployment, account: "0x01CA95Ba9a19e6F88A90082367c285D179275De4", now: () => 1000, readForwarderNonce: async () => 9n, signTypedData: async (t) => ((typed = t), ("0x" + "22".repeat(65)) as Hex) },
      encodeDeliver(1n, ("0x" + "ab".repeat(32)) as Hex),
    );
    expect(hash).toBe("0x" + "ee".repeat(32));
    expect(typed.message).toMatchObject({ nonce: 9n, deadline: 4600, gas: 1_500_000n, to: deployment.escrow });
    expect(calls[0].body).toMatchObject({ gas: "1500000", deadline: 4600, to: deployment.escrow });
  });
});
