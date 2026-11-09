import { keccak256, type Hex } from "viem";
import nacl from "tweetnacl";
import { fromBase64, toBase64 } from "../crypto/base64";
import type { ChatKeyPair } from "../crypto/chat";
import { fromHex, toHex } from "../lib/hex";

const NONCE = nacl.secretbox.nonceLength;

export interface EvidenceMeta {
  capturedAt: number;
  lat?: number;
  lng?: number;
  name: string;
  mime: string;
}

export interface EncryptedEvidence {
  cipher: Uint8Array;
  key: Uint8Array;
  meta: string;
}

const join = (nonce: Uint8Array, box: Uint8Array): Uint8Array => {
  const out = new Uint8Array(nonce.length + box.length);
  out.set(nonce, 0);
  out.set(box, nonce.length);
  return out;
};

function openJoined(data: Uint8Array, key: Uint8Array): Uint8Array | null {
  if (data.length <= NONCE) return null;
  return nacl.secretbox.open(data.slice(NONCE), data.slice(0, NONCE), key);
}

export function encryptEvidence(file: Uint8Array, meta: EvidenceMeta): EncryptedEvidence {
  const key = nacl.randomBytes(nacl.secretbox.keyLength);
  const fileNonce = nacl.randomBytes(NONCE);
  const metaNonce = nacl.randomBytes(NONCE);
  const cipher = join(fileNonce, nacl.secretbox(file, fileNonce, key));
  const metaCipher = join(metaNonce, nacl.secretbox(new TextEncoder().encode(JSON.stringify(meta)), metaNonce, key));
  return { cipher, key, meta: toBase64(metaCipher) };
}

export const decryptFile = (cipher: Uint8Array, key: Uint8Array): Uint8Array | null => openJoined(cipher, key);

export function decryptMeta(meta: string, key: Uint8Array): EvidenceMeta | null {
  try {
    const plain = openJoined(fromBase64(meta), key);
    return plain ? (JSON.parse(new TextDecoder().decode(plain)) as EvidenceMeta) : null;
  } catch {
    return null;
  }
}

export function wrapKey(key: Uint8Array, recipientPublicKey: Uint8Array, mine: ChatKeyPair): string {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  return toBase64(join(nonce, nacl.box(key, nonce, recipientPublicKey, mine.secretKey)));
}

export function unwrapKey(wrapped: string, senderPublicKey: Uint8Array, mine: ChatKeyPair): Uint8Array | null {
  try {
    const data = fromBase64(wrapped);
    return nacl.box.open(data.slice(nacl.box.nonceLength), data.slice(0, nacl.box.nonceLength), senderPublicKey, mine.secretKey);
  } catch {
    return null;
  }
}

export function evidenceBundleHash(hashes: string[]): Hex {
  const sorted = hashes.map((hash) => hash.replace(/^0x/, "").toLowerCase()).sort();
  const bytes = new Uint8Array(sorted.length * 32);
  sorted.forEach((hash, index) => bytes.set(fromHex(hash), index * 32));
  return keccak256(`0x${toHex(bytes)}`);
}
