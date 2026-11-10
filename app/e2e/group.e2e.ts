import { beforeAll, describe, expect, it } from "vitest";
import { generatePrivateKey } from "viem/accounts";
import type { Changa } from "../src/api/types";
import { agreementTypedData, ZERO_HASH } from "../src/chain/agreement";
import { PERMIT_VALIDITY_SECONDS, permitTypedData } from "../src/chain/createOrder";
import { encodeContribute, encodeProposeProvider, encodeWithdrawContribution, groupAbi } from "../src/chain/group";
import { OrderStatus } from "../src/chain/orderAbi";
import { encodeDeliver, sendViaRelay } from "../src/chain/orderActions";
import { publishChanga } from "../src/chain/publish";
import { approveRemotely, releaseCall } from "../src/chain/remoteRelease";
import { evidenceBundleHash } from "../src/evidence/crypto";
import { emptyDraft } from "../src/publish/draft";
import { advanceTime, balanceOf, chain, chatKey, deployment, login, makeActor, mint, order, readNonces, relayDeps, uploadOne, until, type Actor } from "./harness";

const coordinator = makeActor(generatePrivateKey());
const worker = makeActor(generatePrivateKey());
const a = makeActor(generatePrivateKey());
const b = makeActor(generatePrivateKey());
const c = makeActor(generatePrivateKey());

