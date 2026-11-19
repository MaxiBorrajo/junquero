import { beforeAll, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, keccak256, parseAbi, toBytes } from "viem";
import { sepolia } from "viem/chains";
import type { Changa } from "../src/api/types";
import { agreementTypedData, ZERO_HASH } from "../src/chain/agreement";
import { arbitrationAbi, CasePhase, VOTE_PAYEE, VOTE_PAYER } from "../src/chain/arbitrationAbi";
import { PERMIT_VALIDITY_SECONDS, permitTypedData, splitSignature } from "../src/chain/createOrder";
import { encodeAppealWithPermit, encodeCommitSeed, encodeCommitVote, encodeRespond, encodeRevealSeed, encodeRevealVote, encodeStakeWithPermit, randomHex32, reasonHash, seedCommitment, voteCommitment } from "../src/chain/jury";
import { OrderStatus } from "../src/chain/orderAbi";
import { encodeDeliver, encodeOpenDispute, sendViaRelay } from "../src/chain/orderActions";
import { publishChanga } from "../src/chain/publish";
import { evidenceBundleHash } from "../src/evidence/crypto";
import { emptyDraft } from "../src/publish/draft";
import { advanceTime, balanceOf, chain, chatKey, deployment, KEYS, login, makeActor, mint, order, readNonces, relayDeps, RPC, uploadOne, until, type Actor } from "./harness";
import { readFileSync } from "node:fs";

// Cubre del plan: 8.2 (reclamo chico), 8.3.8 (jurado que no revela), 8.3.9 (apelación),
// 8.3.10 y 11.7 (resolución de emergencia) y, del panel, 11.5 (usuarios) y 11.8 (registro de acciones).
// 8.4 (5 jurados) no entra: una changa de más de 300 USDC exige testigo para entregar y la app todavía no lo ofrece (sección 14).
const addresses = JSON.parse(readFileSync("/tmp/junquero-e2e/local-addresses.json", "utf8"));
const arb = deployment.arbitration;
const DEPLOYER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const JUROR_FEE = 1_000_000n;
const pool = Array.from({ length: 12 }, () => makeActor(generatePrivateKey()));

const caseOf = (id: number) => chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "getCase", args: [BigInt(id)] });
const accountOf = (address: `0x${string}`) => chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "account", args: [address] });
const toArbitration = (actor: Actor, data: `0x${string}`) => sendViaRelay(relayDeps(actor), data, 1_500_000n, arb);
const now = () => Math.floor(Date.now() / 1000);
const deadlineIn = () => BigInt(now() + PERMIT_VALIDITY_SECONDS);
const rand = () => randomHex32((n) => crypto.getRandomValues(new Uint8Array(n)));

async function deployerWallet() {
  return createWalletClient({ account: privateKeyToAccount(DEPLOYER), chain: sepolia, transport: http(RPC) });
}

async function issueCredential(address: `0x${string}`) {
  const hash = await (await deployerWallet()).writeContract({ address: addresses.credentials, abi: parseAbi(["function issue(address account, uint8 level)"]), functionName: "issue", args: [address, 0] });
  await chain.waitForTransactionReceipt({ hash });
}

beforeAll(async () => {
  for (const actor of pool) {
    await login(actor);
    await mint(actor.address, 50_000_000n);
    await issueCredential(actor.address);
    const deadline = deadlineIn();
    const signature = await actor.signTyped(permitTypedData(deployment, actor.address, 20_000_000n, await readNonces(actor).token(), deadline, arb));
    const { v, r, s } = splitSignature(signature);
    await toArbitration(actor, encodeStakeWithPermit(20_000_000n, deadline, v, r, s));
  }
  await until("garantías", async () => (await accountOf(pool[11]!.address)).staked === 20_000_000n);
}, 400_000);

interface Job { payer: Actor; worker: Actor; orderId: number }

