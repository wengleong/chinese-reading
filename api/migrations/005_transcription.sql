-- 005_transcription.sql — server-side speech transcription fallback.
-- Gated by:
--   (1) global env flag ENABLE_SERVER_TRANSCRIBE=true + OPENAI_API_KEY set
--   (2) per-family transcription_consent (default false; parent opts in)
--   (3) per-family monthly cost cap via TRANSCRIBE_MONTHLY_CAP_CENTS
-- Both the global flag and per-family consent must be true before a
-- family's audio is forwarded to the transcription vendor. See
-- docs/pii-transcription-review.md for the data-flow review.

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS transcription_consent BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS transcription_usage (
  family_id      UUID        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  year_month     TEXT        NOT NULL,
  seconds_used   INTEGER     NOT NULL DEFAULT 0,
  cost_cents     INTEGER     NOT NULL DEFAULT 0,
  call_count     INTEGER     NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (family_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_transcription_usage_family
  ON transcription_usage(family_id);
