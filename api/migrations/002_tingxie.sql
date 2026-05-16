-- api/migrations/002_tingxie.sql
CREATE TABLE IF NOT EXISTS tingxie_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  exam_date DATE NOT NULL,
  words JSONB NOT NULL DEFAULT '[]',
  schedule JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tingxie_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES tingxie_exams(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE, -- denormalised for direct few-shot grade queries (avoids join)
  date DATE NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('practice', 'mock')),
  results JSONB NOT NULL DEFAULT '[]',
  score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  passed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tingxie_exams_family   ON tingxie_exams(family_id);
CREATE INDEX IF NOT EXISTS idx_tingxie_exams_student  ON tingxie_exams(student_id);
CREATE INDEX IF NOT EXISTS idx_tingxie_sessions_exam  ON tingxie_sessions(exam_id);
-- Composite for few-shot grade query: fetch recent sessions by student (student_id + created_at DESC)
CREATE INDEX IF NOT EXISTS idx_tingxie_sessions_student_date ON tingxie_sessions(student_id, created_at DESC);
