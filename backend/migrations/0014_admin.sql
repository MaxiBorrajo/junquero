CREATE TABLE admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX admin_log_time ON admin_log (created_at);

ALTER TABLE changas ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
