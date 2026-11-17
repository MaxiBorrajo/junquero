import { beforeAll, describe, expect, it } from "vitest";
import { generatePrivateKey } from "viem/accounts";
import type { Changa } from "../src/api/types";
import { agreementTypedData, ZERO_HASH } from "../src/chain/agreement";
import { encodeAbandon, encodeDeliverMilestone, encodeReleaseMilestone, milestoneReleaseTypedData, milestoneAbi } from "../src/chain/milestones";
import { OrderStatus } from "../src/chain/orderAbi";
import { sendViaRelay } from "../src/chain/orderActions";
import { publishChanga } from "../src/chain/publish";
import { milestoneTerms, milestoneTermsHash } from "../src/chain/terms";
import { evidenceBundleHash } from "../src/evidence/crypto";
import { emptyDraft } from "../src/publish/draft";
import { balanceOf, chain, chatKey, deployment, login, makeActor, mint, order, readNonces, relayDeps, uploadOne, until } from "./harness";

const payer = makeActor(generatePrivateKey());
const worker = makeActor(generatePrivateKey());
const second = makeActor(generatePrivateKey());

beforeAll(async () => {
  for (const [actor, name] of [[payer, "Ana"], [worker, "Beto"], [second, "Carla"]] as const) {
    await login(actor);
    await actor.api.send("PUT", "/me/profile", { name, categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
  }
  await mint(payer.address, 200_000_000n);
});

const milestonesOf = (orderId: number) => chain.readContract({ address: deployment.escrow, abi: milestoneAbi, functionName: "getMilestones", args: [BigInt(orderId)] });

describe("dejar el trabajo con un hito pagado", () => {
  let changa: Changa;
  let orderId: number;

  it("Ana y Beto acuerdan dos hitos y se paga el primero", async () => {
    const draft = {
      ...emptyDraft(), title: "Pintar el frente", category: 0, point: { lat: -34.6, lng: -58.4 }, approx: { lat: -34.601, lng: -58.401 },
      startsAt: Math.floor(Date.now() / 1000) + 7200, useMilestones: true, materials: "payer" as const,
      milestones: [
        { name: "Preparar la pared", amount: "60", criteria: "Pared lisa", evidence: "Foto de la pared" },
        { name: "Pintar", amount: "40", criteria: "Dos manos", evidence: "Foto del frente" },
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
    await until("acordada", async () => { const s = await order(orderId); return s.status === OrderStatus.Agreed && s.hasMilestones; });
    await until("acordada en el servidor", async () => (await payer.api.get<{ changas: Changa[] }>("/me/changas")).changas.find((c) => c.status === "agreed"));

    const workerKey = await chatKey(worker);
    await chatKey(payer);
    const hash = await uploadOne(worker, payer, workerKey, orderId, "pared.jpg");
    await sendViaRelay(relayDeps(worker), encodeDeliverMilestone(BigInt(orderId), 0, evidenceBundleHash([hash])));
    await until("hito entregado", async () => (await milestonesOf(orderId))[0]!.status === 1);
    const first = (await milestonesOf(orderId))[0]!;
    const data = { orderId: BigInt(orderId), index: 0, amount: first.amount, rating: 5, evidenceHash: first.evidenceHash, expiry: Math.floor(Date.now() / 1000) + 3600 };
    const signature = await payer.signTyped(milestoneReleaseTypedData(deployment, data));
    await sendViaRelay(relayDeps(worker), encodeReleaseMilestone(data, signature));
    await until("hito 1 pagado", async () => (await milestonesOf(orderId))[0]!.status === 2);
  });

  it("Beto no puede dejarlo sin motivo; con motivo el trabajo se reabre solo por lo que falta", async () => {
    const short = await worker.api.send("POST", `/me/orders/${orderId}/exit-reason`, { kind: "abandoned", reason: "no" }).then(() => "ok", (e: { status?: number }) => e.status ?? "error");
    expect(short).toBe(400);
    await worker.api.send("POST", `/me/orders/${orderId}/exit-reason`, { kind: "abandoned", reason: "Me surgió otro trabajo urgente" });
    await sendViaRelay(relayDeps(worker), encodeAbandon(BigInt(orderId)));
    await until("reabierta", async () => (await order(orderId)).status === OrderStatus.Open);

    const reopened = await until("changa reabierta en el servidor", async () => {
      const found = (await payer.api.get<{ changas: Changa[] }>(`/changas/${changa.specHash}`)).changas[0];
      return found && found.status === "open" && found.amount === "40000000" ? found : null;
    });
    expect(reopened.spec.doneMilestones?.map((m) => m.name)).toEqual(["Preparar la pared"]);
    expect(reopened.spec.milestones).toBeUndefined();

    const reasons = await payer.api.get<{ reasons: { kind: string; reason: string }[] }>(`/me/orders/${orderId}/exit-reasons`);
    expect(reasons.reasons[0]).toMatchObject({ kind: "abandoned", reason: "Me surgió otro trabajo urgente" });
  });

  it("Beto no puede volver a postularse; Carla sí y se acuerda un pago único por lo que falta", async () => {
    const again = await worker.api.send("PUT", `/me/applications/${changa.id}`, { message: "Perdón" }).then(() => 200, (e: { status?: number }) => e.status ?? 0);
    expect(again).toBe(403);

    await second.api.send("PUT", `/me/applications/${changa.id}`, { message: "Yo termino" });
    const expiry = Math.floor(Date.now() / 1000) + 7200;
    const terms = { orderId: BigInt(orderId), payer: payer.address, payee: second.address, price: 40_000_000n, specHash: changa.specHash as `0x${string}`, termsHash: ZERO_HASH, expiry };
    await payer.api.send("POST", `/me/orders/${orderId}/agreement`, { payee: second.address, price: "40000000", expiry, signature: await payer.signTyped(agreementTypedData(deployment, terms)) });
    await second.api.send("POST", `/me/orders/${orderId}/agreement/accept`, { signature: await second.signTyped(agreementTypedData(deployment, terms)) });
    await until("acordada de nuevo", async () => (await order(orderId)).status === OrderStatus.Agreed);
    const state = await order(orderId);
    expect(state.price).toBe(40_000_000n);
    expect(state.hasMilestones).toBe(false);
    expect(await balanceOf(worker.address)).toBe(60_000_000n);
  });
});
