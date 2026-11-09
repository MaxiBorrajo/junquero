import sodium from "libsodium-wrappers";
import { beforeAll, describe, expect, it } from "vitest";
import { fromBase64, toBase64 } from "../src/crypto/base64";
import { keyPairFromSeed, open, pairFromSecretHex, publicKeyHex, secretKeyHex, seal, seedFromSignature, buildChatKeyMessage } from "../src/crypto/chat";

beforeAll(async () => {
  await sodium.ready;
});

const seed = (n: number) => new Uint8Array(32).fill(n);

describe("base64", () => {
  it("hace ida y vuelta con distintos largos", () => {
    for (const length of [0, 1, 2, 3, 4, 5, 31, 32, 100]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) % 256);
      expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
    }
  });
  it("coincide con la codificación estándar", () => {
    expect(toBase64(new TextEncoder().encode("Junquero"))).toBe(Buffer.from("Junquero").toString("base64"));
  });
  it("rechaza texto inválido", () => {
    expect(() => fromBase64("a$b=")).toThrow();
    expect(() => fromBase64("a")).toThrow();
  });
});

describe("clave de chat", () => {
  it("es determinista y coincide con crypto_box_seed_keypair de libsodium", () => {
    for (const n of [1, 7, 200]) {
      const ours = keyPairFromSeed(seed(n));
      const theirs = sodium.crypto_box_seed_keypair(seed(n));
      expect(Array.from(ours.publicKey)).toEqual(Array.from(theirs.publicKey));
      expect(Array.from(ours.secretKey)).toEqual(Array.from(theirs.privateKey));
    }
  });

  it("la semilla sale de keccak256 de la firma", () => {
    const sig = ("0x" + "11".repeat(65)) as `0x${string}`;
    expect(seedFromSignature(sig)).toHaveLength(32);
    expect(Array.from(seedFromSignature(sig))).toEqual(Array.from(seedFromSignature(sig)));
  });

  it("se recupera desde la clave secreta guardada", () => {
    const pair = keyPairFromSeed(seed(5));
    const again = pairFromSecretHex(secretKeyHex(pair));
    expect(publicKeyHex(again)).toBe(publicKeyHex(pair));
  });

  it("arma el texto que firma la billetera con la dirección en minúsculas", () => {
    expect(buildChatKeyMessage("0xABCdef0000000000000000000000000000000001", "AABB")).toBe(
      "Junquero: esta es mi clave de chat.\nBilletera: 0xabcdef0000000000000000000000000000000001\nClave: aabb",
    );
  });
});

describe("mensajes", () => {
  const alice = keyPairFromSeed(seed(1));
  const bob = keyPairFromSeed(seed(2));
  const eve = keyPairFromSeed(seed(3));

  it("los dos extremos pueden leer y un tercero no", () => {
    const sealed = seal("Hola, ¿a qué hora llegás? 👋", bob.publicKey, alice);
    expect(open(sealed, alice.publicKey, bob)).toBe("Hola, ¿a qué hora llegás? 👋");
    expect(open(sealed, bob.publicKey, alice)).toBe("Hola, ¿a qué hora llegás? 👋");
    expect(open(sealed, alice.publicKey, eve)).toBeNull();
  });

  it("detecta mensajes alterados y datos corruptos", () => {
    const sealed = seal("secreto", bob.publicKey, alice);
    const bytes = fromBase64(sealed.body);
    bytes[0] = bytes[0]! ^ 1;
    expect(open({ ...sealed, body: toBase64(bytes) }, alice.publicKey, bob)).toBeNull();
    expect(open({ nonce: "???", body: "???" }, alice.publicKey, bob)).toBeNull();
  });

  it("es compatible con crypto_box_easy de libsodium en los dos sentidos", () => {
    const ours = seal("hola", bob.publicKey, alice);
    const plain = sodium.crypto_box_open_easy(fromBase64(ours.body), fromBase64(ours.nonce), alice.publicKey, bob.secretKey);
    expect(new TextDecoder().decode(plain)).toBe("hola");

    const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
    const box = sodium.crypto_box_easy(new TextEncoder().encode("respuesta"), nonce, alice.publicKey, bob.secretKey);
    expect(open({ nonce: toBase64(nonce), body: toBase64(box) }, bob.publicKey, alice)).toBe("respuesta");
  });

  it("cada mensaje usa un nonce distinto", () => {
    expect(seal("x", bob.publicKey, alice).nonce).not.toBe(seal("x", bob.publicKey, alice).nonce);
  });
});