// Una changa acordada y entregada, con cuentas nuevas para no mezclar saldos entre pruebas.
async function deliveredJob(amount: number, title: string): Promise<Job> {
  const payer = makeActor(generatePrivateKey());
  const worker = makeActor(generatePrivateKey());
  for (const [actor, name] of [[payer, "Ana"], [worker, "Beto"]] as const) {
    await login(actor);
    await actor.api.send("PUT", "/me/profile", { name, categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
  }
  await mint(payer.address, BigInt(amount + 30) * 1_000_000n);
  const draft = { ...emptyDraft(), evidence: ["Foto del trabajo terminado"], title, category: 0, point: { lat: -34.6, lng: -58.4 }, approx: { lat: -34.601, lng: -58.401 }, startsAt: now() + 7200, amount: String(amount) };
  const nonces = readNonces(payer);
  const result = await publishChanga({ api: payer.api, deployment, account: payer.address, now, nonce: () => `e2e-${Date.now()}`, readBalance: nonces.balance, readTokenNonce: nonces.token, readForwarderNonce: nonces.forwarder, signTypedData: payer.signTyped }, draft, BigInt(amount) * 1_000_000n);
  const changa = await until("abierta", async () => {
    const found = (await payer.api.get<{ changas: Changa[] }>(`/changas/${result.specHash}`)).changas[0];
    return found && found.status === "open" ? found : null;
  });
  const orderId = changa.orderId!;
  await worker.api.send("PUT", `/me/applications/${changa.id}`, { message: "Lo hago" });
  const price = BigInt(amount) * 1_000_000n;
  const expiry = now() + 7200;
  const terms = { orderId: BigInt(orderId), payer: payer.address, payee: worker.address, price, specHash: changa.specHash as `0x${string}`, termsHash: ZERO_HASH, expiry };
  await payer.api.send("POST", `/me/orders/${orderId}/agreement`, { payee: worker.address, price: price.toString(), expiry, signature: await payer.signTyped(agreementTypedData(deployment, terms)) });
  await worker.api.send("POST", `/me/orders/${orderId}/agreement/accept`, { signature: await worker.signTyped(agreementTypedData(deployment, terms)) });
  await until("acordada", async () => (await order(orderId)).status === OrderStatus.Agreed);
  await until("acordada en el servidor", async () => (await payer.api.get<{ changas: Changa[] }>("/me/changas")).changas.find((c) => c.status === "agreed"));
  const workerKey = await chatKey(worker);
  await chatKey(payer);
  const hash = await uploadOne(worker, payer, workerKey, orderId, "trabajo.jpg");
  await sendViaRelay(relayDeps(worker), encodeDeliver(BigInt(orderId), evidenceBundleHash([hash])));
  await until("entregada", async () => (await order(orderId)).status === OrderStatus.Delivered);
  return { payer, worker, orderId };
}

async function openDispute(job: Job, cost: bigint, reason: string): Promise<void> {
  const deadline = deadlineIn();
  const signature = await job.payer.signTyped(permitTypedData(deployment, job.payer.address, cost, await readNonces(job.payer).token(), deadline));
  await sendViaRelay(relayDeps(job.payer), encodeOpenDispute(BigInt(job.orderId), reasonHash(reason), { method: 0, nonce: 0n, deadline, signature }));
}

async function openJuryCase(job: Job, jurors: number): Promise<number> {
  await openDispute(job, JUROR_FEE * BigInt(jurors), "El trabajo no quedó como se pidió.");
  await until("reclamo abierto", async () => (await order(job.orderId)).status === OrderStatus.Disputed);
  const found = await until("caso indexado", async () => (await job.payer.api.get<{ asParty: { caseId: number; orderId: number }[] }>("/me/cases")).asParty.find((x) => x.orderId === job.orderId));
  const caseId = found!.caseId;
  expect((await caseOf(caseId)).jurors).toBe(jurors);
  await toArbitration(job.worker, encodeRespond(BigInt(caseId), reasonHash("Está hecho como se pidió.")));
  await until("buscando jurados", async () => (await caseOf(caseId)).phase === CasePhase.Seed);
  return caseId;
}

// Una ronda de semillas: los que se anotan comprometen y revelan, y el robot sortea.
async function seedRound(caseId: number, candidates: Actor[]): Promise<void> {
  const round = (await caseOf(caseId)).round;
  const secrets: Record<string, `0x${string}`> = {};
  for (const j of candidates) {
    secrets[j.address] = rand();
    await toArbitration(j, encodeCommitSeed(BigInt(caseId), seedCommitment(BigInt(caseId), j.address, secrets[j.address]!)));
  }
  await until("semillas comprometidas", async () => (await chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "committersOf", args: [BigInt(caseId), round] })).length === candidates.length);
  await advanceTime(400);
  for (const j of candidates) await toArbitration(j, encodeRevealSeed(BigInt(caseId), secrets[j.address]!));
  await until("semillas reveladas", async () => (await chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "revealersOf", args: [BigInt(caseId), round] })).length === candidates.length);
  await advanceTime(400);
  await until("jurado sorteado", async () => (await caseOf(caseId)).phase === CasePhase.Vote, 60);
}

