CREATE TABLE push_tokens (
  token TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  platform TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX push_tokens_address ON push_tokens (address, updated_at);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  due_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX notifications_pending ON notifications (address, kind, ref) WHERE sent_at IS NULL;
CREATE INDEX notifications_due ON notifications (sent_at, due_at);
