CREATE TABLE profiles (
  address TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  categories TEXT NOT NULL DEFAULT '[]',
  work_lat_e3 INTEGER NOT NULL,
  work_lng_e3 INTEGER NOT NULL,
  work_radius_m INTEGER NOT NULL,
  selfie_status TEXT NOT NULL DEFAULT 'none',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE changas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  spec_hash TEXT NOT NULL,
  spec TEXT NOT NULL,
  category INTEGER NOT NULL,
  modality TEXT NOT NULL,
  lat_e3 INTEGER,
  lng_e3 INTEGER,
  cell_lat INTEGER,
  cell_lng INTEGER,
  order_id INTEGER,
  token TEXT,
  amount TEXT,
  amount_micro INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL,
  UNIQUE (owner, spec_hash)
);

CREATE INDEX changas_map ON changas (status, cell_lat, cell_lng, id);
CREATE INDEX changas_remote ON changas (status, modality, id);
CREATE INDEX changas_owner ON changas (owner, id);
CREATE INDEX changas_order ON changas (order_id);
