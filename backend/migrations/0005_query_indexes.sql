CREATE INDEX idx_events_contract ON events (contract, block_number, log_index);

DROP INDEX idx_events_name;
CREATE INDEX idx_events_name ON events (name, block_number, log_index);
