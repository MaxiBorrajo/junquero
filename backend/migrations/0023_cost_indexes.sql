-- Índices que faltaban: cada uno evita recorrer una tabla entera en una consulta que se repite todo el día.
CREATE INDEX notifications_by_address ON notifications (address, created_at DESC, id DESC);
CREATE INDEX order_parties_payee ON order_parties (payee);
CREATE INDEX order_parties_payer ON order_parties (payer);
CREATE INDEX applications_applicant_id ON applications (applicant, id DESC);
CREATE INDEX applications_status ON applications (status);
CREATE INDEX relay_log_time ON relay_log (created_at);
CREATE INDEX task_log_time ON task_log (created_at);

-- Calificaciones recibidas, guardadas de forma durable (las de `releases` se borran a las 24 h de vencer).
-- idx = -1 para el pago único de un trabajo y el número de hito para los pagos por hitos.
CREATE TABLE payee_ratings (
  payee TEXT NOT NULL,
  order_id INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  PRIMARY KEY (order_id, idx)
) WITHOUT ROWID;

CREATE INDEX payee_ratings_payee ON payee_ratings (payee);
