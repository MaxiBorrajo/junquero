-- La limpieza de archivos vencidos (adjuntos del chat y pruebas) busca por tipo y antigüedad.
CREATE INDEX files_kind_created ON files (kind, created_at);
