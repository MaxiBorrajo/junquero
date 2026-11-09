export const PUBLIC_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);
export const SELFIE_MIME = new Set(["image/jpeg", "image/png"]);
export const MAX_PUBLIC_BYTES = 25 * 1024 * 1024;
export const MAX_SELFIE_BYTES = 2 * 1024 * 1024;
export const MAX_FILES_PER_OWNER = 200;
export const MAX_BYTES_PER_OWNER = 200 * 1024 * 1024;
export const ORPHAN_TTL_SECONDS = 24 * 3600;
const HEX32 = /^[0-9a-f]{64}$/;
const INLINE_MIME = /^(image\/|video\/|application\/pdf$|text\/plain$)/;
const DELETE_BATCH = 100;

export type FileKind = "public" | "selfie";

export interface FileRow {
  owner: string;
  hash: string;
  kind: FileKind;
  mime: string;
  size: number;
  linked: number;
  created_at: number;
}

export interface UploadRequest {
  hash: string;
  mime: string;
  size: number;
}

export type UploadParse = { ok: true; value: UploadRequest } | { ok: false; status: 400 | 411 | 413 | 415; error: string };

export function parseUpload(headers: Headers, kind: FileKind): UploadParse {
  const hash = (headers.get("x-content-sha256") ?? "").toLowerCase();
  if (!HEX32.test(hash)) return { ok: false, status: 400, error: "x-content-sha256 must be 64 hex characters" };
  const mime = (headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const allowed = kind === "selfie" ? SELFIE_MIME : PUBLIC_MIME;
  if (!allowed.has(mime)) return { ok: false, status: 415, error: "file type not allowed" };
  const length = headers.get("content-length");
  if (length === null) return { ok: false, status: 411, error: "content-length is required" };
  const size = Number(length);
  if (!Number.isSafeInteger(size) || size <= 0) return { ok: false, status: 400, error: "invalid content-length" };
  if (size > (kind === "selfie" ? MAX_SELFIE_BYTES : MAX_PUBLIC_BYTES)) return { ok: false, status: 413, error: "file is too large" };
  return { ok: true, value: { hash, mime, size } };
}

export const objectKey = (owner: string, hash: string) => `files/${owner}/${hash}`;

export type StoreOutcome =
  | { ok: true; created: boolean }
  | { ok: false; status: 400 | 429; error: string };

export async function storeFile(
  db: D1Database,
  bucket: R2Bucket,
  owner: string,
  kind: FileKind,
  upload: UploadRequest,
  body: ReadableStream | null,
  nowSeconds: number,
  linked = false,
): Promise<StoreOutcome> {
  const existing = await db.prepare("SELECT kind FROM files WHERE owner = ? AND hash = ?").bind(owner, upload.hash).first<{ kind: string }>();
  if (existing) return existing.kind === kind ? { ok: true, created: false } : { ok: false, status: 400, error: "hash already used for another kind of file" };
  if (!body) return { ok: false, status: 400, error: "empty body" };

  const usage = await db
    .prepare("SELECT COUNT(*) AS total, COALESCE(SUM(size), 0) AS bytes FROM files WHERE owner = ?")
    .bind(owner)
    .first<{ total: number; bytes: number }>();
  if ((usage?.total ?? 0) >= MAX_FILES_PER_OWNER || (usage?.bytes ?? 0) + upload.size > MAX_BYTES_PER_OWNER) {
    return { ok: false, status: 429, error: "storage quota reached" };
  }

  try {
    await bucket.put(objectKey(owner, upload.hash), body, { sha256: upload.hash, httpMetadata: { contentType: upload.mime } });
  } catch {
    return { ok: false, status: 400, error: "content does not match x-content-sha256" };
  }
  await db
    .prepare("INSERT OR IGNORE INTO files (owner, hash, kind, mime, size, linked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(owner, upload.hash, kind, upload.mime, upload.size, linked ? 1 : 0, nowSeconds)
    .run();
  return { ok: true, created: true };
}

export async function readFile(db: D1Database, bucket: R2Bucket, owner: string, hash: string, kind: FileKind) {
  const row = await db.prepare("SELECT mime, size FROM files WHERE owner = ? AND hash = ? AND kind = ?").bind(owner, hash, kind).first<{ mime: string; size: number }>();
  if (!row) return null;
  const object = await bucket.get(objectKey(owner, hash));
  return object ? { object, mime: row.mime, size: row.size } : null;
}

export function fileHeaders(mime: string, size: number, cacheable: boolean): Headers {
  const headers = new Headers({
    "content-type": mime,
    "content-length": String(size),
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox; default-src 'none'",
    "cross-origin-resource-policy": "cross-origin",
  });
  if (!INLINE_MIME.test(mime)) headers.set("content-disposition", "attachment");
  headers.set("cache-control", cacheable ? "public, max-age=31536000, immutable" : "private, no-store");
  return headers;
}

export async function requireOwnedPublicFiles(
  db: D1Database,
  owner: string,
  files: { hash: string; mime: string; size: number }[],
): Promise<string | null> {
  if (!files.length) return null;
  const placeholders = files.map(() => "?").join(",");
  const { results } = await db
    .prepare(`SELECT hash, mime, size FROM files WHERE owner = ? AND kind = 'public' AND hash IN (${placeholders})`)
    .bind(owner, ...files.map((file) => file.hash))
    .all<{ hash: string; mime: string; size: number }>();
  const stored = new Map(results.map((row) => [row.hash, row]));
  for (const file of files) {
    const match = stored.get(file.hash);
    if (!match || match.mime !== file.mime || match.size !== file.size) return `unknown attachment ${file.hash}`;
  }
  return null;
}

export async function linkFiles(db: D1Database, owner: string, hashes: string[]): Promise<void> {
  if (!hashes.length) return;
  const placeholders = hashes.map(() => "?").join(",");
  await db.prepare(`UPDATE files SET linked = 1 WHERE owner = ? AND hash IN (${placeholders})`).bind(owner, ...hashes).run();
}

export async function deleteFile(db: D1Database, bucket: R2Bucket, owner: string, hash: string): Promise<void> {
  await bucket.delete(objectKey(owner, hash));
  await db.prepare("DELETE FROM files WHERE owner = ? AND hash = ?").bind(owner, hash).run();
}

export async function purgeOrphanFiles(db: D1Database, bucket: R2Bucket, nowSeconds: number): Promise<number> {
  const { results } = await db
    .prepare("SELECT owner, hash FROM files WHERE linked = 0 AND created_at < ? LIMIT ?")
    .bind(nowSeconds - ORPHAN_TTL_SECONDS, DELETE_BATCH)
    .all<{ owner: string; hash: string }>();
  if (!results.length) return 0;
  await bucket.delete(results.map((row) => objectKey(row.owner, row.hash)));
  await db.batch(results.map((row) => db.prepare("DELETE FROM files WHERE owner = ? AND hash = ?").bind(row.owner, row.hash)));
  return results.length;
}
