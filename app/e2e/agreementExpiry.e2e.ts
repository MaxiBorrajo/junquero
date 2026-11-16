import { beforeAll, describe, expect, it } from "vitest";
import type { Changa } from "../src/api/types";
import { agreementTypedData, ZERO_HASH } from "../src/chain/agreement";
import { publishChanga } from "../src/chain/publish";
import { OrderStatus } from "../src/chain/orderAbi";
import { emptyDraft } from "../src/publish/draft";
import { advanceTime, chain, KEYS, deployment, login, makeActor, mint, order, readNonces, until } from "./harness";

const payer = makeActor(KEYS.payer);
const worker = makeActor(KEYS.worker);

beforeAll(async () => {
  await login(payer);
  await login(worker);
  await payer.api.send("PUT", "/me/profile", { name: "Paula", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
  await worker.api.send("PUT", "/me/profile", { name: "Walter", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
});

describe("acuerdo que vence", () => {
  it("si solo firma una parte y pasa el plazo, no queda acordado y la changa sigue abierta", async () => {
    await mint(payer.address, 100_000_000n);
    const draft = { ...emptyDraft(), evidence: ["Foto"], title: "Pintar una reja", category: 0, point: { lat: -34.6, lng: -58.4 }, approx: { lat: -34.601, lng: -58.401 }, startsAt: Math.floor(Date.now() / 1000) + 7200, amount: "25" };
    const nonces = readNonces(payer);
    const result = await publishChanga({ api: payer.api, deployment, account: payer.address, now: () => Math.floor(Date.now() / 1000), nonce: () => `e2e-expiry-${Date.now()}`, readBalance: nonces.balance, readTokenNonce: nonces.token, readForwarderNonce: nonces.forwarder, signTypedData: payer.signTyped }, draft, 25_000_000n);
    const changa = await until("changa abierta", async () => {
      const found = (await payer.api.get<{ changas: Changa[] }>(`/changas/${result.specHash}`)).changas[0];
      return found && found.status === "open" ? found : null;
    });
    const orderId = changa.orderId!;
    await worker.api.send("PUT", `/me/applications/${changa.id}`, { message: "Voy" });

    // Firma solo quien publica, con el plazo mínimo que acepta el servidor (1 hora).
    const expiry = Math.floor(Date.now() / 1000) + 3700;
    const terms = { orderId: BigInt(orderId), payer: payer.address, payee: worker.address, price: 25_000_000n, specHash: changa.specHash as `0x${string}`, termsHash: ZERO_HASH, expiry };
    await payer.api.send("POST", `/me/orders/${orderId}/agreement`, { payee: worker.address, price: "25000000", expiry, signature: await payer.signTyped(agreementTypedData(deployment, terms)) });

    // La cadena avanza más allá del plazo sin que firme la otra parte.
    // El reloj de la cadena local va atrasado respecto del real: se avanza hasta pasar el plazo firmado.
    const chainNow = Number((await chain.getBlock()).timestamp);
    await advanceTime(expiry - chainNow + 60);
    let accepted = "ok";
    try {
      await worker.api.send("POST", `/me/orders/${orderId}/agreement/accept`, { signature: await worker.signTyped(agreementTypedData(deployment, terms)) });
    } catch (error) {
      accepted = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 8000));

    expect((await order(orderId)).status).toBe(OrderStatus.Open);
    const mine = (await payer.api.get<{ changas: Changa[] }>("/me/changas")).changas.find((item) => item.id === changa.id);
    console.log("aceptar después del plazo:", accepted, "· estado en el servidor:", mine?.status);
    expect(mine?.status).toBe("open");
  });
});