const panelOf = async (caseId: number, from: number): Promise<Actor[]> => {
  const all = (await chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "jurorsOf", args: [BigInt(caseId)] })).slice(from);
  return all.map((a) => pool.find((j) => j.address === a)!);
};

// Votan en dos pasos: los que tienen un voto lo comprometen; revelan solo los que se indican.
async function vote(caseId: number, panel: Actor[], votes: number[], reveal: boolean[]): Promise<void> {
  const salts = panel.map(() => rand());
  for (const [i, j] of panel.entries()) await toArbitration(j, encodeCommitVote(BigInt(caseId), voteCommitment(BigInt(caseId), j.address, votes[i]!, salts[i]!)));
  await until("votos comprometidos", async () => (await Promise.all(panel.map((j) => chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "jurorCase", args: [BigInt(caseId), j.address] })))).every((x) => x.voteCommit !== `0x${"0".repeat(64)}`));
  await advanceTime(400);
  for (const [i, j] of panel.entries()) {
    if (!reveal[i]) continue;
    const hash = await toArbitration(j, encodeRevealVote(BigInt(caseId), votes[i]!, salts[i]!));
    // El relayer devuelve el hash antes de minar: se espera el recibo para que el voto cuente antes de avanzar el reloj.
    expect((await chain.waitForTransactionReceipt({ hash })).status).toBe("success");
  }
}

describe("8.2 reclamo chico (sin jurado)", () => {
  it("un reclamo por 10 USDC se reparte 50/50 al instante", async () => {
    const job = await deliveredJob(10, "Armar una repisa");
    const before = { payer: await balanceOf(job.payer.address), worker: await balanceOf(job.worker.address) };
    await openDispute(job, 0n, "No me gustó el acabado.");
    await until("resuelto", async () => (await order(job.orderId)).status !== OrderStatus.Disputed);
    const moved = { payer: (await balanceOf(job.payer.address)) - before.payer, worker: (await balanceOf(job.worker.address)) - before.worker };
    expect(moved.worker).toBeGreaterThan(4_000_000n);
    expect(moved.worker).toBeLessThanOrEqual(5_000_000n);
    expect(moved.payer).toBeGreaterThan(4_000_000n);
    expect(moved.payer).toBeLessThanOrEqual(5_000_000n);
  });
});

