import { beforeAll, describe, expect, it } from "vitest";
import { generatePrivateKey } from "viem/accounts";
import type { Changa } from "../src/api/types";
import { agreementTypedData } from "../src/chain/agreement";
import { encodeDeliverMilestone, milestoneAbi } from "../src/chain/milestones";
import { OrderStatus } from "../src/chain/orderAbi";
import { sendViaRelay } from "../src/chain/orderActions";
import { publishChanga } from "../src/chain/publish";
import { milestoneTerms, milestoneTermsHash } from "../src/chain/terms";
import { evidenceBundleHash } from "../src/evidence/crypto";
import { emptyDraft } from "../src/publish/draft";
import { advanceTime, balanceOf, chain, chatKey, deployment, login, makeActor, mint, order, readNonces, relayDeps, uploadOne, until } from "./harness";

const payer = makeActor(generatePrivateKey());
const worker = makeActor(generatePrivateKey());

beforeAll(async () => {
  await login(payer);
  await login(worker);
  await payer.api.send("PUT", "/me/profile", { name: "Ana", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
  await worker.api.send("PUT", "/me/profile", { name: "Beto", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
  await mint(payer.address, 200_000_000n);
});

const board = (orderId: number) => chain.readContract({ address: deployment.escrow, abi: milestoneAbi, functionName: "getPlan", args: [BigInt(orderId)] });
const milestonesOf = (orderId: number) => chain.readContract({ address: deployment.escrow, abi: milestoneAbi, functionName: "getMilestones", args: [BigInt(orderId)] });

describe("liberación automática de un hito (6.3)", () => {
  let changa: Changa;
  let orderId: number;

  it("Ana publica con dos hitos, Beto se postula y firman el acuerdo", async () => {
    const draft = {
      ...emptyDraft(), title: "Pintar el frente", category: 0, point: { lat: -34.6, lng: -58.4 }, approx: { lat: -34.601, lng: -58.401 },
      startsAt: Math.floor(Date.now() / 1000) + 7200, useMilestones: true, materials: "payer" as const,
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
    await worker.api.send("PUT", `/me/applications/${changa.id}`, { message: "Puedo" });
    const terms = milestoneTerms(changa.spec.milestones, changa.specHash as `0x${string}`)!;
    const expiry = Math.floor(Date.now() / 1000) + 7200;
    const agreement = { orderId: BigInt(orderId), payer: payer.address, payee: worker.address, price: 100_000_000n, specHash: changa.specHash as `0x${string}`, termsHash: milestoneTermsHash(terms), expiry };
    await payer.api.send("POST", `/me/orders/${orderId}/agreement`, { payee: worker.address, price: "100000000", expiry, signature: await payer.signTyped(agreementTypedData(deployment, agreement)) });
    await worker.api.send("POST", `/me/orders/${orderId}/agreement/accept`, { signature: await worker.signTyped(agreementTypedData(deployment, agreement)) });
    await until("acordada con hitos", async () => { const s = await order(orderId); return s.status === OrderStatus.Agreed && s.hasMilestones; });
    await until("acordada en el servidor", async () => (await payer.api.get<{ changas: Changa[] }>("/me/changas")).changas.find((c) => c.status === "agreed"));
  });

  it("Beto entrega el hito 1 y Ana no responde: a las 71 h sigue en garantía", async () => {
    const workerKey = await chatKey(worker);
    await chatKey(payer);
    const hash = await uploadOne(worker, payer, workerKey, orderId, "pared.jpg");
    await sendViaRelay(relayDeps(worker), encodeDeliverMilestone(BigInt(orderId), 0, evidenceBundleHash([hash])));
    await until("hito entregado", async () => (await milestonesOf(orderId))[0]!.status === 1);

    await advanceTime(71 * 3600);
    for (let i = 0; i < 4; i += 1) await until("tick", async () => true);
    expect((await board(orderId)).next).toBe(0);
    expect((await milestonesOf(orderId))[0]!.status).toBe(1);
  });

  it("pasadas las 72 h el servidor libera el hito solo y Beto cobra 60", async () => {
    const before = await balanceOf(worker.address);
    await advanceTime(Math.floor(1.5 * 3600));
    await until("hito liberado solo", async () => (await board(orderId)).next === 1, 60);
    expect((await balanceOf(worker.address)) - before).toBe(60_000_000n);
    expect((await order(orderId)).status).not.toBe(OrderStatus.Settled);
    expect((await milestonesOf(orderId))[1]!.status).toBe(0);
  });
});
