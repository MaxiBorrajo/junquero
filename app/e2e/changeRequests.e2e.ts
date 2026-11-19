import { beforeAll, describe, expect, it } from "vitest";
import { generatePrivateKey } from "viem/accounts";
import { encodeFunctionData, keccak256, toBytes } from "viem";
import type { Changa } from "../src/api/types";
import { agreementTypedData, ZERO_HASH } from "../src/chain/agreement";
import { orderAbi, OrderStatus } from "../src/chain/orderAbi";
import { encodeDeliver, sendViaRelay } from "../src/chain/orderActions";
import { approveRemotely, releaseCall } from "../src/chain/remoteRelease";
import { publishChanga } from "../src/chain/publish";
import { evidenceBundleHash } from "../src/evidence/crypto";
import { emptyDraft } from "../src/publish/draft";
import { balanceOf, chatKey, deployment, login, makeActor, mint, order, readNonces, relayDeps, uploadOne, until } from "./harness";

const encodeRequestChanges = (orderId: bigint, reason: string) =>
  encodeFunctionData({ abi: orderAbi, functionName: "requestChanges", args: [orderId, keccak256(toBytes(reason))] });

const payer = makeActor(generatePrivateKey());
const worker = makeActor(generatePrivateKey());

beforeAll(async () => {
  for (const [actor, name] of [[payer, "Ana"], [worker, "Beto"]] as const) {
    await login(actor);
    await actor.api.send("PUT", "/me/profile", { name, categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
  }
  await mint(payer.address, 200_000_000n);
});

// 5.10: a distancia, quien publica puede pedir cambios hasta 2 veces; una tercera ronda no se permite.
describe("5.10 changa a distancia con pedido de cambios", () => {
  let orderId: number;
  let workerKey: Awaited<ReturnType<typeof chatKey>>;
  let round = 0;
  const attempt = (promise: Promise<unknown>) => promise.then(() => "ok", () => "revert");

  const deliver = async () => {
    round += 1;
    const hash = await uploadOne(worker, payer, workerKey, orderId, `entrega-${round}.jpg`);
    await sendViaRelay(relayDeps(worker), encodeDeliver(BigInt(orderId), evidenceBundleHash([hash])));
    await until("entregada", async () => (await order(orderId)).status === OrderStatus.Delivered);
  };

  it("se publica a distancia, se acuerda y Beto entrega", async () => {
    const now = () => Math.floor(Date.now() / 1000);
    const draft = { ...emptyDraft(), evidence: ["Archivo final"], title: "Traducir un manual", category: 0, modality: "remote" as const, deadline: now() + 5 * 86400, amount: "50" };
    const nonces = readNonces(payer);
    const result = await publishChanga({ api: payer.api, deployment, account: payer.address, now, nonce: () => `e2e-${Date.now()}`, readBalance: nonces.balance, readTokenNonce: nonces.token, readForwarderNonce: nonces.forwarder, signTypedData: payer.signTyped }, draft, 50_000_000n);
    const changa = await until("changa abierta", async () => {
      const found = (await payer.api.get<{ changas: Changa[] }>(`/changas/${result.specHash}`)).changas[0];
      return found && found.status === "open" ? found : null;
    });
    orderId = changa.orderId!;
    expect(changa.spec.modality).toBe("remote");
    await worker.api.send("PUT", `/me/applications/${changa.id}`, { message: "Lo traduzco" });
    const expiry = now() + 7200;
    const terms = { orderId: BigInt(orderId), payer: payer.address, payee: worker.address, price: 50_000_000n, specHash: changa.specHash as `0x${string}`, termsHash: ZERO_HASH, expiry };
    await payer.api.send("POST", `/me/orders/${orderId}/agreement`, { payee: worker.address, price: "50000000", expiry, signature: await payer.signTyped(agreementTypedData(deployment, terms)) });
    await worker.api.send("POST", `/me/orders/${orderId}/agreement/accept`, { signature: await worker.signTyped(agreementTypedData(deployment, terms)) });
    await until("acordada", async () => (await order(orderId)).status === OrderStatus.Agreed);
    await until("acordada en el servidor", async () => (await payer.api.get<{ changas: Changa[] }>("/me/changas")).changas.find((c) => c.status === "agreed"));
    workerKey = await chatKey(worker);
    await chatKey(payer);
    await deliver();
  });

  it("Ana pide cambios dos veces y Beto vuelve a entregar cada vez", async () => {
    await sendViaRelay(relayDeps(payer), encodeRequestChanges(BigInt(orderId), "Falta traducir el capítulo 3"));
    await until("vuelve a Acordada", async () => (await order(orderId)).status === OrderStatus.Agreed);
    expect((await order(orderId)).changeRequests).toBe(1);
    await deliver();
    await sendViaRelay(relayDeps(payer), encodeRequestChanges(BigInt(orderId), "Revisar los nombres propios"));
    await until("vuelve a Acordada", async () => (await order(orderId)).status === OrderStatus.Agreed);
    expect((await order(orderId)).changeRequests).toBe(2);
    await deliver();
  });

  it("la tercera ronda de cambios no se permite", async () => {
    expect(await attempt(sendViaRelay(relayDeps(payer), encodeRequestChanges(BigInt(orderId), "Una más"))) ).toBe("revert");
    expect((await order(orderId)).status).toBe(OrderStatus.Delivered);
    expect((await order(orderId)).changeRequests).toBe(2);
  });

  it("Ana aprueba sin QR y Beto cobra", async () => {
    const state = await order(orderId);
    await approveRemotely({ api: payer.api, deployment, orderId, payee: worker.address, index: null, amount: state.price, rating: 5, evidenceHash: state.evidenceHash, now: Math.floor(Date.now() / 1000), sign: payer.signTyped });
    const waiting = await worker.api.get<{ release: { index: number | null; amount: string; rating: number; evidenceHash: string; expiry: number; payee: string; signature: string } | null }>(`/me/orders/${orderId}/release`);
    expect(waiting.release).not.toBeNull();
    const before = await balanceOf(worker.address);
    await sendViaRelay(relayDeps(worker), releaseCall(orderId, waiting.release!));
    await until("pago liberado", async () => (await order(orderId)).status === OrderStatus.Settled);
    expect((await balanceOf(worker.address)) - before).toBe(50_000_000n);
  });
});
