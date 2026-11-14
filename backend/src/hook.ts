// Aviso de actividad en la cadena (webhook de Alchemy): solo dispara una pasada del indexador.
const encoder = new TextEncoder();
const LOCK_KEY = "sync_lock_until";
const LOCK_MS = 25_000;

const toHex = (buffer: ArrayBuffer): string => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");

// Alchemy firma el cuerpo con HMAC-SHA256 (hex) usando la clave de firma del webhook.
export async function verifySignature(body: string, signingKey: string, signature: string | null | undefined): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(signingKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  const given = signature.toLowerCase();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

// Evita que el cron y el webhook indexen y procesen eventos a la vez. Si ya hay una pasada en curso no hace nada:
// el próximo aviso o el cron siguiente recoge lo que falte.
export async function withSyncLock(db: D1Database, nowMs: number, work: () => Promise<void>): Promise<boolean> {
  await db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES (?, 0)").bind(LOCK_KEY).run();
  const taken = await db.prepare("UPDATE meta SET value = ? WHERE key = ? AND value < ?").bind(nowMs + LOCK_MS, LOCK_KEY, nowMs).run();
  if (!taken.meta.changes) return false;
  try {
    await work();
  } finally {
    await db.prepare("UPDATE meta SET value = 0 WHERE key = ?").bind(LOCK_KEY).run();
  }
  return true;
}

// Los webhooks personalizados avisan en cada bloque, incluso sin eventos nuestros; en ese caso no hace falta indexar.
export function hasNoLogs(body: string): boolean {
  try {
    const logs = (JSON.parse(body) as { event?: { data?: { block?: { logs?: unknown } } } }).event?.data?.block?.logs;
    return Array.isArray(logs) && logs.length === 0;
  } catch {
    return false;
  }
}
