import { readFileSync } from "node:fs";
import { decodeFunctionData, toFunctionSelector, type Abi, type AbiFunction, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import type { Milestone } from "../src/api/types";
import { checkContribution, contributionLimits, encodeCreateGroup, encodeObject, encodeContribute, fundingProgress, groupAbi, percentOf, vetoOpen } from "../src/chain/group";
import { encodeDeliverMilestone, encodeMilestoneQr, encodeReleaseMilestone, milestoneAbi, milestoneReleaseTypedData, parseMilestoneQr } from "../src/chain/milestones";
import { criteriaHash, milestoneTerms, milestoneTermsHash, milestoneTotal, suggestMilestones } from "../src/chain/terms";
import type { Deployment } from "../src/chain/deployment";
import { hashTypedData, recoverTypedDataAddress } from "viem";

const vectors = JSON.parse(readFileSync(new URL("../../contracts/vectors/signatures.json", import.meta.url), "utf8"));
const escrow = JSON.parse(readFileSync(new URL("../../contracts/deployments/abi/Escrow.json", import.meta.url), "utf8"));
const realAbi = (escrow.abi ?? escrow) as Abi;
const selectors = (abi: readonly unknown[]) => new Map((abi as AbiFunction[]).filter((x) => x.type === "function").map((x) => [x.name, toFunctionSelector(x)]));

const deployment: Deployment = { chainId: Number(vectors.chainId), token: vectors.contracts.usdc, forwarder: vectors.contracts.forwarder, escrow: vectors.contracts.escrow, tokenName: "USDC", tokenPermitVersion: "1" };

describe("funciones del contrato de grupos e hitos", () => {
  it("coinciden con las del contrato desplegado", () => {
    const real = selectors(realAbi);
    for (const [name, selector] of selectors(groupAbi)) expect(real.get(name), name).toBe(selector);
    for (const [name, selector] of selectors(milestoneAbi)) expect(real.get(name), name).toBe(selector);
  });
});

const plan: Milestone[] = [
  { name: "Preparar la pared", amount: "40000000", criteria: "Pared lisa y sin humedad", evidence: "Foto de la pared" },
  { name: "Pintar", amount: "60000000", criteria: "Dos manos de pintura", evidence: "Foto del frente" },
];

describe("hash de los términos", () => {
  const base = ("0x" + "11".repeat(32)) as Hex;
  it("da el mismo valor que calcula el servidor", () => {
    expect(milestoneTermsHash(milestoneTerms(plan, base)!)).toBe("0xbf889763243eaf7b0cd5d8af82cecfac5af6d2fca9c8c6cfb3514d06a092758b");
  });
  it("sin hitos no hay términos y el total suma los montos", () => {
    expect(milestoneTerms(undefined, base)).toBeNull();
    expect(milestoneTerms([], base)).toBeNull();
    expect(milestoneTotal(plan)).toBe(100_000_000n);
    expect(criteriaHash(plan[0]!)).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it("sugiere hitos por monto o por duración, sin obligar", () => {
    expect(suggestMilestones(150_000_001n, 0)).toBe(true);
    expect(suggestMilestones(150_000_000n, 5 * 86400)).toBe(false);
    expect(suggestMilestones(10n, 6 * 86400)).toBe(true);
    expect(suggestMilestones(null, 0)).toBe(false);
  });
});

describe("liberación por hito", () => {
  it("la firma coincide con el vector del contrato", async () => {
    const vector = vectors.vectors.milestoneRelease;
    const m = vector.message;
    const typed = milestoneReleaseTypedData(deployment, { orderId: BigInt(m.orderId), index: Number(m.index), amount: BigInt(m.amount), rating: Number(m.rating), evidenceHash: m.evidenceHash, expiry: Number(m.expiry) });
    expect(hashTypedData(typed)).toBe(vector.digest);
    const signer = await recoverTypedDataAddress({ ...typed, signature: vector.signatures.payer as Hex });
    expect(signer).toBeTruthy();
  });

  it("el código QR vuelve igual y detecta vencidos o alterados", () => {
    const vector = vectors.vectors.milestoneRelease;
    const m = vector.message;
    const data = { orderId: BigInt(m.orderId), index: Number(m.index), amount: BigInt(m.amount), rating: Number(m.rating), evidenceHash: m.evidenceHash as Hex, expiry: Number(m.expiry) };
    const payee = "0xd9B0025F32f8d1b5010e81E77754bF35839Aa1BD" as const;
    const text = encodeMilestoneQr(data, payee, vector.signatures.payer);
    expect(parseMilestoneQr(text, data.expiry - 1)).toEqual({ data, payee, signature: vector.signatures.payer });
    expect(parseMilestoneQr(text, data.expiry + 1)).toBe("expired");
    expect(parseMilestoneQr(JSON.stringify({ ...JSON.parse(text), k: "x" }), 0)).toBe("invalid");
    expect(parseMilestoneQr(JSON.stringify({ ...JSON.parse(text), i: 99 }), 0)).toBe("invalid");
    expect(parseMilestoneQr("{", 0)).toBe("invalid");
  });

  it("codifica entregar y liberar un hito", () => {
    const real = selectors(realAbi);
    expect(encodeDeliverMilestone(1n, 0, ("0x" + "ab".repeat(32)) as Hex).slice(0, 10)).toBe(real.get("deliverMilestone"));
    const vector = vectors.vectors.milestoneRelease;
    const m = vector.message;
    const data = encodeReleaseMilestone({ orderId: BigInt(m.orderId), index: Number(m.index), amount: BigInt(m.amount), rating: Number(m.rating), evidenceHash: m.evidenceHash, expiry: Number(m.expiry) }, vector.signatures.payer);
    expect(data.slice(0, 10)).toBe(real.get("releaseMilestone"));
  });
});

describe("aportes", () => {
  const limits = contributionLimits(100_000_000n, 500n, 5000n);
  it("calcula mínimo y máximo desde los porcentajes del contrato", () => {
    expect(limits).toEqual({ min: 5_000_000n, max: 50_000_000n });
  });

  it("valida el rango, el restante y lo ya aportado", () => {
    expect(checkContribution(10_000_000n, 0n, 100_000_000n, 0n, limits)).toEqual({ ok: true });
    expect(checkContribution(0n, 0n, 100_000_000n, 0n, limits)).toMatchObject({ ok: false, reason: "zero" });
    expect(checkContribution(1_000_000n, 0n, 100_000_000n, 0n, limits)).toMatchObject({ ok: false, reason: "range" });
    expect(checkContribution(60_000_000n, 0n, 100_000_000n, 0n, limits)).toMatchObject({ ok: false, reason: "range" });
    expect(checkContribution(30_000_000n, 30_000_000n, 100_000_000n, 30_000_000n, limits)).toMatchObject({ ok: false, reason: "range" });
    expect(checkContribution(10_000_000n, 0n, 100_000_000n, 95_000_000n, limits)).toMatchObject({ ok: false, reason: "exceeds", remaining: 5_000_000n });
  });

  it("permite un aporte chico solo si completa la meta", () => {
    expect(checkContribution(2_000_000n, 0n, 100_000_000n, 98_000_000n, limits)).toEqual({ ok: true });
    expect(checkContribution(1_000_000n, 0n, 100_000_000n, 98_000_000n, limits)).toMatchObject({ ok: false, reason: "range" });
  });

  it("calcula avance y porcentajes", () => {
    expect(fundingProgress(25_000_000n, 100_000_000n)).toBe(25);
    expect(fundingProgress(0n, 0n)).toBe(0);
    expect(percentOf(12_500_000n, 100_000_000n)).toBe(12.5);
  });

  it("la ventana de veto se mide desde la propuesta", () => {
    expect(vetoOpen(1000, 86400, 2000)).toBe(true);
    expect(vetoOpen(1000, 86400, 1000 + 86400)).toBe(false);
    expect(vetoOpen(0, 86400, 100)).toBe(false);
  });

  it("codifica crear grupo, aportar y objetar", () => {
    const create = encodeCreateGroup(deployment, { amount: 100_000_000n, specHash: ("0x" + "ab".repeat(32)) as Hex, modality: 0, startsAt: 0, deadline: 0, category: 1 }, 1_900_000_000);
    const decoded = decodeFunctionData({ abi: groupAbi, data: create });
    expect(decoded.functionName).toBe("createGroupOrder");
    expect((decoded.args as unknown as [Record<string, unknown>, Record<string, unknown>])[1]).toMatchObject({ coordinator: "0x0000000000000000000000000000000000000000", fundingDeadline: 1_900_000_000 });
    const real = selectors(realAbi);
    const auth = { method: 0, nonce: 0n, deadline: 5n, signature: "0x12" as Hex };
    expect(encodeContribute(1n, 5n, auth).slice(0, 10)).toBe(real.get("contribute"));
    expect(encodeObject(1n, ("0x" + "ab".repeat(32)) as Hex, auth).slice(0, 10)).toBe(real.get("object"));
  });
});