beforeAll(async () => {
  for (const actor of [coordinator, worker, a, b, c]) await login(actor);
  await coordinator.api.send("PUT", "/me/profile", { name: "Coordi", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
  await worker.api.send("PUT", "/me/profile", { name: "Walter G", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
  for (const actor of [a, b, c]) await mint(actor.address, 100_000_000n);
});

const group = (orderId: number) => chain.readContract({ address: deployment.escrow, abi: groupAbi, functionName: "getGroup", args: [BigInt(orderId)] });

async function contribute(actor: Actor, orderId: number, amount: bigint) {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_VALIDITY_SECONDS);
  const signature = await actor.signTyped(permitTypedData(deployment, actor.address, amount, await readNonces(actor).token(), deadline));
  await sendViaRelay(relayDeps(actor), encodeContribute(BigInt(orderId), amount, { method: 0, nonce: 0n, deadline, signature }));
}

describe("changa grupal de punta a punta", () => {
  let changa: Changa;
  let orderId: number;

  it("se publica como grupal, aparece juntando aportes y no sale en el mapa", async () => {
    const draft = { ...emptyDraft(), evidence: ["Foto del trabajo terminado"], title: "Arreglar la plaza", category: 0, kind: "group" as const, fundingDays: 7, point: { lat: -34.6, lng: -58.4 }, approx: { lat: -34.601, lng: -58.401 }, startsAt: Math.floor(Date.now() / 1000) + 5 * 86400, amount: "100" };
    const nonces = readNonces(coordinator);
    const result = await publishChanga({ api: coordinator.api, deployment, account: coordinator.address, now: () => Math.floor(Date.now() / 1000), nonce: () => `e2e-${Date.now()}`, readBalance: async () => { throw new Error("grupal no consulta saldo"); }, readTokenNonce: nonces.token, readForwarderNonce: nonces.forwarder, signTypedData: coordinator.signTyped }, draft, 100_000_000n);
    changa = await until("changa grupal", async () => {
      const found = (await coordinator.api.get<{ changas: Changa[] }>(`/changas/${result.specHash}`)).changas[0];
      return found && found.status === "funding" ? found : null;
    });
    orderId = changa.orderId!;
    expect((await order(orderId)).status).toBe(OrderStatus.Funding);
    const bbox = "minLat=-35&maxLat=-34&minLng=-59&maxLng=-58";
    expect(((await worker.api.get<{ changas: Changa[] }>(`/changas?${bbox}`)).changas.map((x) => x.id))).not.toContain(changa.id);
  });

  it("aportan tres personas, una retira y vuelve a aportar; al llegar a la meta pasa a abierta", async () => {
    await contribute(a, orderId, 40_000_000n);
    await contribute(b, orderId, 40_000_000n);
    await until("aportes registrados", async () => (await group(orderId)).totalContributed === 80_000_000n);
    await sendViaRelay(relayDeps(b), encodeWithdrawContribution(BigInt(orderId)));
    await until("retiro", async () => (await group(orderId)).totalContributed === 40_000_000n);
    expect(await balanceOf(b.address)).toBe(100_000_000n);
    await contribute(b, orderId, 40_000_000n);
    await contribute(c, orderId, 20_000_000n);
    await until("meta cumplida", async () => (await order(orderId)).status === OrderStatus.Open);
    await until("abierta en el servidor", async () => (await coordinator.api.get<{ changas: Changa[] }>("/me/changas")).changas.find((x) => x.status === "open"));
    const mine = await a.api.get<{ contributions: { orderId: number }[] }>("/me/contributions");
    expect(mine.contributions.map((x) => x.orderId)).toContain(orderId);
    expect((await group(orderId)).totalContributed).toBe(100_000_000n);
  });

  it("el coordinador propone al prestador, pasa la ventana de veto y el acuerdo se firma con el coordinador como pagador", async () => {
    await worker.api.send("PUT", `/me/applications/${changa.id}`, { message: "Me ocupo" });
    const received = await coordinator.api.get<{ applications: unknown[] }>(`/me/changas/${changa.id}/applications`);
    expect(received.applications).toHaveLength(1);

    await sendViaRelay(relayDeps(coordinator), encodeProposeProvider(BigInt(orderId), worker.address));
    await until("propuesta", async () => (await group(orderId)).proposedPayee.toLowerCase() === worker.address.toLowerCase());
    await advanceTime(25 * 3600);

    const expiry = Math.floor(Date.now() / 1000) + 7200;
    const terms = { orderId: BigInt(orderId), payer: coordinator.address, payee: worker.address, price: 100_000_000n, specHash: changa.specHash as `0x${string}`, termsHash: ZERO_HASH, expiry };
    await coordinator.api.send("POST", `/me/orders/${orderId}/agreement`, { payee: worker.address, price: "100000000", expiry, signature: await coordinator.signTyped(agreementTypedData(deployment, terms)) });
    await worker.api.send("POST", `/me/orders/${orderId}/agreement/accept`, { signature: await worker.signTyped(agreementTypedData(deployment, terms)) });
    await until("acordada", async () => (await order(orderId)).status === OrderStatus.Agreed);
    await until("acordada en el servidor", async () => (await coordinator.api.get<{ changas: Changa[] }>("/me/changas")).changas.find((x) => x.status === "agreed"));
  });

  it("entrega, el coordinador aprueba y el pago llega al prestador", async () => {
    const workerKey = await chatKey(worker);
    await chatKey(coordinator);
    const hash = await uploadOne(worker, coordinator, workerKey, orderId, "plaza.jpg");
    await sendViaRelay(relayDeps(worker), encodeDeliver(BigInt(orderId), evidenceBundleHash([hash])));
    await until("entregada", async () => (await order(orderId)).status === OrderStatus.Delivered);
    const state = await order(orderId);
    await approveRemotely({ api: coordinator.api, deployment, orderId, payee: worker.address, index: null, amount: state.price, rating: 5, evidenceHash: state.evidenceHash, now: Math.floor(Date.now() / 1000), sign: coordinator.signTyped });
    const waiting = await worker.api.get<{ release: any }>(`/me/orders/${orderId}/release`);
    const before = await balanceOf(worker.address);
    await sendViaRelay(relayDeps(worker), releaseCall(orderId, waiting.release));
    await until("pago liberado", async () => (await order(orderId)).status === OrderStatus.Settled);
    expect((await balanceOf(worker.address)) - before).toBe(100_000_000n);
  });
});
