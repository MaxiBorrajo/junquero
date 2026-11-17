import { keccak256, type Hex } from "viem";

// Código corto para dictar en persona cuando la cámara no anda. Sale de la propia firma (40 bits de su hash, en base 32 sin
// letras que se confunden). Es la misma regla que usa el servidor (backend/src/releases.ts): si una cambia, cambia la otra.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 8;

export function releaseCode(signature: string): string {
  const hash = keccak256(signature as Hex);
  let bits = 0n;
  for (let index = 0; index < 5; index += 1) bits = (bits << 8n) | BigInt(`0x${hash.slice(2 + index * 2, 4 + index * 2)}`);
  let code = "";
  for (let index = CODE_LENGTH - 1; index >= 0; index -= 1) code += ALPHABET[Number((bits >> BigInt(index * 5)) & 31n)];
  return code;
}

// "228DQV28" se muestra como "228D-QV28".
export const formatCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`;

// Acepta mayúsculas, minúsculas, guiones y espacios, y las letras que se confunden con números (O por 0, I y L por 1).
export const normalizeCode = (raw: string): string => raw.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");

export const isShortCode = (raw: string): boolean => normalizeCode(raw).length === CODE_LENGTH && !raw.trim().startsWith("{");
