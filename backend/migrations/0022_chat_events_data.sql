-- Datos chicos de un hecho del chat (cantidad de pruebas, monto, número de hito...). Nunca nada privado.
ALTER TABLE chat_events ADD COLUMN data TEXT;
