CREATE TABLE order_parties (
  order_id INTEGER PRIMARY KEY,
  payer TEXT,
  payee TEXT
);

CREATE TABLE order_cases (
  case_id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL
);

CREATE INDEX order_cases_order ON order_cases (order_id);

CREATE TABLE case_jurors (
  case_id INTEGER NOT NULL,
  juror TEXT NOT NULL,
  PRIMARY KEY (case_id, juror)
) WITHOUT ROWID;

CREATE INDEX case_jurors_juror ON case_jurors (juror);

CREATE TABLE evidence (
  order_id INTEGER NOT NULL,
  hash TEXT NOT NULL,
  uploader TEXT NOT NULL,
  kind TEXT NOT NULL,
  meta TEXT NOT NULL,
  signature TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (order_id, hash)
) WITHOUT ROWID;

CREATE TABLE evidence_keys (
  order_id INTEGER NOT NULL,
  hash TEXT NOT NULL,
  recipient TEXT NOT NULL,
  wrapped TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (order_id, hash, recipient)
) WITHOUT ROWID;

INSERT OR IGNORE INTO order_parties (order_id, payer)
  SELECT order_id, lower(json_extract(args, '$.payer')) FROM events WHERE name = 'OrderCreated' AND order_id IS NOT NULL;

UPDATE order_parties SET payee = (
  SELECT lower(json_extract(e.args, '$.payee')) FROM events e
  WHERE e.order_id = order_parties.order_id AND e.name IN ('OrderAgreed', 'OrderReserved')
  ORDER BY e.block_number DESC, e.log_index DESC LIMIT 1
) WHERE order_id IN (SELECT order_id FROM events WHERE name IN ('OrderAgreed', 'OrderReserved'));

INSERT OR IGNORE INTO order_cases (case_id, order_id)
  SELECT case_id, order_id FROM events WHERE name = 'CaseOpened' AND case_id IS NOT NULL AND order_id IS NOT NULL;

INSERT OR IGNORE INTO case_jurors (case_id, juror)
  SELECT e.case_id, lower(j.value) FROM events e, json_each(e.args, '$.jurors') j
  WHERE e.name = 'JuryDrawn' AND e.case_id IS NOT NULL;
