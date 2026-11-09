const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i += 1) LOOKUP[ALPHABET[i]!] = i;
LOOKUP["-"] = 62;
LOOKUP["_"] = 63;

export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(triple >> 18) & 63]! + ALPHABET[(triple >> 12) & 63]!;
    out += b === undefined ? "=" : ALPHABET[(triple >> 6) & 63]!;
    out += c === undefined ? "=" : ALPHABET[triple & 63]!;
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, "");
  if (/[^A-Za-z0-9+/_-]/.test(clean) || clean.length % 4 === 1) throw new Error("base64 inválido");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of clean) {
    buffer = (buffer << 6) | LOOKUP[char]!;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (buffer >> bits) & 255;
    }
  }
  return out;
}
