CREATE TABLE applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  changa_id INTEGER NOT NULL,
  applicant TEXT NOT NULL,
  amount TEXT,
  message TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (changa_id, applicant)
);

CREATE INDEX applications_changa ON applications (changa_id, status, id);
CREATE INDEX applications_applicant ON applications (applicant, status, id);
