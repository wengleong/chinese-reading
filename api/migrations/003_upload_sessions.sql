-- Phone upload sessions — replaces in-memory Map so restarts don't lose sessions
CREATE TABLE IF NOT EXISTS phone_upload_sessions (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  files JSONB NOT NULL DEFAULT '[]',
  done BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-clean sessions older than 15 minutes (run periodically via DELETE)
CREATE INDEX IF NOT EXISTS idx_phone_upload_sessions_created ON phone_upload_sessions(created_at);