describe("8.3.8 y 8.3.9 jurado que no revela y apelación", { timeout: 600_000 }, () => {
  let job: Job;
  let caseId: number;
  let firstPanel: Actor[];
  let balanceBeforeAppeal = 0n;

  it("un jurado vota pero no revela: se decide con los otros dos y el ausente pierde la garantía del caso", async () => {
    job = await deliveredJob(100, "Instalar un portón");
    caseId = await openJuryCase(job, 3);
    await seedRound(caseId, pool);
    firstPanel = await panelOf(caseId, 0);
    expect(firstPanel).toHaveLength(3);
    const stakeBefore = (await accountOf(firstPanel[2]!.address)).staked;
    await vote(caseId, firstPanel, [VOTE_PAYEE, VOTE_PAYEE, VOTE_PAYEE], [true, true, false]);
    await advanceTime(400);
    await until("veredicto", async () => (await caseOf(caseId)).phase === CasePhase.Decided, 60);
    expect((await caseOf(caseId)).revealedVotes).toBe(2);
    expect((await caseOf(caseId)).verdictPayee).toBe(true);
    expect(stakeBefore - (await accountOf(firstPanel[2]!.address)).staked).toBe(10_000_000n);
  });

  it("quien perdió apela, paga el costo ampliado y se sortea un jurado nuevo de 7, sin los anteriores", async () => {
    const before = await balanceOf(job.payer.address);
    balanceBeforeAppeal = before;
    const fee = JUROR_FEE * 7n;
    const deadline = deadlineIn();
    const signature = await job.payer.signTyped(permitTypedData(deployment, job.payer.address, fee, await readNonces(job.payer).token(), deadline, arb));
    const { v, r, s } = splitSignature(signature);
    await toArbitration(job.payer, encodeAppealWithPermit(BigInt(caseId), deadline, v, r, s));
    await until("apelación abierta", async () => (await caseOf(caseId)).appealed);
    expect((await caseOf(caseId)).jurors).toBe(7);
    expect(before - (await balanceOf(job.payer.address))).toBe(fee);

    const candidates = pool.filter((j) => !firstPanel.includes(j));
    expect(candidates).toHaveLength(9);
    await seedRound(caseId, candidates);
    const second = await panelOf(caseId, (await caseOf(caseId)).roundStart);
    expect(second).toHaveLength(7);
    expect(second.some((j) => firstPanel.includes(j))).toBe(false);
    await vote(caseId, second, second.map(() => VOTE_PAYER), second.map(() => true));
    await until("resuelto en apelación", async () => (await caseOf(caseId)).phase === CasePhase.Resolved, 60);
  });

  it("la apelación cambia el veredicto: quien publicó recupera el pago", async () => {
    await until("orden resuelta", async () => (await order(job.orderId)).status !== OrderStatus.Disputed);
    // Con el veredicto a favor de quien publicó, quien trabajó no cobra nada del pago en garantía.
    expect(await balanceOf(job.worker.address)).toBe(0n);
    // Recupera el pago (100). El costo de apelar (7) solo se devuelve de lo que habría cobrado quien perdió, y acá no le tocaba nada: no vuelve.
    expect((await balanceOf(job.payer.address)) - balanceBeforeAppeal).toBe(93_000_000n);
  });
});

describe("8.3.10 y 11.7 sin jurados suficientes: resolución de emergencia", { timeout: 600_000 }, () => {
  let job: Job;
  let caseId: number;
  const admin = makeActor(KEYS.admin);

  it("si nadie se anota tras varias rondas de sorteo, el caso pasa a emergencia y aparece en el panel", async () => {
    job = await deliveredJob(100, "Pintar una pared");
    caseId = await openJuryCase(job, 3);
    for (let i = 0; i < 4; i += 1) {
      await advanceTime(700);
      const target = i + 1;
      await until(`ronda ${target} sin jurados`, async () => {
        const c = await caseOf(caseId);
        return c.phase === CasePhase.NeedsEmergency || c.round >= target;
      }, 60);
    }
    expect((await caseOf(caseId)).phase).toBe(CasePhase.NeedsEmergency);
    await login(admin);
    const list = await until("aparece en el panel", async () => (await admin.api.get<{ cases: { caseId: number }[] }>("/admin/cases")).cases.find((c) => c.caseId === caseId));
    expect(list).toBeDefined();
  });

  it("quien administra resuelve como árbitro, el contrato reparte y queda en el registro con motivo", async () => {
    const reason = "Sin jurados disponibles: se resuelve a favor de quien hizo la changa.";
    const wallet = await deployerWallet();
    const before = await balanceOf(job.worker.address);
    const txHash = await wallet.writeContract({ address: arb, abi: parseAbi(["function resolveEmergency(uint256 caseId, bool payeeWins, bytes32 reasonHash)"]), functionName: "resolveEmergency", args: [BigInt(caseId), true, keccak256(toBytes(reason))] });
    await chain.waitForTransactionReceipt({ hash: txHash });
    await until("orden resuelta", async () => (await order(job.orderId)).status !== OrderStatus.Disputed);
    expect((await balanceOf(job.worker.address)) - before).toBeGreaterThan(90_000_000n);
    await admin.api.send("POST", `/admin/cases/${caseId}/emergency`, { payeeWins: true, reason, txHash });
    const log = await admin.api.get<{ log: { action: string; target: string; reason: string }[] }>("/admin/log");
    expect(log.log.some((entry) => entry.action === "emergency_resolved" && entry.target === `case:${caseId}` && entry.reason.includes(reason))).toBe(true);
  });

  it("11.5 el panel lista a los usuarios con su verificación", async () => {
    const users = await admin.api.get<{ users: { address: string }[] }>(`/admin/users?q=${job.payer.address.slice(0, 8)}`);
    expect(users.users.some((u) => u.address.toLowerCase() === job.payer.address.toLowerCase())).toBe(true);
  });
});
