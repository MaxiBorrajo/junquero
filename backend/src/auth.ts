import { isAddress, isHex, recoverMessageAddress, type Address, type Hex } from "viem";

export const LOGIN_WINDOW_SECONDS = 300;
export const TOKEN_TTL_SECONDS = 7 * 24 * 3600;
export const TICKET_TTL_SECONDS = 60;

export interface LoginRequest {
  address: Address;
  issuedAt: number;
  signature: Hex;
}

export const buildChatKeyMessage = (address: string, publicKeyHex: string): string =>
  `Junquero: esta es mi clave de chat.\nBilletera: ${address.toLowerCase()}\nClave: ${publicKeyHex.toLowerCase()}`;

export const buildEvidenceMessage = (orderId: number, fileHash: string, metaHash: string): string =>
  `Junquero: firmo esta prueba de la changa ${orderId}.\nArchivo: ${fileHash.toLowerCase()}\nDatos: ${metaHash.toLowerCase()}`;

export interface EvidenceEntry {
  fileHash: string;
  metaHash: string;
}

export const buildEvidenceBatchMessage = (orderId: number, entries: EvidenceEntry[]): string =>
  `Junquero: firmo estas ${entries.length} pruebas de la changa ${orderId}.\n${entries
    .map((entry, index) => `${index + 1}. Archivo: ${entry.fileHash.toLowerCase()}\n${index + 1}. Datos: ${entry.metaHash.toLowerCase()}`)
    .join("\n")}`;

export const buildLoginMessage = (address: string, issuedAt: number): string =>
  `Junquero: confirmo que esta billetera es mía.\nBilletera: ${address.toLowerCase()}\nEmitido: ${issuedAt}`;

export function parseLogin(body: unknown): LoginRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = body as Record<string, unknown>;
  if (typeof raw.address !== "string" || !isAddress(raw.address)) return null;
  if (typeof raw.signature !== "string" || !isHex(raw.signature)) return null;
  if (!Number.isSafeInteger(raw.issuedAt) || (raw.issuedAt as number) <= 0) return null;
  return { address: raw.address as Address, issuedAt: raw.issuedAt as number, signature: raw.signature };
}

export async function verifyLogin(request: LoginRequest, nowSeconds: number): Promise<string | null> {
  if (Math.abs(nowSeconds - request.issuedAt) > LOGIN_WINDOW_SECONDS) return null;
  try {
    const signer = await recoverMessageAddress({
      message: buildLoginMessage(request.address, request.issuedAt),
      signature: request.signature,
    });
    return signer.toLowerCase() === request.address.toLowerCase() ? request.address.toLowerCase() : null;
  } catch {
    return null;
  }
}

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromBase64Url = (text: string): Uint8Array | null => {
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
};

const hmacKey = (secret: string, usage: "sign" | "verify") =>
  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);

export async function issueToken(
  secret: string,
  address: string,
  nowSeconds: number,
  ttlSeconds = TOKEN_TTL_SECONDS,
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = nowSeconds + ttlSeconds;
  const payload = toBase64Url(encoder.encode(`${address.toLowerCase()}.${expiresAt}`));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(payload));
  return { token: `${payload}.${toBase64Url(new Uint8Array(signature))}`, expiresAt };
}

export async function verifyToken(secret: string, token: string, nowSeconds: number): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const signatureBytes = fromBase64Url(signature);
  if (!signatureBytes) return null;
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), signatureBytes, encoder.encode(payload));
  if (!valid) return null;
  const decoded = fromBase64Url(payload);
  if (!decoded) return null;
  const [address, expiry] = new TextDecoder().decode(decoded).split(".");
  if (!isAddress(address) || !(Number(expiry) > nowSeconds)) return null;
  return address.toLowerCase();
}
