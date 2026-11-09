import { beforeAll, describe, expect, it } from "vitest";
import { generatePrivateKey } from "viem/accounts";
import type { Changa } from "../src/api/types";
import { agreementTypedData, ZERO_HASH } from "../src/chain/agreement";
import { InsufficientBalance, publishChanga } from "../src/chain/publish";
import { approveRemotely, releaseCall } from "../src/chain/remoteRelease";
import { encodeDeliver, sendViaRelay } from "../src/chain/orderActions";
import { OrderStatus } from "../src/chain/orderAbi";
import { evidenceBundleHash } from "../src/evidence/crypto";
import { uploadEvidence } from "../src/evidence/upload";
import { emptyDraft } from "../src/publish/draft";
import { balanceOf, chain, chatKey, deployment, KEYS, login, makeActor, mint, order, readNonces, relayDeps, until } from "./harness";
import { createHash } from "node:crypto";

const payer = makeActor(KEYS.payer);
const worker = makeActor(KEYS.worker);
const sha256 = async (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

beforeAll(async () => {
  await login(payer);
  await login(worker);
  await payer.api.send("PUT", "/me/profile", { name: "Paula", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
  await worker.api.send("PUT", "/me/profile", { name: "Walter", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
});

describe("recorrido individual de punta a punta", () => {
  let changa: Changa;
  let orderId: number;

  it("no deja publicar sin saldo y avisa cuánto falta", async () => {
    const broke = makeActor(generatePrivateKey());
    await login(broke);
    const draft = { ...emptyDraft(), title: "Cambiar una canilla", category: 0, point: { lat: -34.6, lng: -58.4 }, approx: { lat: -34.601, lng: -58.401 }, startsAt: Math.floor(Date.now() / 1000) + 7200, amount: "25" };
    const nonces = readNonces(broke);
    await expect(
      publishChanga({ api: broke.api, deployment, account: broke.address, now: () => Math.floor(Date.now() / 1000), nonce: () => `e2e-${Date.now()}`, readBalance: nonces.balance, readTokenNonce: nonces.token, readForwarderNonce: nonces.forwarder, signTypedData: broke.signTyped }, draft, 25_000_000n),
    ).rejects.toMatchObject({ missing: 25_000_000n });
  });

  it("publica con permiso firmado y el relayer; el indexador la deja abierta", async () => {
    await mint(payer.address, 100_000_000n);
    const escrowBefore = await balanceOf(deployment.escrow);
    const draft = { ...emptyDraft(), title: "Cambiar una canilla", category: 0, point: { lat: -34.6, lng: -58.4 }, approx: { lat: -34.601, lng: -58.401 }, startsAt: Math.floor(Date.now() / 1000) + 7200, amount: "25" };
    const nonces = readNonces(payer);
    const result = await publishChanga({ api: payer.api, deployment, account: payer.address, now: () => Math.floor(Date.now() / 1000), nonce: () => `e2e-${Date.now()}`, readBalance: nonces.balance, readTokenNonce: nonces.token, readForwarderNonce: nonces.forwarder, signTypedData: payer.signTyped }, draft, 25_000_000n);
    changa = await until("changa abierta", async () => {
      const found = (await payer.api.get<{ changas: Changa[] }>(`/changas/${result.specHash}`)).changas[0];
      return found && found.status === "open" ? found : null;
    });
    orderId = changa.orderId!;
    expect(changa.amount).toBe("25000000");
    expect((await balanceOf(deployment.escrow)) - escrowBefore).toBe(25_000_000n);
    expect(changa.spec.area).toMatchObject({ lat: -34.601, lng: -58.401 });
  });

  it("el prestador se postula y quien publicó lo elige: firman las dos partes y el servidor manda el acuerdo", async () => {
    await worker.api.send("PUT", `/me/applications/${changa.id}`, { message: "Voy hoy" });
    const received = await payer.api.get<{ applications: { applicant: string }[] }>(`/me/changas/${changa.id}/applications`);
    expect(received.applications).toHaveLength(1);

    const expiry = Math.floor(Date.now() / 1000) + 7200;
    const terms = { orderId: BigInt(orderId), payer: payer.address, payee: worker.address, price: 25_000_000n, specHash: changa.specHash as `0x${string}`, termsHash: ZERO_HASH, expiry };
    await payer.api.send("POST", `/me/orders/${orderId}/agreement`, { payee: worker.address, price: "25000000", expiry, signature: await payer.signTyped(agreementTypedData(deployment, terms)) });
    const pending = await worker.api.get<{ agreements: { orderId: number; status: string }[] }>("/me/agreements");
    expect(pending.agreements[0]).toMatchObject({ orderId, status: "pending" });
    await worker.api.send("POST", `/me/orders/${orderId}/agreement/accept`, { signature: await worker.signTyped(agreementTypedData(deployment, terms)) });

    await until("acordada en cadena", async () => (await order(orderId)).status === OrderStatus.Agreed);
    expect((await order(orderId)).payee.toLowerCase()).toBe(worker.address.toLowerCase());
    await until("acordada en el servidor", async () => (await payer.api.get<{ changas: Changa[] }>("/me/changas")).changas.find((c) => c.status === "agreed"));
  });

  it("el prestador sube evidencia cifrada y entrega; quien publicó la ve descifrada", async () => {
    const workerKey = await chatKey(worker);
    await chatKey(payer);
    const photo = Uint8Array.from({ length: 2048 }, (_, i) => (i * 13) % 256);
    const uploaded = await uploadEvidence(
      { api: worker.api, address: worker.address, counterpart: payer.address, mine: workerKey, signMessage: worker.signMessage as never, hash: sha256 },
      orderId,
      photo,
      { capturedAt: Math.floor(Date.now() / 1000), name: "canilla.jpg", mime: "image/jpeg" },
    );
    const list = await worker.api.get<{ evidence: { hash: string; uploader: string }[] }>(`/me/orders/${orderId}/evidence`);
    expect(list.evidence).toHaveLength(1);
    const forPayer = await payer.api.get<{ evidence: { wrappedKey: string | null }[] }>(`/me/orders/${orderId}/evidence`);
    expect(forPayer.evidence[0]!.wrappedKey).not.toBeNull();

    await sendViaRelay(relayDeps(worker), encodeDeliver(BigInt(orderId), evidenceBundleHash([uploaded.hash])));
    await until("entregada", async () => (await order(orderId)).status === OrderStatus.Delivered);
  });

  it("quien publicó aprueba sin verse y el prestador cobra con una firma", async () => {
    const state = await order(orderId);
    await approveRemotely({ api: payer.api, deployment, orderId, payee: worker.address, index: null, amount: state.price, rating: 5, evidenceHash: state.evidenceHash, now: Math.floor(Date.now() / 1000), sign: payer.signTyped });
    const waiting = await worker.api.get<{ release: { index: number | null; amount: string; rating: number; evidenceHash: string; expiry: number; payee: string; signature: string } | null }>(`/me/orders/${orderId}/release`);
    expect(waiting.release).not.toBeNull();

    const before = await balanceOf(worker.address);
    const escrowNow = await balanceOf(deployment.escrow);
    await sendViaRelay(relayDeps(worker), releaseCall(orderId, waiting.release!));
    await until("pago liberado", async () => (await order(orderId)).status === OrderStatus.Settled);
    expect((await balanceOf(worker.address)) - before).toBe(25_000_000n);
    expect(escrowNow - (await balanceOf(deployment.escrow))).toBe(25_000_000n);
    await until("liquidada en el servidor", async () => (await payer.api.get<{ changas: Changa[] }>("/me/changas")).changas.find((c) => c.status === "settled"));
    void chain;
  });
});
