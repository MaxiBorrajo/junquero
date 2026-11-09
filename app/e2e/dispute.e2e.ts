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
import type { EvidenceItem } from "../src/data/useOrder";

const addresses = JSON.parse(readFileSync("/tmp/junquero-e2e/local-addresses.json", "utf8"));
const payer = makeActor(generatePrivateKey());
const worker = makeActor(generatePrivateKey());
const jurors = [0, 1, 2, 3].map(() => makeActor(generatePrivateKey()));
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

describe("reclamo con jurado de punta a punta", () => {
  let changa: Changa;
  let orderId: number;
  let caseId: number;
  const keys = {} as Record<string, Awaited<ReturnType<typeof chatKey>>>;

  it("una changa mediana se acuerda y se entrega", async () => {
    const draft = { ...emptyDraft(), title: "Instalar un portón", category: 0, point: { lat: -34.6, lng: -58.4 }, approx: { lat: -34.601, lng: -58.401 }, startsAt: Math.floor(Date.now() / 1000) + 7200, amount: "100" };
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

  it("los jurados depositan garantía y se anotan con semilla; después la revelan", async () => {
    for (const j of jurors) {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_VALIDITY_SECONDS);
      const signature = await j.signTyped(permitTypedData(deployment, j.address, 20_000_000n, await readNonces(j).token(), deadline, arb));
      const { v, r, s } = splitSignature(signature);
      await toArbitration(j, encodeStakeWithPermit(20_000_000n, deadline, v, r, s));
    }
    await until("garantías", async () => (await chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "account", args: [jurors[3]!.address] })).staked === 20_000_000n);
    const open = await jurors[0]!.api.get<{ openForJury: { caseId: number }[] }>("/me/cases");
    expect(open.openForJury.map((x) => x.caseId)).toContain(caseId);
    const secrets: Record<string, `0x${string}`> = {};
    for (const j of jurors) {
      expect(await chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "isEligible", args: [j.address, BigInt(caseId)] })).toBe(true);
      secrets[j.address] = randomHex32((n) => crypto.getRandomValues(new Uint8Array(n)));
      await toArbitration(j, encodeCommitSeed(BigInt(caseId), seedCommitment(BigInt(caseId), j.address, secrets[j.address]!)));
    }
    await until("semillas comprometidas", async () => (await chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "committersOf", args: [BigInt(caseId), 0] })).length === 4);
    await advanceTime(400);
    for (const j of jurors) await toArbitration(j, encodeRevealSeed(BigInt(caseId), secrets[j.address]!));
    await until("semillas reveladas", async () => (await chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "revealersOf", args: [BigInt(caseId), 0] })).length === 4);
    await advanceTime(400);
  });

  it("se sortea el jurado (lo hace el robot) y las partes comparten sus pruebas solo con los sorteados", async () => {
    await until("jurado sorteado", async () => (await caseOf(caseId)).phase === CasePhase.Vote, 60);
    const drawn = await chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "jurorsOf", args: [BigInt(caseId)] });
    expect(drawn).toHaveLength(3);
    await until("jurado indexado", async () => (await jurors.find((j) => j.address === drawn[0])!.api.get<{ asJuror: unknown[] }>("/me/cases")).asJuror.length === 1);

    const lowered = drawn.map((a) => a.toLowerCase());
    for (const [actor, key] of [[payer, keys.payer!], [worker, keys.worker!]] as const) {
      const list = await actor.api.get<{ evidence: EvidenceItem[] }>(`/me/orders/${orderId}/evidence`);
      const sent = await shareWithJurors({ api: actor.api, address: actor.address, mine: key, orderId, items: list.evidence, jurors: lowered });
      expect(sent).toBeGreaterThan(0);
    }
    const jurorActor = jurors.find((j) => j.address === drawn[0])!;
    const seen = await jurorActor.api.get<{ role: string; evidence: EvidenceItem[] }>(`/me/orders/${orderId}/evidence`);
    expect(seen.role).toBe("juror");
    expect(seen.evidence.length).toBeGreaterThanOrEqual(3);
    const statement = seen.evidence.find((e) => e.uploader.toLowerCase() === payer.address.toLowerCase())!;
    const senderKey = keys.payer!.publicKey;
    const symmetric = unwrapKey(statement.wrappedKey!, senderKey, keys[jurorActor.address]!);
    expect(symmetric).not.toBeNull();
    const bytes = await jurorActor.api.bytes(`/me/orders/${orderId}/evidence/${statement.hash}`);
    expect(new TextDecoder().decode(decryptFile(bytes, symmetric!)!)).toBe("El portón quedó torcido y no cierra bien.");

    const outsider = jurors.find((j) => !lowered.includes(j.address.toLowerCase()))!;
    await expect(outsider.api.get(`/me/orders/${orderId}/evidence`)).rejects.toMatchObject({ status: 403 });
  });

  it("los jurados votan en dos pasos y el veredicto favorece a quien hizo la changa", async () => {
    const drawn = (await chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "jurorsOf", args: [BigInt(caseId)] })).map((a) => a.toLowerCase());
    const panel = jurors.filter((j) => drawn.includes(j.address.toLowerCase()));
    const salts: Record<string, `0x${string}`> = {};
    for (const j of panel) {
      salts[j.address] = randomHex32((n) => crypto.getRandomValues(new Uint8Array(n)));
      await toArbitration(j, encodeCommitVote(BigInt(caseId), voteCommitment(BigInt(caseId), j.address, VOTE_PAYEE, salts[j.address]!)));
    }
    await until("votos comprometidos", async () => (await Promise.all(panel.map((j) => chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "jurorCase", args: [BigInt(caseId), j.address] })))).every((x) => x.voteCommit !== `0x${"0".repeat(64)}`));
    await advanceTime(400);
    for (const j of panel) await toArbitration(j, encodeRevealVote(BigInt(caseId), VOTE_PAYEE, salts[j.address]!));
    await until("votos revelados", async () => (await caseOf(caseId)).revealedVotes === 3);
    expect((await caseOf(caseId)).payeeVotes).toBe(3);

    await until("veredicto", async () => (await caseOf(caseId)).phase === CasePhase.Decided, 60);
    expect((await caseOf(caseId)).verdictPayee).toBe(true);
    expect(phaseView(await (async () => { const c = await caseOf(caseId); return { ...c, orderId: Number(c.orderId), commitEnd: c.commitEnd, revealEnd: c.revealEnd, appealEnd: c.appealEnd } as never; })(), 0)).toBeDefined();
  });

  it("vence el plazo de apelación y se ejecuta: el prestador cobra y los jurados con mayoría reciben su recompensa", async () => {
    await advanceTime(400);
    const before = await balanceOf(worker.address);
    await until("ejecutado", async () => (await order(orderId)).status === OrderStatus.Settled, 60);
    expect((await balanceOf(worker.address)) - before).toBeGreaterThanOrEqual(100_000_000n);
    const rewarded = await Promise.all(jurors.map((j) => chain.readContract({ address: arb, abi: arbitrationAbi, functionName: "rewards", args: [deployment.token, j.address] })));
    expect(rewarded.filter((x) => x > 0n)).toHaveLength(3);
    expect(rewarded.reduce((a, b) => a + b, 0n)).toBe(3_000_000n);
  });
});
