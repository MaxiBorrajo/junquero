export interface SqlCursor {
  toArray(): unknown[];
}

export interface SqlLike {
  exec(query: string, ...bindings: (string | number | null)[]): SqlCursor;
}

export interface ChatMessage {
  seq: number;
  sender: string;
  nonce: string;
  body: string;
  clientId: string;
  createdAt: number;
}

export const MAX_BODY_CHARS = 8192;
export const MAX_PER_MINUTE = 20;
export const HISTORY_DEFAULT = 50;
export const HISTORY_MAX = 200;
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;

export interface SendInput {
  nonce: unknown;
  body: unknown;
  clientId: unknown;
}

export type AppendResult =
  | { ok: true; message: ChatMessage; duplicate: boolean }
  | { ok: false; status: 400 | 429; error: string };

interface Row {
  seq: number;
  sender: string;
  nonce: string;
  body: string;
  client_id: string;
  created_at: number;
}

const toMessage = (row: Row): ChatMessage => ({
  seq: row.seq,
  sender: row.sender,
  nonce: row.nonce,
  body: row.body,
  clientId: row.client_id,
  createdAt: row.created_at,
});

export class ChatStore {
  constructor(private readonly sql: SqlLike) {
    sql.exec(`CREATE TABLE IF NOT EXISTS messages (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      sender TEXT NOT NULL,
      nonce TEXT NOT NULL,
      body TEXT NOT NULL,
      client_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (sender, client_id)
    )`);
    sql.exec("CREATE INDEX IF NOT EXISTS messages_sender_time ON messages (sender, created_at)");
  }

  append(sender: string, input: SendInput, nowSeconds: number): AppendResult {
    const { nonce, body, clientId } = input;
    if (typeof nonce !== "string" || nonce.length < 16 || nonce.length > 64 || !BASE64.test(nonce)) {
      return { ok: false, status: 400, error: "invalid nonce" };
    }
    if (typeof body !== "string" || body.length < 1 || body.length > MAX_BODY_CHARS || !BASE64.test(body)) {
      return { ok: false, status: 400, error: "invalid body" };
    }
    if (typeof clientId !== "string" || !CLIENT_ID.test(clientId)) return { ok: false, status: 400, error: "invalid client id" };

    const existing = this.sql.exec("SELECT * FROM messages WHERE sender = ? AND client_id = ?", sender, clientId).toArray() as Row[];
    if (existing.length) return { ok: true, message: toMessage(existing[0]), duplicate: true };

    const recent = this.sql
      .exec("SELECT COUNT(*) AS total FROM messages WHERE sender = ? AND created_at > ?", sender, nowSeconds - 60)
      .toArray() as { total: number }[];
    if (recent[0].total >= MAX_PER_MINUTE) return { ok: false, status: 429, error: "too many messages" };

    this.sql.exec("INSERT INTO messages (sender, nonce, body, client_id, created_at) VALUES (?, ?, ?, ?, ?)", sender, nonce, body, clientId, nowSeconds);
    const stored = this.sql.exec("SELECT * FROM messages WHERE sender = ? AND client_id = ?", sender, clientId).toArray() as Row[];
    return { ok: true, message: toMessage(stored[0]), duplicate: false };
  }

  history(afterSeq: number, limit: number): ChatMessage[] {
    const bounded = Math.min(Math.max(limit, 1), HISTORY_MAX);
    const rows = this.sql.exec("SELECT * FROM messages WHERE seq > ? ORDER BY seq LIMIT ?", afterSeq, bounded).toArray() as Row[];
    return rows.map(toMessage);
  }
}
