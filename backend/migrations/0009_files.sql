CREATE TABLE files (
  owner TEXT NOT NULL,
  hash TEXT NOT NULL,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  linked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner, hash)
) WITHOUT ROWID;

CREATE INDEX files_orphans ON files (linked, created_at);

ALTER TABLE profiles ADD COLUMN photo TEXT;
