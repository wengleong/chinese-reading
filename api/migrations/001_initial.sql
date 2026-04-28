-- families table
CREATE TABLE IF NOT EXISTS families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  anthropic_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- students table
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- progress_sessions table
CREATE TABLE IF NOT EXISTS progress_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  story_id TEXT NOT NULL,
  story_title TEXT NOT NULL,
  date TEXT NOT NULL,
  score INTEGER NOT NULL,
  passed BOOLEAN NOT NULL,
  points_earned INTEGER NOT NULL DEFAULT 0,
  transcript TEXT,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- recordings table
CREATE TABLE IF NOT EXISTS recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT,
  student_id TEXT NOT NULL,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  audio_data BYTEA NOT NULL,
  mime_type TEXT NOT NULL,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_students_family ON students(family_id);
CREATE INDEX IF NOT EXISTS idx_sessions_family ON progress_sessions(family_id);
CREATE INDEX IF NOT EXISTS idx_sessions_student ON progress_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_recordings_family ON recordings(family_id);
CREATE INDEX IF NOT EXISTS idx_recordings_student ON recordings(student_id);
