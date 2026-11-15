-- Historial de un chat: lo que pasó con el acuerdo y el trabajo (propuesta, aceptó, llegó, entregó...).
-- No guarda texto ni nada privado: solo qué pasó, quién fue y cuándo.
CREATE TABLE chat_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  actor TEXT NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX chat_events_once ON chat_events (application_id, kind, ref);
CREATE INDEX chat_events_by_application ON chat_events (application_id, id);
