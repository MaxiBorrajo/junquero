import { beforeAll, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";
import type { Changa } from "../src/api/types";
import { agreementTypedData, ZERO_HASH } from "../src/chain/agreement";
import { arbitrationAbi, CasePhase, VOTE_PAYEE } from "../src/chain/arbitrationAbi";
import { PERMIT_VALIDITY_SECONDS, permitTypedData, splitSignature } from "../src/chain/createOrder";
import { disputeCost, encodeCommitSeed, encodeCommitVote, encodeRespond, encodeRevealSeed, encodeRevealVote, encodeStakeWithPermit, phaseView, randomHex32, reasonHash, seedCommitment, voteCommitment } from "../src/chain/jury";
import { OrderStatus } from "../src/chain/orderAbi";
import { encodeDeliver, encodeOpenDispute, sendViaRelay } from "../src/chain/orderActions";
import { publishChanga } from "../src/chain/publish";
import { evidenceBundleHash, decryptFile, unwrapKey } from "../src/evidence/crypto";
import { shareWithJurors } from "../src/evidence/share";
import { uploadStatement } from "./statement";
import { emptyDraft } from "../src/publish/draft";
import { advanceTime, balanceOf, chain, chatKey, deployment, login, makeActor, mint, order, readNonces, relayDeps, RPC, uploadOne, until, type Actor } from "./harness";
import { readFileSync } from "node:fs";
import { resolveSeed, type SecretStorage } from "../src/jury/secrets";

const addresses = JSON.parse(readFileSync("/tmp/junquero-e2e/local-addresses.json", "utf8"));
const payer = makeActor(generatePrivateKey());
const worker = makeActor(generatePrivateKey());
const jurors = [0, 1, 2].map(() => makeActor(generatePrivateKey()));
const arb = deployment.arbitration;

const caseOf = (id: number) => chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "getCase", args: [BigInt(id)] });
const rel = (actor: Actor) => relayDeps(actor);
const toArbitration = (actor: Actor, data: `0x${string}`) => sendViaRelay(rel(actor), data, 1_500_000n, arb);

