import { beforeAll, describe, expect, it } from "vitest";
import { generatePrivateKey } from "viem/accounts";
import { readFileSync } from "node:fs";
import type { Address } from "viem";
import type { Changa } from "../src/api/types";
import { agreementTypedData, ZERO_HASH } from "../src/chain/agreement";
import { OrderStatus } from "../src/chain/orderAbi";
import { encodeCancel, sendViaRelay } from "../src/chain/orderActions";
import { publishChanga } from "../src/chain/publish";
import { emptyDraft } from "../src/publish/draft";
import { advanceTime, balanceOf, chain, deployment, login, makeActor, mint, order, readNonces, relayDeps, until } from "./harness";

const treasury = (JSON.parse(readFileSync("/tmp/junquero-e2e/local-addresses.json", "utf8")) as Record<string, Address>).treasury!;
const payer = makeActor(generatePrivateKey());
const worker = makeActor(generatePrivateKey());

beforeAll(async () => {
  for (const [actor, name] of [[payer, "Ana"], [worker, "Beto"]] as const) {
    await login(actor);
    await actor.api.send("PUT", "/me/profile", { name, categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
  }
  await mint(payer.address, 300_000_000n);
});

// Changa a distancia (sin fecha de inicio) de 100, acordada con Beto. Devuelve el id de la orden.
async function agreed(title: string): Promise<number> {
  const draft = { ...emptyDraft(), modality: "remote" as const, startsAt: null, evidence: ["Captura del trabajo"], title, category: 0, amount: "100" };
  const nonces = readNonces(payer);
  const result = await publishChanga({ api: payer.api, deployment, account: payer.address, now: () => Math.floor(Date.now() / 1000), nonce: () => `e2e-${Date.now()}`, readBalance: nonces.balance, readTokenNonce: nonces.token, readForwarderNonce: nonces.forwarder, signTypedData: payer.signTyped }, draft, 100_000_000n);
  const changa = await until("changa abierta", async () => {
    const found = (await payer.api.get<{ changas: Changa[] }>(`/changas/${result.specHash}`)).changas[0];
    return found && found.status === "open" ? found : null;
  });
  const orderId = changa.orderId!;
  await worker.api.send("PUT", `/me/applications/${changa.id}`, { message: "Puedo" });
  const expiry = Math.floor(Date.now() / 1000) + 7200;
  const terms = { orderId: BigInt(orderId), payer: payer.address, payee: worker.address, price: 100_000_000n, specHash: changa.specHash as `0x${string}`, termsHash: ZERO_HASH, expiry };
  await payer.api.send("POST", `/me/orders/${orderId}/agreement`, { payee: worker.address, price: "100000000", expiry, signature: await payer.signTyped(agreementTypedData(deployment, terms)) });
  await worker.api.send("POST", `/me/orders/${orderId}/agreement/accept`, { signature: await worker.signTyped(agreementTypedData(deployment, terms)) });
  await until("acordada en cadena", async () => (await order(orderId)).status === OrderStatus.Agreed);
  expect((await order(orderId)).startsAt).toBe(0);
  return orderId;
}

async function cancelAndMeasure(orderId: number) {
  const before = { payer: await balanceOf(payer.address), worker: await balanceOf(worker.address), treasury: await balanceOf(treasury) };
  await sendViaRelay(relayDeps(payer), encodeCancel(BigInt(orderId)));
  await until("cancelada", async () => (await order(orderId)).status !== OrderStatus.Agreed);
  return { payer: (await balanceOf(payer.address)) - before.payer, worker: (await balanceOf(worker.address)) - before.worker, treasury: (await balanceOf(treasury)) - before.treasury };
}

describe("7.5 cancelar sin fecha de inicio", () => {
  it("dentro de las 24 h desde el acuerdo cuesta el 2% y va entero al tesoro", async () => {
    const orderId = await agreed("Traducir un texto (2%)");
    const moved = await cancelAndMeasure(orderId);
    expect(moved).toEqual({ payer: 98_000_000n, worker: 0n, treasury: 2_000_000n });
  });

  it("pasadas las 24 h cuesta el 10%: 80% para Beto y 20% para el tesoro", async () => {
    const orderId = await agreed("Traducir otro texto (10%)");
    await advanceTime(24 * 3600 + 60);
    const moved = await cancelAndMeasure(orderId);
    expect(moved).toEqual({ payer: 90_000_000n, worker: 8_000_000n, treasury: 2_000_000n });
    expect(chain).toBeDefined();
  });
});
