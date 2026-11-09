import { keccak256, type Hex } from "viem";
import nacl from "tweetnacl";
import { fromHex, toHex } from "../lib/hex";
import { fromBase64, toBase64 } from "./base64";

export const CHAT_KEY_MESSAGE = "Junquero: clave de chat v1";

export const buildChatKeyMessage = (address: string, publicKeyHex: string): string =>
  `Junquero: esta es mi clave de chat.\nBilletera: ${address.toLowerCase()}\nClave: ${publicKeyHex.toLowerCase()}`;

export interface ChatKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export function seedFromSignature(signature: Hex): Uint8Array {
  return fromHex(keccak256(signature));
}

export function keyPairFromSeed(seed: Uint8Array): ChatKeyPair {
  if (seed.length !== 32) throw new Error("la semilla debe tener 32 bytes");
  const secretKey = nacl.hash(seed).slice(0, 32);
  const pair = nacl.box.keyPair.fromSecretKey(secretKey);
  return { publicKey: pair.publicKey, secretKey: pair.secretKey };
}

export interface Sealed {
  nonce: string;
  body: string;
}

export function seal(text: string, theirPublicKey: Uint8Array, mine: ChatKeyPair): Sealed {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(new TextEncoder().encode(text), nonce, theirPublicKey, mine.secretKey);
  return { nonce: toBase64(nonce), body: toBase64(box) };
}

export function open(sealed: Sealed, theirPublicKey: Uint8Array, mine: ChatKeyPair): string | null {
  try {
    const plain = nacl.box.open(fromBase64(sealed.body), fromBase64(sealed.nonce), theirPublicKey, mine.secretKey);
    return plain ? new TextDecoder().decode(plain) : null;
  } catch {
    return null;
  }
}

export const publicKeyHex = (pair: ChatKeyPair): string => toHex(pair.publicKey);
export const secretKeyHex = (pair: ChatKeyPair): string => toHex(pair.secretKey);

export function pairFromSecretHex(hex: string): ChatKeyPair {
  const secretKey = fromHex(hex);
  const pair = nacl.box.keyPair.fromSecretKey(secretKey);
  return { publicKey: pair.publicKey, secretKey: pair.secretKey };
}
