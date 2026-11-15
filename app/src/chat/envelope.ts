// Un mensaje del chat es texto, o texto más adjuntos. Los mensajes con adjuntos empiezan con un carácter de control
// y llevan un JSON; los que no, son texto plano (así los mensajes viejos se siguen leyendo).
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENTS_PER_MESSAGE = 5;
export const ATTACHMENT_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

const PREFIX = "\u0001";
const HASH = /^[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

export interface ChatFile {
  hash: string;
  name: string;
  mime: string;
  size: number;
  key: string;
  nonce: string;
}

export interface Envelope {
  text: string;
  files: ChatFile[];
}

export function encodeEnvelope(text: string, files: ChatFile[]): string {
  if (files.length === 0) return text;
  return PREFIX + JSON.stringify({ v: 1, t: text, f: files });
}

function validFile(value: unknown): value is ChatFile {
  if (typeof value !== "object" || value === null) return false;
  const file = value as Record<string, unknown>;
  return (
    typeof file.hash === "string" && HASH.test(file.hash) &&
    typeof file.name === "string" && file.name.length > 0 && file.name.length <= 160 &&
    typeof file.mime === "string" && ATTACHMENT_MIME.has(file.mime) &&
    typeof file.size === "number" && Number.isSafeInteger(file.size) && file.size > 0 && file.size <= ATTACHMENT_MAX_BYTES &&
    typeof file.key === "string" && file.key.length <= 64 && BASE64.test(file.key) &&
    typeof file.nonce === "string" && file.nonce.length <= 64 && BASE64.test(file.nonce)
  );
}

export function decodeEnvelope(plain: string | null): Envelope | null {
  if (plain === null) return null;
  if (!plain.startsWith(PREFIX)) return { text: plain, files: [] };
  try {
    const raw = JSON.parse(plain.slice(1)) as { v?: unknown; t?: unknown; f?: unknown };
    if (raw.v !== 1 || typeof raw.t !== "string" || !Array.isArray(raw.f)) return null;
    const files = raw.f.filter(validFile).slice(0, ATTACHMENTS_PER_MESSAGE);
    return { text: raw.t, files };
  } catch {
    return null;
  }
}

export const formatSize = (bytes: number): string => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
