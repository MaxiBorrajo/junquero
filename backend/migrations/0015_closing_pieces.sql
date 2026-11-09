CREATE TABLE group_contributors (
  order_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  PRIMARY KEY (order_id, address)
) WITHOUT ROWID;

CREATE INDEX group_contributors_address ON group_contributors (address);

CREATE TABLE releases (
  order_id INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  payee TEXT NOT NULL,
  amount TEXT NOT NULL,
  rating INTEGER NOT NULL,
  evidence_hash TEXT NOT NULL,
  expiry INTEGER NOT NULL,
  signature TEXT NOT NULL,
  milestone INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (order_id, idx)
) WITHOUT ROWID;

ALTER TABLE applications ADD COLUMN plan TEXT;
ALTER TABLE agreements ADD COLUMN plan TEXT;

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter TEXT NOT NULL,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  resolved_by TEXT,
  resolved_at INTEGER,
  resolution TEXT
);

CREATE UNIQUE INDEX reports_once ON reports (reporter, kind, target);
CREATE INDEX reports_status ON reports (status, id);
