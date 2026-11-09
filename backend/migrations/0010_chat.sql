CREATE TABLE chat_keys (
  address TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE chat_meta (
  application_id INTEGER PRIMARY KEY,
  last_seq INTEGER NOT NULL DEFAULT 0,
  last_sender TEXT,
  last_at INTEGER
);

CREATE TABLE chat_reads (
  application_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  seq INTEGER NOT NULL,
  PRIMARY KEY (application_id, address)
) WITHOUT ROWID;
