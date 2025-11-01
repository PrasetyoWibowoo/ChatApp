CREATE TABLE IF NOT EXISTS document_snapshots (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 0,
  snapshot BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary TEXT NULL
);
