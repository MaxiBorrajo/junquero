import { beforeAll, describe, expect, it } from "vitest";
import { generatePrivateKey } from "viem/accounts";
import type { Changa } from "../src/api/types";
import { agreementTypedData, ZERO_HASH } from "../src/chain/agreement";
import { OrderStatus } from "../src/chain/orderAbi";
import { encodeDeliver, sendViaRelay } from "../src/chain/orderActions";
import { publishChanga } from "../src/chain/publish";
import { evidenceBundleHash } from "../src/evidence/crypto";
import { emptyDraft } from "../src/publish/draft";
import { advanceTime, balanceOf, chatKey, deployment, login, makeActor, mint, order, readNonces, relayDeps, uploadOne, until } from "./harness";

const payer = makeActor(generatePrivateKey());
const worker = makeActor(generatePrivateKey());
const PRICE = 25_000_000n;

beforeAll(async () => {
  await login(payer);
  await login(worker);
  await payer.api.send("PUT", "/me/profile", { name: "Ana", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
  await worker.api.send("PUT", "/me/profile", { name: "Beto", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
  await mint(payer.address, 100_000_000n);
});

describe("liberación automática de una changa corta (5.9)", () => {
  let changa: Changa;
  let orderId: number;

  it("Ana publica, Beto se postula y firman el acuerdo", async () => {
    const draft = { ...emptyDraft(), evidence: ["Foto del trabajo terminado"], title: "Cambiar una canilla", category: 0, point: { lat: -34.6, lng: -58.4 }, approx: { lat: -34.601, lng: -58.401 }, startsAt: Math.floor(Date.now() / 1000) + 7200, amount: "25" };
    const nonces = readNonces(payer);
    const result = await publishChanga({ api: payer.api, deployment, account: payer.address, now: () => Math.floor(Date.now() / 1000), nonce: () => `e2e-${Date.now()}`, readBalance: nonces.balance, readTokenNonce: nonces.token, readForwarderNonce: nonces.forwarder, signTypedData: payer.signTyped }, draft, PRICE);
    changa = await until("changa abierta", async () => {
      const found = (await payer.api.get<{ changas: Changa[] }>(`/changas/${result.specHash}`)).changas[0];
      return found && found.status === "open" ? found : null;
    });
    orderId = changa.orderId!;
    await worker.api.send("PUT", `/me/applications/${changa.id}`, { message: "Voy hoy" });
    const expiry = Math.floor(Date.now() / 1000) + 7200;
    const terms = { orderId: BigInt(orderId), payer: payer.address, payee: worker.address, price: PRICE, specHash: changa.specHash as `0x${string}`, termsHash: ZERO_HASH, expiry };
    await payer.api.send("POST", `/me/orders/${orderId}/agreement`, { payee: worker.address, price: PRICE.toString(), expiry, signature: await payer.signTyped(agreementTypedData(deployment, terms)) });
    await worker.api.send("POST", `/me/orders/${orderId}/agreement/accept`, { signature: await worker.signTyped(agreementTypedData(deployment, terms)) });
    await until("acordada en cadena", async () => (await order(orderId)).status === OrderStatus.Agreed);
    await until("acordada en el servidor", async () => (await payer.api.get<{ changas: Changa[] }>("/me/changas")).changas.find((c) => c.status === "agreed"));
  });

  it("Beto entrega y Ana no responde: antes de las 24 h el pago sigue en garantía", async () => {
    const workerKey = await chatKey(worker);
    await chatKey(payer);
    const hash = await uploadOne(worker, payer, workerKey, orderId, "canilla.jpg");
    await sendViaRelay(relayDeps(worker), encodeDeliver(BigInt(orderId), evidenceBundleHash([hash])));
    await until("entregada", async () => (await order(orderId)).status === OrderStatus.Delivered);

    await advanceTime(23 * 3600);
    for (let i = 0; i < 4; i += 1) await until("tick", async () => true);
    expect((await order(orderId)).status).toBe(OrderStatus.Delivered);
  });

  it("pasadas las 24 h el servidor libera solo y Beto cobra el precio completo", async () => {
    const before = await balanceOf(worker.address);
    const escrowBefore = await balanceOf(deployment.escrow);
    await advanceTime(2 * 3600);
    await until("liberada sola", async () => (await order(orderId)).status === OrderStatus.Settled, 60);
    expect((await balanceOf(worker.address)) - before).toBe(PRICE);
    expect(escrowBefore - (await balanceOf(deployment.escrow))).toBe(PRICE);
    await until("liquidada en el servidor", async () => (await payer.api.get<{ changas: Changa[] }>("/me/changas")).changas.find((c) => c.status === "settled"));
  });
});
