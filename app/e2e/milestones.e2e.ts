import { beforeAll, describe, expect, it } from "vitest";
import { generatePrivateKey } from "viem/accounts";
import type { Changa } from "../src/api/types";
import { agreementTypedData } from "../src/chain/agreement";
import { milestoneAbi, milestoneReleaseTypedData, encodeDeliverMilestone, encodeMilestoneQr, encodeReleaseMilestone, parseMilestoneQr } from "../src/chain/milestones";
import { OrderStatus } from "../src/chain/orderAbi";
import { sendViaRelay } from "../src/chain/orderActions";
import { publishChanga } from "../src/chain/publish";
import { approveRemotely, releaseCall } from "../src/chain/remoteRelease";
import { milestoneTerms, milestoneTermsHash } from "../src/chain/terms";
import { evidenceBundleHash } from "../src/evidence/crypto";
import { emptyDraft } from "../src/publish/draft";
import { balanceOf, chain, chatKey, deployment, KEYS, login, makeActor, mint, order, readNonces, relayDeps, uploadOne, until } from "./harness";

const payer = makeActor(generatePrivateKey());
const worker = makeActor(generatePrivateKey());

beforeAll(async () => {
  await login(payer);
  await login(worker);
  await payer.api.send("PUT", "/me/profile", { name: "Paula H", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
  await worker.api.send("PUT", "/me/profile", { name: "Walter H", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
  await mint(payer.address, 200_000_000n);
});

const board = (orderId: number) => chain.readContract({ address: deployment.escrow, abi: milestoneAbi, functionName: "getPlan", args: [BigInt(orderId)] });

describe("changa con hitos de punta a punta", () => {
  let changa: Changa;
  let orderId: number;
  let payerKey: Awaited<ReturnType<typeof chatKey>>;
  let workerKey: Awaited<ReturnType<typeof chatKey>>;

  it("publica con el plan, el acuerdo se firma con el hash de los términos y el contrato lo acepta", async () => {
    const draft = {
      ...emptyDraft(),
      title: "Pintar el frente",
      category: 0,
      point: { lat: -34.6, lng: -58.4 },
      approx: { lat: -34.601, lng: -58.401 },
      startsAt: Math.floor(Date.now() / 1000) + 7200,
      useMilestones: true,
      materials: "payer" as const,
      milestones: [
        { name: "Preparar la pared", amount: "60", criteria: "Pared lisa y sin humedad", evidence: "Foto de la pared" },
        { name: "Pintar", amount: "40", criteria: "Dos manos de pintura", evidence: "Foto del frente" },
      ],
    };
    const nonces = readNonces(payer);
    const result = await publishChanga({ api: payer.api, deployment, account: payer.address, now: () => Math.floor(Date.now() / 1000), nonce: () => `e2e-${Date.now()}`, readBalance: nonces.balance, readTokenNonce: nonces.token, readForwarderNonce: nonces.forwarder, signTypedData: payer.signTyped }, draft, 100_000_000n);
    changa = await until("changa abierta", async () => {
      const found = (await payer.api.get<{ changas: Changa[] }>(`/changas/${result.specHash}`)).changas[0];
      return found && found.status === "open" ? found : null;
    });
    orderId = changa.orderId!;
    expect(changa.spec.milestones).toHaveLength(2);

    await worker.api.send("PUT", `/me/applications/${changa.id}`, { message: "Puedo" });
    const terms = milestoneTerms(changa.spec.milestones, changa.specHash as `0x${string}`)!;
    const expiry = Math.floor(Date.now() / 1000) + 7200;
    const agreement = { orderId: BigInt(orderId), payer: payer.address, payee: worker.address, price: 100_000_000n, specHash: changa.specHash as `0x${string}`, termsHash: milestoneTermsHash(terms), expiry };
    await payer.api.send("POST", `/me/orders/${orderId}/agreement`, { payee: worker.address, price: "100000000", expiry, signature: await payer.signTyped(agreementTypedData(deployment, agreement)) });
    await worker.api.send("POST", `/me/orders/${orderId}/agreement/accept`, { signature: await worker.signTyped(agreementTypedData(deployment, agreement)) });
    await until("acordada con hitos", async () => {
      const state = await order(orderId);
      return state.status === OrderStatus.Agreed && state.hasMilestones;
    });
    expect((await board(orderId)).count).toBe(2);
    await until("acordada en el servidor", async () => (await payer.api.get<{ changas: Changa[] }>("/me/changas")).changas.find((c) => c.status === "agreed"));
    payerKey = await chatKey(payer);
    workerKey = await chatKey(worker);
  });

  it("hito 1: entrega con evidencia, aprobación a distancia y cobro", async () => {
    const hash = await uploadOne(worker, payer, workerKey, orderId, "pared.jpg");
    await sendViaRelay(relayDeps(worker), encodeDeliverMilestone(BigInt(orderId), 0, evidenceBundleHash([hash])));
    await until("hito entregado", async () => (await chain.readContract({ address: deployment.escrow, abi: milestoneAbi, functionName: "getMilestones", args: [BigInt(orderId)] }))[0]!.status === 1);

    const milestones = await chain.readContract({ address: deployment.escrow, abi: milestoneAbi, functionName: "getMilestones", args: [BigInt(orderId)] });
    await approveRemotely({ api: payer.api, deployment, orderId, payee: worker.address, index: 0, amount: milestones[0]!.amount, rating: 5, evidenceHash: milestones[0]!.evidenceHash, now: Math.floor(Date.now() / 1000), sign: payer.signTyped });
    const waiting = await worker.api.get<{ release: any }>(`/me/orders/${orderId}/release`);
    expect(waiting.release.index).toBe(0);
    const before = await balanceOf(worker.address);
    await sendViaRelay(relayDeps(worker), releaseCall(orderId, waiting.release));
    await until("hito 1 pagado", async () => (await board(orderId)).next === 1);
    expect((await balanceOf(worker.address)) - before).toBe(60_000_000n);
  });

  it("hito 2: entrega y cobro con el código QR; la changa queda liquidada", async () => {
    const hash = await uploadOne(worker, payer, workerKey, orderId, "frente.jpg");
    await sendViaRelay(relayDeps(worker), encodeDeliverMilestone(BigInt(orderId), 1, evidenceBundleHash([hash])));
    await until("hito entregado", async () => (await chain.readContract({ address: deployment.escrow, abi: milestoneAbi, functionName: "getMilestones", args: [BigInt(orderId)] }))[1]!.status === 1);

    const milestones = await chain.readContract({ address: deployment.escrow, abi: milestoneAbi, functionName: "getMilestones", args: [BigInt(orderId)] });
    const data = { orderId: BigInt(orderId), index: 1, amount: milestones[1]!.amount, rating: 4, evidenceHash: milestones[1]!.evidenceHash, expiry: Math.floor(Date.now() / 1000) + 3600 };
    const signature = await payer.signTyped(milestoneReleaseTypedData(deployment, data));
    const text = encodeMilestoneQr(data, worker.address, signature);
    const scanned = parseMilestoneQr(text, Math.floor(Date.now() / 1000));
    expect(scanned).not.toBe("invalid");
    const before = await balanceOf(worker.address);
    await sendViaRelay(relayDeps(worker), encodeReleaseMilestone((scanned as any).data, (scanned as any).signature));
    await until("liquidada", async () => (await order(orderId)).status === OrderStatus.Settled);
    expect((await balanceOf(worker.address)) - before).toBe(40_000_000n);
    void KEYS;
  });
});