async function issueCredential(address: `0x${string}`) {
  const admin = createWalletClient({ account: privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"), chain: sepolia, transport: http(RPC) });
  const hash = await admin.writeContract({ address: addresses.credentials, abi: parseAbi(["function issue(address account, uint8 level)"]), functionName: "issue", args: [address, 0] });
  await chain.waitForTransactionReceipt({ hash });
}

beforeAll(async () => {
  for (const actor of [payer, worker, ...jurors]) await login(actor);
  await payer.api.send("PUT", "/me/profile", { name: "Paula D", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
  await worker.api.send("PUT", "/me/profile", { name: "Walter D", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
  await mint(payer.address, 200_000_000n);
  for (const j of jurors) {
    await mint(j.address, 50_000_000n);
    await issueCredential(j.address);
  }
});

describe("sorteo con pozo entre rondas y secreto derivado de la firma", () => {
  let changa: Changa;
  let orderId: number;
  let caseId: number;
  const keys = {} as Record<string, Awaited<ReturnType<typeof chatKey>>>;

  it("una changa mediana se acuerda y se entrega", async () => {
    const draft = { ...emptyDraft(), evidence: ["Foto del trabajo terminado"], title: "Instalar un portón", category: 0, point: { lat: -34.6, lng: -58.4 }, approx: { lat: -34.601, lng: -58.401 }, startsAt: Math.floor(Date.now() / 1000) + 7200, amount: "100" };
    const nonces = readNonces(payer);
    const result = await publishChanga({ api: payer.api, deployment, account: payer.address, now: () => Math.floor(Date.now() / 1000), nonce: () => `e2e-${Date.now()}`, readBalance: nonces.balance, readTokenNonce: nonces.token, readForwarderNonce: nonces.forwarder, signTypedData: payer.signTyped }, draft, 100_000_000n);
    changa = await until("abierta", async () => {
      const found = (await payer.api.get<{ changas: Changa[] }>(`/changas/${result.specHash}`)).changas[0];
      return found && found.status === "open" ? found : null;
    });
    orderId = changa.orderId!;
    await worker.api.send("PUT", `/me/applications/${changa.id}`, { message: "Lo instalo" });
    const expiry = Math.floor(Date.now() / 1000) + 7200;
    const terms = { orderId: BigInt(orderId), payer: payer.address, payee: worker.address, price: 100_000_000n, specHash: changa.specHash as `0x${string}`, termsHash: ZERO_HASH, expiry };
    await payer.api.send("POST", `/me/orders/${orderId}/agreement`, { payee: worker.address, price: "100000000", expiry, signature: await payer.signTyped(agreementTypedData(deployment, terms)) });
    await worker.api.send("POST", `/me/orders/${orderId}/agreement/accept`, { signature: await worker.signTyped(agreementTypedData(deployment, terms)) });
    await until("acordada", async () => (await payer.api.get<{ changas: Changa[] }>("/me/changas")).changas.find((x) => x.status === "agreed"));
    keys.worker = await chatKey(worker);
    keys.payer = await chatKey(payer);
    for (const j of jurors) keys[j.address] = await chatKey(j);
    const hash = await uploadOne(worker, payer, keys.worker!, orderId, "porton.jpg");
    await sendViaRelay(relayDeps(worker), encodeDeliver(BigInt(orderId), evidenceBundleHash([hash])));
    await until("entregada", async () => (await order(orderId)).status === OrderStatus.Delivered);
  });

  it("quien publicó abre el reclamo: relato cifrado, permiso por el costo y relayer", async () => {
    const reason = "El portón quedó torcido y no cierra bien.";
    await uploadStatement(payer, worker, keys.payer!, orderId, reason);
    const cost = disputeCost(1, 1_000_000n, 3);
    expect(cost).toBe(3_000_000n);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_VALIDITY_SECONDS);
    const signature = await payer.signTyped(permitTypedData(deployment, payer.address, cost, await readNonces(payer).token(), deadline));
    await sendViaRelay(relayDeps(payer), encodeOpenDispute(BigInt(orderId), reasonHash(reason), { method: 0, nonce: 0n, deadline, signature }));
    await until("reclamo abierto", async () => (await order(orderId)).status === OrderStatus.Disputed);
    const found = await until("caso indexado", async () => (await payer.api.get<{ asParty: { caseId: number; orderId: number }[] }>("/me/cases")).asParty.find((x) => x.orderId === orderId));
    caseId = found!.caseId;
    expect((await caseOf(caseId)).phase).toBe(CasePhase.Response);
    expect((await caseOf(caseId)).jurors).toBe(3);
    const mine = await worker.api.get<{ asParty: { caseId: number }[] }>("/me/cases");
    expect(mine.asParty.map((x) => x.caseId)).toContain(caseId);
  });

  it("la otra parte responde con su versión", async () => {
    const text = "El portón se instaló como se pidió.";
    await uploadStatement(worker, payer, keys.worker!, orderId, text);
    await toArbitration(worker, encodeRespond(BigInt(caseId), reasonHash(text)));
    await until("buscando jurados", async () => (await caseOf(caseId)).phase === CasePhase.Seed);
  });

  const memory = (): SecretStorage => {
    const data: Record<string, string> = {};
    return { get: async (k) => data[k] ?? null, set: async (k, v) => void (data[k] = v) };
  };
  const phone = new Map<string, SecretStorage>();
  const committers = (round: number) => chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "committersOf", args: [BigInt(caseId), round] });
  const revealers = (round: number) => chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "revealersOf", args: [BigInt(caseId), round] });
  const lower = (list: readonly string[]) => list.map((a) => a.toLowerCase());

  it("los jurados depositan garantía; en la ronda 0 solo dos se anotan y revelan (el secreto sale de la firma)", async () => {
    for (const j of jurors) {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_VALIDITY_SECONDS);
      const signature = await j.signTyped(permitTypedData(deployment, j.address, 20_000_000n, await readNonces(j).token(), deadline, arb));
      const { v, r, s } = splitSignature(signature);
      await toArbitration(j, encodeStakeWithPermit(20_000_000n, deadline, v, r, s));
    }
    await until("garantías", async () => (await chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "account", args: [jurors[2]!.address] })).staked === 20_000_000n);
    await until("reclamo abierto para jurados", async () => ((await jurors[0]!.api.get<{ openForJury: { caseId: number }[] }>("/me/cases")).openForJury.some((x) => x.caseId === caseId) ? true : null));
    // Anotarse: el secreto se calcula con la firma de la billetera y se guarda en "el teléfono" de cada jurado.
    for (const j of jurors.slice(0, 2)) {
      const storage = memory();
      phone.set(j.address, storage);
      const secret = await resolveSeed(storage, j.signMessage, j.address, caseId, 0);
      await toArbitration(j, encodeCommitSeed(BigInt(caseId), seedCommitment(BigInt(caseId), j.address, secret)));
    }
    await until("dos anotados", async () => (await committers(0)).length === 2);
    await advanceTime(400);
    // Revelar desde "otro teléfono" (sin nada guardado): el secreto se recalcula con la misma firma y el contrato lo acepta.
    for (const j of jurors.slice(0, 2)) {
      const fresh = memory();
      const secret = await resolveSeed(fresh, j.signMessage, j.address, caseId, 0);
      await toArbitration(j, encodeRevealSeed(BigInt(caseId), secret));
    }
    await until("dos revelados", async () => (await revealers(0)).length === 2);
    await advanceTime(400);
  });

  it("A: faltan jurados, se abre la ronda 1 y los dos que revelaron pasan solos, sin reanotarse", async () => {
    await until("ronda 1", async () => ((await caseOf(caseId)).round === 1 ? true : null), 60);
    expect((await caseOf(caseId)).phase).toBe(CasePhase.Seed);
    const expected = lower(jurors.slice(0, 2).map((j) => j.address)).sort();
    expect(lower(await committers(1)).sort()).toEqual(expected);
    expect(lower(await revealers(1)).sort()).toEqual(expected);
  });

  it("A: quien pasó no puede volver a anotarse en esa ronda", async () => {
    const j = jurors[0]!;
    const secret = await resolveSeed(phone.get(j.address)!, j.signMessage, j.address, caseId, 1);
    await expect(toArbitration(j, encodeCommitSeed(BigInt(caseId), seedCommitment(BigInt(caseId), j.address, secret)))).rejects.toBeDefined();
    expect(await committers(1)).toHaveLength(2);
  });

  it("A: en la ronda 1 se suma un jurado nuevo y con los dos que pasaron se sortean los tres", async () => {
    const j = jurors[2]!;
    const storage = memory();
    const secret = await resolveSeed(storage, j.signMessage, j.address, caseId, 1);
    await toArbitration(j, encodeCommitSeed(BigInt(caseId), seedCommitment(BigInt(caseId), j.address, secret)));
    await until("tercer anotado", async () => (await committers(1)).length === 3);
    await advanceTime(400);
    await toArbitration(j, encodeRevealSeed(BigInt(caseId), secret));
    await until("tercer revelado", async () => (await revealers(1)).length === 3);
    await advanceTime(400);
    await until("jurado sorteado", async () => (await caseOf(caseId)).phase === CasePhase.Vote, 60);
    const drawn = await chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "jurorsOf", args: [BigInt(caseId)] });
    expect(lower(drawn).sort()).toEqual(lower(jurors.map((x) => x.address)).sort());
  });
});
