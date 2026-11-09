import { readFileSync } from "node:fs";
import { hashTypedData, recoverTypedDataAddress, decodeFunctionData, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { escrowAbi } from "../src/chain/abis";
import { createParams, encodeCreateOrder, forwardTypedData, permitTypedData, relayBody } from "../src/chain/createOrder";
import type { Deployment } from "../src/chain/deployment";

const vectors = JSON.parse(readFileSync(new URL("../../contracts/vectors/signatures.json", import.meta.url), "utf8"));
const deployment: Deployment = {
  chainId: Number(vectors.chainId),
  token: vectors.contracts.usdc as Address,
  forwarder: vectors.contracts.forwarder as Address,
  escrow: vectors.contracts.escrow as Address,
  tokenName: "USDC",
  tokenPermitVersion: vectors.usdcPermitDomainVersion,
};

describe("firmas contra los vectores de los contratos", () => {
  it("el permiso del token da el mismo digest y firma", async () => {
    const vector = vectors.vectors.permit;
    const message = vector.message;
    const typed = permitTypedData(deployment, message.owner, BigInt(message.value), BigInt(message.nonce), BigInt(message.deadline));
    expect(hashTypedData(typed)).toBe(vector.digest);
    const signer = await recoverTypedDataAddress({ ...typed, signature: vector.signatures.owner as Hex });
    expect(signer.toLowerCase()).toBe(message.owner.toLowerCase());
  });

  it("el pedido del relayer da el mismo digest y firma", async () => {
    const vector = vectors.vectors.forwardRequest;
    const m = vector.message;
    const typed = forwardTypedData(deployment, m.from, m.to, m.data, BigInt(m.nonce), Number(m.deadline), BigInt(m.gas));
    expect(hashTypedData(typed)).toBe(vector.digest);
    const signer = await recoverTypedDataAddress({ ...typed, signature: vector.signatures.payee as Hex });
    expect(signer.toLowerCase()).toBe(m.from.toLowerCase());
  });
});

describe("createOrder", () => {
  const input = {
    amount: 25_000_000n,
    specHash: ("0x" + "ab".repeat(32)) as Hex,
    spec: { modality: "onsite" as const, startsAt: 1_800_000_000, deadline: 1_800_100_000, category: 3 },
  };

  it("codifica parámetros y permiso tal como los lee el contrato", () => {
    const data = encodeCreateOrder(deployment, input, "0x1234", 99n);
    const decoded = decodeFunctionData({ abi: escrowAbi, data });
    expect(decoded.functionName).toBe("createOrder");
    const [params, auth] = decoded.args as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(params).toMatchObject({ token: deployment.token, amount: 25_000_000n, specHash: input.specHash, mode: 0, modality: 0, startsAt: 1_800_000_000, deadline: 1_800_100_000, category: 3 });
    expect(auth).toMatchObject({ method: 0, nonce: 0n, deadline: 99n, signature: "0x1234" });
  });

  it("changa a distancia sin horario manda ceros y modalidad remota", () => {
    expect(createParams(deployment, { ...input, spec: { modality: "remote", category: 1 } })).toMatchObject({ modality: 1, startsAt: 0, deadline: 0 });
  });

  it("el cuerpo del relayer usa el formato que valida el servidor", async () => {
    const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const data = encodeCreateOrder(deployment, input, "0x1234", 99n);
    const typed = forwardTypedData(deployment, account.address, deployment.escrow, data, 0n, 5000);
    const signature = await account.signTypedData(typed);
    const body = relayBody(account.address, deployment.escrow, data, 800_000n, 5000, signature);
    expect(body).toMatchObject({ value: "0", gas: "800000", deadline: 5000, from: account.address, to: deployment.escrow });
    expect(JSON.parse(JSON.stringify(body)).gas).toBe("800000");
  });
});
