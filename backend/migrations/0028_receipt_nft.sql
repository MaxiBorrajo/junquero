-- Comprobante NFT: la liberación firmada lleva la huella del comentario de quien publica, y el texto del comentario se guarda aparte.
ALTER TABLE releases ADD COLUMN comment_hash TEXT NOT NULL DEFAULT '0x0000000000000000000000000000000000000000000000000000000000000000';

CREATE TABLE rating_comments (
  order_id INTEGER PRIMARY KEY,
  payer TEXT NOT NULL,
  hash TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
) WITHOUT ROWID;
