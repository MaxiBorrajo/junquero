-- Comprobantes intransferibles reclamados por quien hizo el trabajo (evento ReceiptClaimed del contrato Receipt).
-- Solo guardan categoría y mes, sin datos personales: son públicos igual que en la cadena.
CREATE TABLE receipts (
  order_id INTEGER PRIMARY KEY,
  payee TEXT NOT NULL,
  category INTEGER NOT NULL,
  month INTEGER NOT NULL
);

CREATE INDEX receipts_payee ON receipts (payee, order_id DESC);
