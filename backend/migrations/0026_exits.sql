-- Justificación de quien termina o deja un trabajo, para mostrarla en el chat y en el detalle.
CREATE TABLE exit_reasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX exit_reasons_order ON exit_reasons (order_id, kind, created_at);

-- Cada vez que alguien deja un trabajo (o se lo declara abandonado) queda anotado en su historial.
CREATE TABLE abandonments (
  order_id INTEGER NOT NULL,
  payee TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  log_index INTEGER NOT NULL,
  PRIMARY KEY (order_id, block_number, log_index)
);
CREATE INDEX abandonments_payee ON abandonments (payee);

-- Hitos pagados desde que se acordó por última vez: al reabrirse el trabajo, esos hitos pasan a "ya hechos".
ALTER TABLE changas ADD COLUMN milestones_paid INTEGER NOT NULL DEFAULT 0;
