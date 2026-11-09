import { createHash } from "node:crypto";
import sodium from "libsodium-wrappers";
import { beforeAll, describe, expect, it } from "vitest";
import { createApi } from "../src/api/client";
import { fromBase64 } from "../src/crypto/base64";
import { keyPairFromSeed, publicKeyHex } from "../src/crypto/chat";
import { decryptFile, decryptMeta, encryptEvidence, evidenceBundleHash, unwrapKey, wrapKey } from "../src/evidence/crypto";
import { buildEvidenceBatchMessage, kindOf, uploadEvidenceBatch } from "../src/evidence/upload";

beforeAll(async () => {
  await sodium.ready;
});

const alice = keyPairFromSeed(new Uint8Array(32).fill(1));
const bob = keyPairFromSeed(new Uint8Array(32).fill(2));
const eve = keyPairFromSeed(new Uint8Array(32).fill(3));
const meta = { capturedAt: 1_800_000_000, lat: -34.6, lng: -58.4, name: "frente.jpg", mime: "image/jpeg" };
const file = Uint8Array.from({ length: 5000 }, (_, i) => (i * 7) % 256);

describe("cifrado de evidencia", () => {
  it("el archivo y los datos se recuperan con la clave", () => {
    const e = encryptEvidence(file, meta);
    expect(Array.from(decryptFile(e.cipher, e.key)!)).toEqual(Array.from(file));
    expect(decryptMeta(e.meta, e.key)).toEqual(meta);
    expect(e.meta.length).toBeLessThanOrEqual(2048);
  });

  it("no se abre con otra clave ni si se altera", () => {
    const e = encryptEvidence(file, meta);
    expect(decryptFile(e.cipher, new Uint8Array(32))).toBeNull();
    const tampered = e.cipher.slice();
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 1;
    expect(decryptFile(tampered, e.key)).toBeNull();
    expect(decryptMeta("AAAA", e.key)).toBeNull();
  });

  it("es compatible con crypto_secretbox_easy de libsodium", () => {
    const e = encryptEvidence(file, meta);
    const plain = sodium.crypto_secretbox_open_easy(e.cipher.slice(24), e.cipher.slice(0, 24), e.key);
    expect(Array.from(plain)).toEqual(Array.from(file));
  });

  it("la clave se comparte solo con quien corresponde", () => {
    const e = encryptEvidence(file, meta);
    const wrapped = wrapKey(e.key, bob.publicKey, alice);
    expect(wrapped.length).toBeLessThanOrEqual(512);
    expect(Array.from(unwrapKey(wrapped, alice.publicKey, bob)!)).toEqual(Array.from(e.key));
    expect(unwrapKey(wrapped, alice.publicKey, eve)).toBeNull();
    expect(unwrapKey("???", alice.publicKey, bob)).toBeNull();
  });

  it("el hash del conjunto no depende del orden ni del prefijo", () => {
    const a = "aa".repeat(32);
    const b = "bb".repeat(32);
    expect(evidenceBundleHash([a, b])).toBe(evidenceBundleHash([`0x${b}`, a]));
    expect(evidenceBundleHash([a])).not.toBe(evidenceBundleHash([a, b]));
    expect(evidenceBundleHash([a])).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("clasifica por tipo de archivo", () => {
    expect([kindOf("image/png"), kindOf("video/mp4"), kindOf("application/pdf")]).toEqual(["photo", "video", "document"]);
  });
});

describe("subida de evidencia por tanda", () => {
  const second = Uint8Array.from({ length: 300 }, (_, i) => (i * 11) % 256);
  const secondMeta = { capturedAt: 1_800_000_100, name: "boleta.pdf", mime: "application/pdf" };

  function harness() {
    const calls: { method: string; path: string; body: any; headers: Record<string, string> }[] = [];
    const fetcher = async (url: string, init?: RequestInit) => {
      const path = url.replace("https://x", "");
      const raw = init?.body;
      const isBytes = raw instanceof Uint8Array;
      calls.push({ method: init?.method ?? "GET", path, body: isBytes ? raw : raw ? JSON.parse(raw as string) : undefined, headers: (init?.headers ?? {}) as Record<string, string> });
      if (path.startsWith("/me/chat-keys/")) return new Response(JSON.stringify({ publicKey: publicKeyHex(bob) }), { status: 200 });
      return new Response("{}", { status: 200 });
    };
    const api = createApi({ baseUrl: "https://x", fetcher, getToken: () => "t" });
    const signed: string[] = [];
    const deps = {
      api,
      address: "0xAAA0000000000000000000000000000000000001",
      counterpart: "0xBBB0000000000000000000000000000000000002",
      mine: alice,
      signMessage: async (m: string) => (signed.push(m), ("0x" + "11".repeat(65)) as `0x${string}`),
      hash: async (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex"),
    };
    return { calls, signed, deps };
  }

  it("firma una sola vez lo mismo que verifica el servidor y comparte la clave de cada archivo con las dos partes", async () => {
    const { calls, signed, deps } = harness();
    const result = await uploadEvidenceBatch(deps, 7, [{ file, meta }, { file: second, meta: secondMeta }]);

    const uploads = calls.filter((c) => c.path === "/me/evidence-files");
    expect(uploads).toHaveLength(2);
    const digests = uploads.map((u) => createHash("sha256").update(u.body).digest("hex"));
    expect(result.hashes).toEqual(digests);

    expect(signed).toHaveLength(1);
    const register = calls.find((c) => c.path === "/me/orders/7/evidence/batch")!;
    expect(register.body.items.map((i: any) => i.hash)).toEqual(digests);
    expect(register.body.items.map((i: any) => i.kind)).toEqual(["photo", "document"]);
    const entries = register.body.items.map((i: any) => ({ fileHash: i.hash, metaHash: createHash("sha256").update(i.meta).digest("hex") }));
    expect(signed[0]).toBe(buildEvidenceBatchMessage(7, entries));

    const keys = calls.filter((c) => c.path.endsWith("/keys"));
    expect(keys).toHaveLength(4);
    expect(keys.map((k) => k.body.recipient)).toEqual([
      "0xaaa0000000000000000000000000000000000001",
      "0xbbb0000000000000000000000000000000000002",
      "0xaaa0000000000000000000000000000000000001",
      "0xbbb0000000000000000000000000000000000002",
    ]);
    const mine = unwrapKey(keys[0]!.body.wrapped, alice.publicKey, alice)!;
    const theirs = unwrapKey(keys[1]!.body.wrapped, alice.publicKey, bob)!;
    expect(Array.from(mine)).toEqual(Array.from(theirs));
    expect(Array.from(decryptFile(uploads[0]!.body, mine)!)).toEqual(Array.from(file));
    expect(fromBase64(register.body.items[0].meta).length).toBeGreaterThan(24);
  });

  it("el mensaje numera cada archivo y cambia si cambia el orden", () => {
    const a = { fileHash: "AA".repeat(32), metaHash: "BB".repeat(32) };
    const b = { fileHash: "CC".repeat(32), metaHash: "DD".repeat(32) };
    const message = buildEvidenceBatchMessage(3, [a, b]);
    expect(message.startsWith("Junquero: firmo estas 2 pruebas de la changa 3.\n1. Archivo: " + "aa".repeat(32))).toBe(true);
    expect(message).toContain("2. Datos: " + "dd".repeat(32));
    expect(buildEvidenceBatchMessage(3, [b, a])).not.toBe(message);
  });

  it("no sube nada si la otra parte no activó su clave", async () => {
    const calls: string[] = [];
    const api = createApi({ baseUrl: "https://x", getToken: () => "t", fetcher: async (url) => (calls.push(url), new Response("{}", { status: 404 })) });
    await expect(uploadEvidenceBatch({ api, address: "0xA", counterpart: "0xB", mine: alice, signMessage: async () => "0x", hash: async () => "" }, 1, [{ file, meta }])).rejects.toThrow("counterpart_without_key");
    expect(calls.some((url) => url.includes("evidence-files"))).toBe(false);
  });

  it("rechaza tandas vacías o demasiado grandes sin tocar la red", async () => {
    const { calls, deps } = harness();
    await expect(uploadEvidenceBatch(deps, 1, [])).rejects.toThrow("invalid_batch_size");
    await expect(uploadEvidenceBatch(deps, 1, Array.from({ length: 21 }, () => ({ file, meta })))).rejects.toThrow("invalid_batch_size");
    expect(calls).toHaveLength(0);
  });
});
