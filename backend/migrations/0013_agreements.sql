CREATE TABLE agreements (
  order_id INTEGER PRIMARY KEY,
  payer TEXT NOT NULL,
  payee TEXT NOT NULL,
  price TEXT NOT NULL,
  spec_hash TEXT NOT NULL,
  terms_hash TEXT NOT NULL,
  expiry INTEGER NOT NULL,
  payer_signature TEXT NOT NULL,
  status TEXT NOT NULL,
  tx_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX agreements_payer ON agreements (payer);
CREATE INDEX agreements_payee ON agreements (payee);
