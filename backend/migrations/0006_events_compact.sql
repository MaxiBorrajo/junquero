CREATE TABLE events_new (
  block_number INTEGER NOT NULL,
  log_index INTEGER NOT NULL,
  block_timestamp INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  contract TEXT NOT NULL,
  address TEXT NOT NULL,
  name TEXT NOT NULL,
  order_id INTEGER,
  case_id INTEGER,
  args TEXT NOT NULL,
  PRIMARY KEY (block_number, log_index)
) WITHOUT ROWID;

INSERT INTO events_new (block_number, log_index, block_timestamp, tx_hash, contract, address, name, order_id, case_id, args)
  SELECT block_number, log_index, block_timestamp, tx_hash, contract, address, name, order_id, case_id, args FROM events;

DROP TABLE events;
ALTER TABLE events_new RENAME TO events;

CREATE INDEX idx_events_order ON events (order_id, block_number, log_index);
CREATE INDEX idx_events_case ON events (case_id, block_number, log_index);
CREATE INDEX idx_events_contract ON events (contract, block_number, log_index);
CREATE INDEX idx_events_name ON events (name, block_number, log_index);

DELETE FROM meta WHERE key = 'events_synced_rowid';
UPDATE sync_state SET last_block = MAX(last_block - 30, 0);
