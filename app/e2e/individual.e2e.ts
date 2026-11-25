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
import { saveRatingComment } from "../src/chain/rating";
import receiptAbi from "../../contracts/deployments/abi/Receipt.json";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const receiptAddress = (JSON.parse(readFileSync("/tmp/junquero-e2e/local-addresses.json", "utf8")) as Record<string, `0x${string}`>).receipt;
const COMMENT = "Quedó impecable y llegó puntual. Lo recomiendo.";

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
    const draft = { ...emptyDraft(), evidence: ["Foto del trabajo terminado"], title: "Cambiar una canilla", category: 0, point: { lat: -34.6, lng: -58.4 }, approx: { lat: -34.601, lng: -58.401 }, startsAt: Math.floor(Date.now() / 1000) + 7200, amount: "25" };
    const nonces = readNonces(broke);
    await expect(
      publishChanga({ api: broke.api, deployment, account: broke.address, now: () => Math.floor(Date.now() / 1000), nonce: () => `e2e-${Date.now()}`, readBalance: nonces.balance, readTokenNonce: nonces.token, readForwarderNonce: nonces.forwarder, signTypedData: broke.signTyped }, draft, 25_000_000n),
    ).rejects.toMatchObject({ missing: 25_000_000n });
  });

  it("publica con permiso firmado y el relayer; el indexador la deja abierta", async () => {
    await mint(payer.address, 100_000_000n);
    const escrowBefore = await balanceOf(deployment.escrow);
    const draft = { ...emptyDraft(), evidence: ["Foto del trabajo terminado"], title: "Cambiar una canilla", category: 0, point: { lat: -34.6, lng: -58.4 }, approx: { lat: -34.601, lng: -58.401 }, startsAt: Math.floor(Date.now() / 1000) + 7200, amount: "25" };
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
    await approveRemotely({ api: payer.api, deployment, orderId, payee: worker.address, index: null, amount: state.price, rating: 5, evidenceHash: state.evidenceHash, commentHash: await saveRatingComment(payer.api, orderId, COMMENT), now: Math.floor(Date.now() / 1000), sign: payer.signTyped });
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

  it("al cobrar con calificación el comprobante se emite solo, con la nota y la huella del comentario; el servidor lo muestra", async () => {
    // En la cadena: intransferible, de quien trabajó, con lo que firmó quien publicó.
    const owner = await chain.readContract({ address: receiptAddress, abi: receiptAbi as never, functionName: "ownerOf", args: [BigInt(orderId)] });
    expect((owner as string).toLowerCase()).toBe(worker.address.toLowerCase());
    const rated = (await chain.readContract({ address: receiptAddress, abi: receiptAbi as never, functionName: "rated", args: [BigInt(orderId)] })) as { payer: string; rating: number; commentHash: string };
    expect(rated.payer.toLowerCase()).toBe(payer.address.toLowerCase());
    expect(rated.rating).toBe(5);
    expect(rated.commentHash).toBe((await import("../src/chain/rating")).commentHashOf(COMMENT));

    // En el servidor: los metadatos públicos (sin sesión) y la imagen, una vez indexado el evento.
    const meta = await until("metadatos del comprobante", async () => {
      const response = await fetch(`http://127.0.0.1:8787/receipts/${orderId}`);
      return response.ok ? ((await response.json()) as { name: string; image: string; attributes: { trait_type: string; value: string | number }[] }) : null;
    });
    const attr = (name: string) => meta.attributes.find((a) => a.trait_type === name)?.value;
    expect(attr("Nota")).toBe(5);
    expect(attr("Comentario")).toBe(COMMENT);
    expect(JSON.stringify(meta)).not.toContain("25000000");
    const image = await fetch(meta.image.replace(/^https?:\/\/[^/]+/, "http://127.0.0.1:8787"));
    expect(image.headers.get("content-type")).toContain("image/svg+xml");
    const svg = await image.text();
    expect(svg).toContain("canilla");

    // En el perfil de quien trabajó: el comprobante con la nota, el comentario y quién calificó.
    const profile = await worker.api.get<{ receipts: { orderId: number; rated: boolean; rating: number | null; comment: string | null; payerName: string | null }[] }>(`/profiles/${worker.address}/receipts`);
    expect(profile.receipts.find((r) => r.orderId === orderId)).toMatchObject({ rated: true, rating: 5, comment: COMMENT, payerName: "Paula" });

    // Quien trabajó recibió el aviso.
    const notices = await worker.api.get<{ notifications: { kind: string; ref: string }[] }>("/me/notifications");
    expect(notices.notifications.some((n) => n.kind === "receipt_minted" && n.ref === String(orderId))).toBe(true);
  });
});
