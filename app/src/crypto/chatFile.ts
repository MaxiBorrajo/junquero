import nacl from "tweetnacl";
import { fromBase64, toBase64 } from "./base64";

// Cada adjunto se cifra con una clave propia de un solo uso. La clave viaja dentro del mensaje (que ya va cifrado
// de punta a punta), así que el servidor solo ve bytes sin sentido.
export interface EncryptedFile {
  cipher: Uint8Array;
  key: string;
  nonce: string;
}

export function encryptFile(bytes: Uint8Array): EncryptedFile {
  const key = nacl.randomBytes(nacl.secretbox.keyLength);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  return { cipher: nacl.secretbox(bytes, nonce, key), key: toBase64(key), nonce: toBase64(nonce) };
}

export function decryptFile(cipher: Uint8Array, key: string, nonce: string): Uint8Array | null {
  try {
    return nacl.secretbox.open(cipher, fromBase64(nonce), fromBase64(key));
  } catch {
    return null;
  }
}
