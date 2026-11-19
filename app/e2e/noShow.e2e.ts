import { beforeAll, describe, expect, it } from "vitest";
import { generatePrivateKey } from "viem/accounts";
import { encodeFunctionData, parseAbi } from "viem";
import { readFileSync } from "node:fs";
import type { Address } from "viem";
import type { Changa } from "../src/api/types";
import { agreementTypedData, ZERO_HASH } from "../src/chain/agreement";
import { OrderStatus } from "../src/chain/orderAbi";
import { encodeCheckIn, sendViaRelay } from "../src/chain/orderActions";
import { publishChanga } from "../src/chain/publish";
import { emptyDraft } from "../src/publish/draft";
import { advanceTime, balanceOf, chain, deployment, login, makeActor, mint, order, readNonces, relayDeps, until } from "./harness";

const treasury = (JSON.parse(readFileSync("/tmp/junquero-e2e/local-addresses.json", "utf8")) as Record<string, Address>).treasury!;
const claimNoShowAbi = parseAbi(["function claimNoShow(uint256 orderId)"]);
const encodeClaimNoShow = (orderId: bigint) => encodeFunctionData({ abi: claimNoShowAbi, functionName: "claimNoShow", args: [orderId] });

const payer = makeActor(generatePrivateKey());
const worker = makeActor(generatePrivateKey());

beforeAll(async () => {
  for (const [actor, name] of [[payer, "Ana"], [worker, "Beto"]] as const) {
    await login(actor);
    await actor.api.send("PUT", "/me/profile", { name, categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
  }
  await mint(payer.address, 200_000_000n);
});

// Las firmas del relayer vencen según el reloj de la cadena, que acá se adelanta: se firma con esa hora.
let chainNow = 0;
const deps = (actor: typeof payer) => ({ ...relayDeps(actor), now: () => chainNow });
const refreshClock = async () => { chainNow = Number((await chain.getBlock()).timestamp); };

// Presencial de 100 con fecha fija dentro de 2 h, acordada con Beto.
async function agreedOnsite(title: string): Promise<number> {
  const now = () => Math.floor(Date.now() / 1000);
  const draft = { ...emptyDraft(), evidence: ["Foto del trabajo terminado"], title, category: 0, point: { lat: -34.6, lng: -58.4 }, approx: { lat: -34.601, lng: -58.401 }, startsAt: now() + 7200, amount: "100" };
  const nonces = readNonces(payer);
  const result = await publishChanga({ api: payer.api, deployment, account: payer.address, now, nonce: () => `e2e-${Date.now()}`, readBalance: nonces.balance, readTokenNonce: nonces.token, readForwarderNonce: nonces.forwarder, signTypedData: payer.signTyped }, draft, 100_000_000n);
  const changa = await until("changa abierta", async () => {
    const found = (await payer.api.get<{ changas: Changa[] }>(`/changas/${result.specHash}`)).changas[0];
    return found && found.status === "open" ? found : null;
  });
  const orderId = changa.orderId!;
  await worker.api.send("PUT", `/me/applications/${changa.id}`, { message: "Voy" });
  const expiry = now() + 7200;
  const terms = { orderId: BigInt(orderId), payer: payer.address, payee: worker.address, price: 100_000_000n, specHash: changa.specHash as `0x${string}`, termsHash: ZERO_HASH, expiry };
  await payer.api.send("POST", `/me/orders/${orderId}/agreement`, { payee: worker.address, price: "100000000", expiry, signature: await payer.signTyped(agreementTypedData(deployment, terms)) });
  await worker.api.send("POST", `/me/orders/${orderId}/agreement/accept`, { signature: await worker.signTyped(agreementTypedData(deployment, terms)) });
  await until("acordada en cadena", async () => (await order(orderId)).status === OrderStatus.Agreed);
  return orderId;
}

// La cadena local va atrasada respecto del reloj real, así que se avanza hasta `startsAt` según la hora de la cadena.
async function advanceChainTo(timestamp: number): Promise<void> {
  const now = Number((await chain.getBlock()).timestamp);
  if (timestamp > now) await advanceTime(timestamp - now);
}

const attempt = async (actor: typeof payer, data: `0x${string}`) => { await refreshClock(); return sendViaRelay(deps(actor), data).then(() => "ok", () => "revert"); };

describe("7.6 no presentación de quien publicó", () => {
  let orderId: number;

  it("Beto no puede reclamar sin haber hecho check-in", async () => {
    orderId = await agreedOnsite("Armar un mueble");
    await advanceChainTo(Number((await order(orderId)).startsAt) + 60);
    expect(await attempt(worker, encodeClaimNoShow(BigInt(orderId)))).toBe("revert");
    expect((await order(orderId)).status).toBe(OrderStatus.Agreed);
  });

  it("con check-in pero antes de los 20 minutos de espera, el reclamo es rechazado", async () => {
    await refreshClock();
    await sendViaRelay(deps(worker), encodeCheckIn(BigInt(orderId)));
    await until("check-in registrado", async () => (await order(orderId)).checkedInAt !== 0);
    await advanceTime(5 * 60);
    expect(await attempt(worker, encodeClaimNoShow(BigInt(orderId)))).toBe("revert");
    expect((await order(orderId)).status).toBe(OrderStatus.Agreed);
  });

  it("pasados los 20 minutos sin que Ana confirme, Beto cobra el 10% y Ana recupera el 90%", async () => {
    await advanceTime(20 * 60);
    const before = { payer: await balanceOf(payer.address), worker: await balanceOf(worker.address), treasury: await balanceOf(treasury) };
    await refreshClock();
    await sendViaRelay(deps(worker), encodeClaimNoShow(BigInt(orderId)));
    await until("reclamo resuelto", async () => (await order(orderId)).status !== OrderStatus.Agreed);
    const moved = { payer: (await balanceOf(payer.address)) - before.payer, worker: (await balanceOf(worker.address)) - before.worker, treasury: (await balanceOf(treasury)) - before.treasury };
    // 10% de 100 = 10: 80% para Beto y 20% para el tesoro (mismo reparto que la cancelación tardía).
    expect(moved).toEqual({ payer: 90_000_000n, worker: 8_000_000n, treasury: 2_000_000n });
  });
});
