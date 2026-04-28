# Chinese Reading App — Cloud Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Railway Express backend for family auth, cloud data sync, and audio recording storage; redesign the recorder as audio-only; redesign achievement + dashboard screens; add sticky mobile record button; bulk-generate 24 new stories.

**Architecture:** Static GitHub Pages site calls a new Express API on Railway. Family code (e.g. `TIGER-2310`) is the auth credential — server returns a JWT on create/join, client stores it in localStorage. Audio recordings stored as bytea in PostgreSQL. `localStorage` stays as primary read cache; all writes also fire async API calls.

**Tech Stack:** Node.js + Express + Railway PostgreSQL (`pg`), `jsonwebtoken`, `multer`; vanilla JS ES modules on the frontend.

---

## File Map

### New: `chinese-reading/api/` (Railway service)

| File | Purpose |
|------|---------|
| `api/src/index.js` | Express app, CORS, routes wiring |
| `api/src/db.js` | pg Pool singleton |
| `api/src/auth.js` | JWT sign/verify + `requireAuth` middleware |
| `api/src/routes/families.js` | POST /api/families, POST /api/families/join, PUT /api/families/apikey |
| `api/src/routes/students.js` | CRUD /api/students |
| `api/src/routes/sessions.js` | POST + GET /api/sessions |
| `api/src/routes/recordings.js` | POST /api/recordings, GET /api/recordings, GET /api/recordings/:id |
| `api/src/routes/generate.js` | POST /api/generate (Anthropic proxy) |
| `api/migrations/001_initial.sql` | Full schema |
| `api/package.json` | Dependencies |
| `api/Dockerfile` | Railway deploy |
| `api/.env.example` | Required env vars |

### Modified: `chinese-reading/` (frontend)

| File | Change |
|------|--------|
| `src/lib/api.js` | New: fetch wrapper with Bearer auth + base URL |
| `src/lib/cloud.js` | New: sync helpers (pushStudent, pushSession, uploadRecording, etc.) |
| `src/components/familyOnboarding.js` | New: create/join family UI |
| `src/app.js` | Boot: check token → show onboarding if needed; init sync |
| `src/lib/students.js` | Fire cloud push on createStudent, deleteStudent, addSession |
| `src/lib/storage.js` | Fire cloud upload after saveRecording |
| `src/components/recorder.js` | Full rewrite: audio-only, sticky mobile bar |
| `src/components/recordingsList.js` | Audio player instead of video |
| `src/components/scoreModal.js` | Animated redesign + badges |
| `src/components/studentDashboard.js` | Points hero + badge wall |
| `src/components/settings.js` | Save API key to cloud |
| `src/components/storyGenerator.js` | Use /api/generate proxy |
| `styles.css` | Mobile sticky recorder, score modal animations, dashboard |

---

## Task 1: API Service Scaffold

**Files:**
- Create: `api/package.json`
- Create: `api/src/index.js`
- Create: `api/src/db.js`
- Create: `api/src/auth.js`
- Create: `api/.env.example`
- Create: `api/Dockerfile`

- [ ] **Step 1: Create api/ directory and package.json**

  ```bash
  mkdir -p "/Users/wengleong/Claude Workspace/chinese-reading/api/src/routes"
  mkdir -p "/Users/wengleong/Claude Workspace/chinese-reading/api/migrations"
  ```

  Create `api/package.json`:

  ```json
  {
    "name": "chinese-reading-api",
    "version": "1.0.0",
    "type": "commonjs",
    "main": "src/index.js",
    "scripts": {
      "start": "node src/index.js",
      "dev": "node --watch src/index.js"
    },
    "dependencies": {
      "cors": "^2.8.5",
      "dotenv": "^16.4.5",
      "express": "^4.18.3",
      "jsonwebtoken": "^9.0.2",
      "multer": "^1.4.5-lts.1",
      "pg": "^8.11.5",
      "uuid": "^9.0.1"
    }
  }
  ```

- [ ] **Step 2: Create .env.example**

  ```
  # api/.env.example
  DATABASE_URL=postgresql://user:pass@host:5432/dbname
  JWT_SECRET=change-me-to-a-long-random-string
  PORT=3001
  ALLOWED_ORIGIN=https://yourusername.github.io
  ```

- [ ] **Step 3: Create db.js**

  ```js
  // api/src/db.js
  require('dotenv').config();
  const { Pool } = require('pg');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
  });

  module.exports = pool;
  ```

- [ ] **Step 4: Create auth.js**

  ```js
  // api/src/auth.js
  const jwt = require('jsonwebtoken');

  const SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';
  const EXPIRY = '365d';

  function signToken(familyId) {
    return jwt.sign({ familyId }, SECRET, { expiresIn: EXPIRY });
  }

  function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const payload = jwt.verify(header.slice(7), SECRET);
      req.familyId = payload.familyId;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  module.exports = { signToken, requireAuth };
  ```

- [ ] **Step 5: Create index.js**

  ```js
  // api/src/index.js
  require('dotenv').config();
  const express = require('express');
  const cors = require('cors');

  const app = express();
  const PORT = process.env.PORT || 3001;

  app.use(cors({
    origin: process.env.ALLOWED_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  app.use(express.json());

  app.use('/api/families',   require('./routes/families'));
  app.use('/api/students',   require('./routes/students'));
  app.use('/api/sessions',   require('./routes/sessions'));
  app.use('/api/recordings', require('./routes/recordings'));
  app.use('/api/generate',   require('./routes/generate'));

  app.get('/health', (_, res) => res.json({ ok: true }));

  app.listen(PORT, () => console.log(`API running on :${PORT}`));
  ```

- [ ] **Step 6: Create Dockerfile**

  ```dockerfile
  # api/Dockerfile
  FROM node:22-alpine
  WORKDIR /app
  COPY package.json .
  RUN npm install --production
  COPY src/ ./src/
  EXPOSE 3001
  CMD ["node", "src/index.js"]
  ```

- [ ] **Step 7: Install dependencies**

  ```bash
  cd "/Users/wengleong/Claude Workspace/chinese-reading/api"
  npm install
  ```

- [ ] **Step 8: Commit**

  ```bash
  cd "/Users/wengleong/Claude Workspace/chinese-reading"
  git add api/
  git commit -m "feat: scaffold railway api service"
  ```

---

## Task 2: Database Schema

**Files:**
- Create: `api/migrations/001_initial.sql`

- [ ] **Step 1: Create migration file**

  ```sql
  -- api/migrations/001_initial.sql

  create extension if not exists "pgcrypto";

  create table if not exists families (
    id          uuid primary key default gen_random_uuid(),
    code        text unique not null,
    anthropic_key text,
    created_at  timestamptz default now()
  );

  create table if not exists students (
    id          text primary key,
    family_id   uuid not null references families(id) on delete cascade,
    name        text not null,
    level       text not null,
    color       text not null,
    created_at  timestamptz default now()
  );

  create table if not exists progress_sessions (
    id            text primary key,
    student_id    text not null references students(id) on delete cascade,
    family_id     uuid not null references families(id) on delete cascade,
    story_id      text not null,
    story_title   text not null,
    date          text not null,
    score         integer not null,
    passed        boolean not null,
    points_earned integer not null default 0,
    transcript    text,
    completed_at  bigint,
    created_at    timestamptz default now()
  );

  create table if not exists recordings (
    id          uuid primary key default gen_random_uuid(),
    session_id  text,
    student_id  text not null references students(id) on delete cascade,
    family_id   uuid not null references families(id) on delete cascade,
    audio_data  bytea not null,
    mime_type   text not null default 'audio/webm',
    duration_ms integer,
    created_at  timestamptz default now()
  );

  create index if not exists idx_students_family   on students(family_id);
  create index if not exists idx_sessions_family   on progress_sessions(family_id);
  create index if not exists idx_sessions_student  on progress_sessions(student_id);
  create index if not exists idx_recordings_family on recordings(family_id);
  ```

- [ ] **Step 2: Apply migration**

  ```bash
  # Set DATABASE_URL from Railway dashboard (PostgreSQL → Connect)
  export DATABASE_URL="postgresql://..."
  psql "$DATABASE_URL" -f "/Users/wengleong/Claude Workspace/chinese-reading/api/migrations/001_initial.sql"
  ```

  Expected: `CREATE TABLE` × 4, `CREATE INDEX` × 4, no errors.

- [ ] **Step 3: Commit**

  ```bash
  cd "/Users/wengleong/Claude Workspace/chinese-reading"
  git add api/migrations/
  git commit -m "feat: database schema for families, students, sessions, recordings"
  ```

---

## Task 3: Families Routes

**Files:**
- Create: `api/src/routes/families.js`

- [ ] **Step 1: Create families.js**

  ```js
  // api/src/routes/families.js
  const express = require('express');
  const { v4: uuidv4 } = require('uuid');
  const db = require('../db');
  const { signToken, requireAuth } = require('../auth');

  const router = express.Router();

  const ANIMALS = [
    'TIGER','PANDA','DRAGON','EAGLE','LION',
    'WOLF','BEAR','CRANE','DEER','HAWK',
    'FOX','OWL','SEAL','LYNX','DOVE',
  ];

  function generateCode() {
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const digits = String(Math.floor(Math.random() * 9000) + 1000);
    return `${animal}-${digits}`;
  }

  // POST /api/families — create new family
  router.post('/', async (req, res) => {
    let code, attempts = 0;
    do {
      code = generateCode();
      const { rows } = await db.query('select id from families where code = $1', [code]);
      if (!rows.length) break;
    } while (++attempts < 10);

    const { rows } = await db.query(
      'insert into families (code) values ($1) returning id, code',
      [code]
    );
    const family = rows[0];
    const token = signToken(family.id);
    res.json({ code: family.code, token });
  });

  // POST /api/families/join — join with code
  router.post('/join', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    const { rows } = await db.query(
      'select id from families where code = $1',
      [code.toUpperCase().trim()]
    );
    if (!rows.length) return res.status(404).json({ error: 'Invalid family code' });

    const token = signToken(rows[0].id);
    res.json({ token });
  });

  // PUT /api/families/apikey — save Anthropic API key
  router.put('/apikey', requireAuth, async (req, res) => {
    const { key } = req.body;
    await db.query(
      'update families set anthropic_key = $1 where id = $2',
      [key ?? null, req.familyId]
    );
    res.json({ ok: true });
  });

  // GET /api/families/apikey — get API key (for pulling into localStorage on login)
  router.get('/apikey', requireAuth, async (req, res) => {
    const { rows } = await db.query(
      'select anthropic_key from families where id = $1',
      [req.familyId]
    );
    res.json({ key: rows[0]?.anthropic_key ?? null });
  });

  module.exports = router;
  ```

- [ ] **Step 2: Test locally**

  ```bash
  cd "/Users/wengleong/Claude Workspace/chinese-reading/api"
  cp .env.example .env
  # Edit .env: add DATABASE_URL and JWT_SECRET=dev-secret
  node src/index.js &

  # Create family
  curl -s -X POST http://localhost:3001/api/families | jq .
  # Expected: {"code":"TIGER-2310","token":"eyJ..."}

  # Join with that code (replace TIGER-2310)
  curl -s -X POST http://localhost:3001/api/families/join \
    -H "Content-Type: application/json" \
    -d '{"code":"TIGER-2310"}' | jq .
  # Expected: {"token":"eyJ..."}

  # Kill server
  kill %1
  ```

- [ ] **Step 3: Commit**

  ```bash
  cd "/Users/wengleong/Claude Workspace/chinese-reading"
  git add api/src/routes/families.js
  git commit -m "feat: families routes (create, join, apikey)"
  ```

---

## Task 4: Students + Sessions Routes

**Files:**
- Create: `api/src/routes/students.js`
- Create: `api/src/routes/sessions.js`

- [ ] **Step 1: Create students.js**

  ```js
  // api/src/routes/students.js
  const express = require('express');
  const db = require('../db');
  const { requireAuth } = require('../auth');

  const router = express.Router();
  router.use(requireAuth);

  // GET /api/students
  router.get('/', async (req, res) => {
    const { rows } = await db.query(
      'select * from students where family_id = $1 order by created_at',
      [req.familyId]
    );
    res.json(rows);
  });

  // POST /api/students
  router.post('/', async (req, res) => {
    const { id, name, level, color, createdAt } = req.body;
    const { rows } = await db.query(
      `insert into students (id, family_id, name, level, color, created_at)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (id) do update set name=$3, level=$4, color=$5
       returning *`,
      [id, req.familyId, name, level, color, new Date(createdAt)]
    );
    res.json(rows[0]);
  });

  // DELETE /api/students/:id
  router.delete('/:id', async (req, res) => {
    await db.query(
      'delete from students where id = $1 and family_id = $2',
      [req.params.id, req.familyId]
    );
    res.json({ ok: true });
  });

  module.exports = router;
  ```

- [ ] **Step 2: Create sessions.js**

  ```js
  // api/src/routes/sessions.js
  const express = require('express');
  const db = require('../db');
  const { requireAuth } = require('../auth');

  const router = express.Router();
  router.use(requireAuth);

  // GET /api/sessions — all sessions for this family
  router.get('/', async (req, res) => {
    const { rows } = await db.query(
      `select s.* from progress_sessions s
       where s.family_id = $1
       order by s.completed_at desc nulls last`,
      [req.familyId]
    );
    res.json(rows);
  });

  // POST /api/sessions — upsert a session
  router.post('/', async (req, res) => {
    const { id, studentId, storyId, storyTitle, date, score, passed,
            pointsEarned, transcript, completedAt } = req.body;
    await db.query(
      `insert into progress_sessions
         (id, student_id, family_id, story_id, story_title, date, score,
          passed, points_earned, transcript, completed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (id) do nothing`,
      [id, studentId, req.familyId, storyId, storyTitle, date, score,
       passed, pointsEarned ?? 0, transcript ?? '', completedAt ?? null]
    );
    res.json({ ok: true });
  });

  module.exports = router;
  ```

- [ ] **Step 3: Test locally**

  ```bash
  cd "/Users/wengleong/Claude Workspace/chinese-reading/api"
  node src/index.js &

  # Use token from Task 3 test
  TOKEN="eyJ..."

  curl -s -X POST http://localhost:3001/api/students \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"id":"stu-1","name":"Emily","level":"P3","color":"#e8590c","createdAt":1700000000000}' | jq .
  # Expected: {id:"stu-1", name:"Emily", ...}

  curl -s http://localhost:3001/api/students \
    -H "Authorization: Bearer $TOKEN" | jq .
  # Expected: [{id:"stu-1",...}]

  kill %1
  ```

- [ ] **Step 4: Commit**

  ```bash
  cd "/Users/wengleong/Claude Workspace/chinese-reading"
  git add api/src/routes/students.js api/src/routes/sessions.js
  git commit -m "feat: students and sessions routes"
  ```

---

## Task 5: Recordings Routes

**Files:**
- Create: `api/src/routes/recordings.js`

- [ ] **Step 1: Create recordings.js**

  ```js
  // api/src/routes/recordings.js
  const express = require('express');
  const multer = require('multer');
  const db = require('../db');
  const { requireAuth } = require('../auth');

  const router = express.Router();
  router.use(requireAuth);

  // multer: store upload in memory (audio files are small)
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  });

  // POST /api/recordings — upload audio blob
  // Multipart fields: audio (file), studentId, sessionId, durationMs
  router.post('/', upload.single('audio'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No audio file' });

    const { studentId, sessionId, durationMs } = req.body;

    // Verify student belongs to this family
    const { rows: studentRows } = await db.query(
      'select id from students where id = $1 and family_id = $2',
      [studentId, req.familyId]
    );
    if (!studentRows.length) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await db.query(
      `insert into recordings
         (session_id, student_id, family_id, audio_data, mime_type, duration_ms)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [sessionId ?? null, studentId, req.familyId,
       req.file.buffer, req.file.mimetype, durationMs ? parseInt(durationMs) : null]
    );
    res.json({ id: rows[0].id });
  });

  // GET /api/recordings — list metadata (no audio data)
  router.get('/', async (req, res) => {
    const { rows } = await db.query(
      `select id, session_id, student_id, mime_type, duration_ms, created_at
       from recordings
       where family_id = $1
       order by created_at desc`,
      [req.familyId]
    );
    res.json(rows);
  });

  // GET /api/recordings/:id — stream audio
  router.get('/:id', async (req, res) => {
    const { rows } = await db.query(
      'select audio_data, mime_type from recordings where id = $1 and family_id = $2',
      [req.params.id, req.familyId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const { audio_data, mime_type } = rows[0];
    res.set('Content-Type', mime_type);
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(audio_data);
  });

  module.exports = router;
  ```

- [ ] **Step 2: Test locally**

  ```bash
  cd "/Users/wengleong/Claude Workspace/chinese-reading/api"
  node src/index.js &
  TOKEN="eyJ..."

  # Upload a test audio file (use any small webm/wav you have)
  curl -s -X POST http://localhost:3001/api/recordings \
    -H "Authorization: Bearer $TOKEN" \
    -F "audio=@/tmp/test.webm" \
    -F "studentId=stu-1" \
    -F "durationMs=5000" | jq .
  # Expected: {"id":"uuid-..."}

  # List recordings
  curl -s http://localhost:3001/api/recordings \
    -H "Authorization: Bearer $TOKEN" | jq .
  # Expected: [{id, session_id, student_id, mime_type, duration_ms, created_at}]

  kill %1
  ```

- [ ] **Step 3: Commit**

  ```bash
  cd "/Users/wengleong/Claude Workspace/chinese-reading"
  git add api/src/routes/recordings.js
  git commit -m "feat: recordings routes (upload, list, stream)"
  ```

---

## Task 6: Generate Route (Anthropic Proxy)

**Files:**
- Create: `api/src/routes/generate.js`

- [ ] **Step 1: Create generate.js**

  ```js
  // api/src/routes/generate.js
  const express = require('express');
  const db = require('../db');
  const { requireAuth } = require('../auth');

  const router = express.Router();
  router.use(requireAuth);

  // POST /api/generate — proxy to Anthropic using the family's stored API key
  router.post('/', async (req, res) => {
    const { rows } = await db.query(
      'select anthropic_key from families where id = $1',
      [req.familyId]
    );
    const apiKey = rows[0]?.anthropic_key;
    if (!apiKey) return res.status(400).json({ error: 'No API key configured. Add one in Settings.' });

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  });

  module.exports = router;
  ```

- [ ] **Step 2: Verify (requires a valid Anthropic API key saved in the DB)**

  ```bash
  cd "/Users/wengleong/Claude Workspace/chinese-reading/api"
  node src/index.js &
  TOKEN="eyJ..."

  # First save an API key
  curl -s -X PUT http://localhost:3001/api/families/apikey \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"key":"sk-ant-YOUR_KEY"}' | jq .
  # Expected: {"ok":true}

  # Test generate proxy
  curl -s -X POST http://localhost:3001/api/generate \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"model":"claude-haiku-4-5-20251001","max_tokens":50,"messages":[{"role":"user","content":"Say hi"}]}' | jq .
  # Expected: Anthropic response with content array

  kill %1
  ```

- [ ] **Step 3: Commit**

  ```bash
  cd "/Users/wengleong/Claude Workspace/chinese-reading"
  git add api/src/routes/generate.js
  git commit -m "feat: generate route (anthropic proxy)"
  ```

---

## Task 7: Deploy API to Railway

- [ ] **Step 1: Create Railway service**

  In [Railway dashboard](https://railway.app):
  1. New Project → Deploy from GitHub repo → select `chinese-reading` repo
  2. Root Directory: `api`
  3. Add PostgreSQL plugin to the project
  4. Set env vars on the service:
     - `DATABASE_URL` — copy from PostgreSQL plugin (Railway sets this automatically if you use the plugin reference)
     - `JWT_SECRET` — generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
     - `ALLOWED_ORIGIN` — your GitHub Pages URL (e.g. `https://wengleong.github.io`)
     - `PORT` — `3001` (Railway overrides this with its own PORT automatically)

- [ ] **Step 2: Run migration against Railway DB**

  Copy the `DATABASE_URL` from Railway PostgreSQL plugin:
  ```bash
  export DATABASE_URL="postgresql://postgres:...@...railway.app:..."
  psql "$DATABASE_URL" -f "/Users/wengleong/Claude Workspace/chinese-reading/api/migrations/001_initial.sql"
  ```

- [ ] **Step 3: Note the Railway service URL**

  From Railway → your service → Settings → Domains. It will be something like `https://chinese-reading-api-production.up.railway.app`. Save this as `API_BASE_URL`.

- [ ] **Step 4: Verify health endpoint**

  ```bash
  curl https://YOUR_RAILWAY_URL/health
  # Expected: {"ok":true}
  ```

- [ ] **Step 5: Commit**

  No code change. The Railway service deploys automatically on git push to main.

---

## Task 8: Frontend API Module

**Files:**
- Create: `src/lib/api.js`

- [ ] **Step 1: Create api.js**

  Replace `YOUR_RAILWAY_URL` with the actual Railway URL from Task 7.

  ```js
  // src/lib/api.js
  // Thin fetch wrapper for the Chinese Reading API.
  // Token is stored in localStorage as 'cr-token'.

  const API_BASE = 'https://YOUR_RAILWAY_URL';
  const TOKEN_KEY = 'cr-token';

  export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  export function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  export function isLoggedIn() {
    return !!getToken();
  }

  async function req(method, path, body, isFormData = false) {
    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body && !isFormData) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `API error ${res.status}`);
    }
    return res.json();
  }

  // Families
  export const createFamily   = ()          => req('POST', '/api/families');
  export const joinFamily     = (code)      => req('POST', '/api/families/join', { code });
  export const saveApiKey     = (key)       => req('PUT',  '/api/families/apikey', { key });
  export const getApiKey      = ()          => req('GET',  '/api/families/apikey');

  // Students
  export const listStudents   = ()          => req('GET',  '/api/students');
  export const upsertStudent  = (student)   => req('POST', '/api/students', student);
  export const removeStudent  = (id)        => req('DELETE', `/api/students/${id}`);

  // Sessions
  export const listSessions   = ()          => req('GET',  '/api/sessions');
  export const saveSession    = (session)   => req('POST', '/api/sessions', session);

  // Recordings
  export const listRecordings = ()          => req('GET',  '/api/recordings');
  export async function uploadRecording({ blob, mimeType, studentId, sessionId, durationMs }) {
    const form = new FormData();
    form.append('audio', blob, `recording.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`);
    form.append('studentId', studentId);
    if (sessionId) form.append('sessionId', sessionId);
    if (durationMs) form.append('durationMs', String(durationMs));
    return req('POST', '/api/recordings', form, true);
  }
  export async function fetchRecordingBlob(id) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/recordings/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Recording not found');
    return res.blob();
  }

  // Generate (Anthropic proxy)
  export const generateViaApi = (body)      => req('POST', '/api/generate', body);
  ```

- [ ] **Step 2: Verify in browser console**

  Open the app, then in DevTools console:
  ```js
  import('/src/lib/api.js').then(m => console.log('api.js OK', Object.keys(m)))
  ```
  Expected: logs all exported function names.

- [ ] **Step 3: Commit**

  ```bash
  cd "/Users/wengleong/Claude Workspace/chinese-reading"
  git add src/lib/api.js
  git commit -m "feat: frontend api module"
  ```

---

## Task 9: Cloud Sync Module

**Files:**
- Create: `src/lib/cloud.js`

- [ ] **Step 1: Create cloud.js**

  ```js
  // src/lib/cloud.js
  // Write-through cloud sync. All functions are no-ops when not logged in.
  // localStorage is the primary store; cloud is async best-effort.

  import {
    isLoggedIn, listStudents, upsertStudent, removeStudent,
    listSessions, saveSession, uploadRecording as apiUpload,
    getApiKey,
  } from './api.js';

  // ---- Students ----

  export async function pushStudent(student) {
    if (!isLoggedIn()) return;
    upsertStudent(student).catch(() => {});
  }

  export async function deleteStudentCloud(id) {
    if (!isLoggedIn()) return;
    removeStudent(id).catch(() => {});
  }

  // ---- Sessions ----

  export async function pushSession(session, studentId) {
    if (!isLoggedIn()) return;
    saveSession({ ...session, studentId }).catch(() => {});
  }

  // ---- Recordings ----

  export async function pushRecording({ blob, mimeType, studentId, sessionId, durationMs }) {
    if (!isLoggedIn()) return null;
    try {
      const { id } = await apiUpload({ blob, mimeType, studentId, sessionId, durationMs });
      return id;
    } catch { return null; }
  }

  // ---- API Key ----

  export async function pullApiKey() {
    if (!isLoggedIn()) return null;
    try {
      const { key } = await getApiKey();
      if (key) localStorage.setItem('anthropicApiKey', key);
      return key;
    } catch { return null; }
  }

  // ---- Sync Down (call on login) ----

  export async function syncDown() {
    if (!isLoggedIn()) return;

    // Students
    try {
      const students = await listStudents();
      if (students.length) {
        const local = JSON.parse(localStorage.getItem('cr-students') || '[]');
        const localIds = new Set(local.map(s => s.id));
        const toAdd = students
          .filter(s => !localIds.has(s.id))
          .map(s => ({
            id: s.id, name: s.name, level: s.level, color: s.color,
            createdAt: new Date(s.created_at).getTime(),
          }));
        if (toAdd.length) {
          localStorage.setItem('cr-students', JSON.stringify([...local, ...toAdd]));
        }
      }
    } catch {}

    // Sessions
    try {
      const sessions = await listSessions();
      if (sessions.length) {
        const byStudent = {};
        for (const s of sessions) {
          (byStudent[s.student_id] = byStudent[s.student_id] || []).push(s);
        }
        for (const [studentId, rows] of Object.entries(byStudent)) {
          const key = `cr-progress-${studentId}`;
          const local = JSON.parse(localStorage.getItem(key) || '{"totalPoints":0,"sessions":[]}');
          const localIds = new Set(local.sessions.map(s => s.id));
          const toAdd = rows.filter(s => !localIds.has(s.id)).map(s => ({
            id: s.id, date: s.date, storyId: s.story_id, storyTitle: s.story_title,
            score: s.score, passed: s.passed, pointsEarned: s.points_earned,
            transcript: s.transcript ?? '', completedAt: s.completed_at,
          }));
          if (toAdd.length) {
            local.sessions = [...local.sessions, ...toAdd]
              .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
            local.totalPoints = local.sessions
              .filter(s => s.passed)
              .reduce((sum, s) => sum + (s.pointsEarned ?? 0), 0);
            localStorage.setItem(key, JSON.stringify(local));
          }
        }
      }
    } catch {}

    // API key
    await pullApiKey();
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/lib/cloud.js
  git commit -m "feat: cloud sync module"
  ```

---

## Task 10: Family Onboarding UI

**Files:**
- Create: `src/components/familyOnboarding.js`

- [ ] **Step 1: Create familyOnboarding.js**

  ```js
  // src/components/familyOnboarding.js
  import { createFamily, joinFamily, setToken } from '../lib/api.js';
  import { syncDown } from '../lib/cloud.js';

  export function showFamilyOnboarding({ onDone, onSkip }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay onboarding-overlay';
    overlay.innerHTML = `
      <div class="modal-card onboarding-card" role="dialog" aria-modal="true">
        <div class="onboarding-logo">📚</div>
        <h2 class="modal-title" style="text-align:center">每日华文阅读</h2>
        <p class="modal-hint" style="text-align:center">Save your progress across all devices</p>

        <div class="onboarding-tabs">
          <button class="onboarding-tab active" id="tab-join">Have a Code</button>
          <button class="onboarding-tab" id="tab-create">New Family</button>
        </div>

        <div id="panel-join">
          <p class="modal-hint">Enter your family code to restore progress on this device.</p>
          <input class="modal-input onboarding-code-input" id="ob-code"
            type="text" placeholder="TIGER-2310"
            autocomplete="off" autocapitalize="characters" spellcheck="false" />
          <div class="modal-error" id="ob-join-err" hidden></div>
          <div class="modal-actions">
            <button class="secondary" id="ob-skip">Use without code</button>
            <button class="primary" id="ob-join-btn">Join →</button>
          </div>
        </div>

        <div id="panel-create" hidden>
          <p class="modal-hint">We'll generate a unique code for your family. Write it down — you'll need it on other devices.</p>
          <div class="modal-error" id="ob-create-err" hidden></div>
          <div class="modal-actions">
            <button class="secondary" id="ob-back">← Back</button>
            <button class="primary" id="ob-create-btn">✨ Create Family</button>
          </div>
        </div>

        <div id="panel-code" hidden>
          <p class="modal-hint" style="text-align:center">Your family code is:</p>
          <div class="onboarding-code-display" id="ob-code-display"></div>
          <p class="modal-hint" style="text-align:center;color:var(--danger)">
            ⚠️ Write this down! You need it to sign in on other devices.
          </p>
          <button class="secondary" id="ob-copy" style="width:100%;margin-bottom:8px">📋 Copy Code</button>
          <button class="primary" id="ob-done" style="width:100%">Start Reading →</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const panels = { join: overlay.querySelector('#panel-join'), create: overlay.querySelector('#panel-create'), code: overlay.querySelector('#panel-code') };
    const tabs = { join: overlay.querySelector('#tab-join'), create: overlay.querySelector('#tab-create') };

    function show(name) {
      Object.entries(panels).forEach(([k, el]) => el.hidden = k !== name);
      tabs.join?.classList.toggle('active', name === 'join');
      tabs.create?.classList.toggle('active', name === 'create');
    }

    tabs.join.addEventListener('click', () => show('join'));
    tabs.create.addEventListener('click', () => show('create'));
    overlay.querySelector('#ob-back').addEventListener('click', () => show('join'));
    overlay.querySelector('#ob-skip').addEventListener('click', () => { overlay.remove(); onSkip?.(); });

    // Join flow
    const joinErr = overlay.querySelector('#ob-join-err');
    const joinBtn = overlay.querySelector('#ob-join-btn');
    joinBtn.addEventListener('click', async () => {
      const code = overlay.querySelector('#ob-code').value.trim();
      if (!code) { joinErr.textContent = 'Please enter your family code.'; joinErr.hidden = false; return; }
      joinBtn.disabled = true; joinBtn.textContent = '⏳ Joining…'; joinErr.hidden = true;
      try {
        const { token } = await joinFamily(code);
        setToken(token);
        await syncDown();
        overlay.remove();
        onDone?.();
      } catch (err) {
        joinErr.textContent = err.message.includes('Invalid') ? 'Code not found. Check spelling.' : err.message;
        joinErr.hidden = false;
        joinBtn.disabled = false; joinBtn.textContent = 'Join →';
      }
    });

    // Create flow
    const createErr = overlay.querySelector('#ob-create-err');
    const createBtn = overlay.querySelector('#ob-create-btn');
    createBtn.addEventListener('click', async () => {
      createBtn.disabled = true; createBtn.textContent = '⏳ Creating…'; createErr.hidden = true;
      try {
        const { code, token } = await createFamily();
        setToken(token);
        overlay.querySelector('#ob-code-display').textContent = code;
        show('code');
      } catch (err) {
        createErr.textContent = err.message;
        createErr.hidden = false;
        createBtn.disabled = false; createBtn.textContent = '✨ Create Family';
      }
    });

    overlay.querySelector('#ob-copy').addEventListener('click', function () {
      navigator.clipboard?.writeText(overlay.querySelector('#ob-code-display').textContent).catch(() => {});
      this.textContent = '✓ Copied!';
    });

    overlay.querySelector('#ob-done').addEventListener('click', () => { overlay.remove(); onDone?.(); });

    setTimeout(() => overlay.querySelector('#ob-code')?.focus(), 50);
  }
  ```

- [ ] **Step 2: Add CSS to styles.css**

  Append to `styles.css`:

  ```css
  /* ---- Family onboarding ---- */
  .onboarding-overlay { z-index: 200; }
  .onboarding-card { max-width: 400px; }
  .onboarding-logo { font-size: 48px; text-align: center; margin-bottom: 4px; }

  .onboarding-tabs {
    display: flex;
    border-bottom: 2px solid var(--border);
    margin-bottom: 16px;
  }
  .onboarding-tab {
    flex: 1; background: none; border: none;
    border-bottom: 3px solid transparent; margin-bottom: -2px;
    padding: 10px; font: inherit; font-weight: 600; color: var(--muted); cursor: pointer;
  }
  .onboarding-tab.active { color: var(--accent); border-bottom-color: var(--accent); }

  .onboarding-code-input {
    text-align: center; font-size: 22px; font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase;
  }
  .onboarding-code-display {
    font-size: 36px; font-weight: 900; text-align: center;
    color: var(--accent); letter-spacing: 0.08em;
    background: var(--accent-soft); border-radius: 12px;
    padding: 16px; margin: 8px 0;
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/familyOnboarding.js styles.css
  git commit -m "feat: family onboarding UI"
  ```

---

## Task 11: Wire Auth into App Boot

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Add imports to top of app.js**

  After the last existing import line, add:

  ```js
  import { isLoggedIn } from './lib/api.js';
  import { syncDown, pullApiKey } from './lib/cloud.js';
  import { showFamilyOnboarding } from './components/familyOnboarding.js';
  ```

- [ ] **Step 2: Replace the init IIFE at the bottom of app.js**

  Replace the existing `(async function init() { ... })();` block with:

  ```js
  (async function init() {
    if (!isLoggedIn()) {
      await new Promise(resolve => {
        showFamilyOnboarding({
          onDone: async () => { await syncDown(); resolve(); },
          onSkip: resolve,
        });
      });
    } else {
      syncDown().catch(() => {});
    }

    try {
      stories = await loadIndex();
    } catch (err) {
      els.picker.innerHTML = `<p class="privacy-note">Failed to load stories: ${err.message}</p>`;
      return;
    }
    renderStoryPicker({ root: els.picker, stories, activeId: null, onPick: pickStory });

    if (!ttsSupported()) {
      const warn = document.createElement('p');
      warn.className = 'privacy-note';
      warn.textContent = 'This browser does not support text-to-speech. Reading will still work; voice playback will not.';
      els.reader.parentElement.insertBefore(warn, els.reader);
    }
  })();
  ```

- [ ] **Step 3: Verify in browser**

  Clear localStorage (`localStorage.clear()` in console, reload). Onboarding should appear. Click "Use without code" — app loads normally. Create a family — code shows — click "Start Reading" — app loads. Check Railway PostgreSQL: `select * from families;` should show 1 row.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app.js
  git commit -m "feat: auth boot — show onboarding on first visit"
  ```

---

## Task 12: Sync Students and Sessions

**Files:**
- Modify: `src/lib/students.js`

- [ ] **Step 1: Add cloud imports at top of students.js**

  After the existing constants, add:

  ```js
  import { pushStudent, deleteStudentCloud, pushSession } from './cloud.js';
  ```

- [ ] **Step 2: Update createStudent**

  Find `createStudent` and add cloud push before `return student`:

  ```js
  export function createStudent(name, level) {
    const students = getStudents();
    const color = AVATAR_COLORS[students.length % AVATAR_COLORS.length];
    const student = { id: `stu-${Date.now()}`, name: name.trim(), level, color, createdAt: Date.now() };
    students.push(student);
    localStorage.setItem(STUDENTS_KEY, JSON.stringify(students));
    pushStudent(student);  // async, non-blocking
    return student;
  }
  ```

- [ ] **Step 3: Update deleteStudent**

  ```js
  export function deleteStudent(id) {
    localStorage.setItem(STUDENTS_KEY, JSON.stringify(getStudents().filter(s => s.id !== id)));
    localStorage.removeItem(PROGRESS_PREFIX + id);
    if (getActiveStudentId() === id) localStorage.removeItem(ACTIVE_KEY);
    deleteStudentCloud(id);  // async, non-blocking
  }
  ```

- [ ] **Step 4: Update addSession**

  Find the `addSession` function and add cloud push:

  ```js
  export function addSession(studentId, session) {
    const progress = getProgress(studentId);
    progress.sessions.unshift(session);
    progress.totalPoints = (progress.totalPoints || 0) + (session.pointsEarned || 0);
    saveProgress(studentId, progress);
    pushSession(session, studentId);  // async, non-blocking
  }
  ```

- [ ] **Step 5: Verify in browser**

  Create a student. Check Railway DB: `select * from students;`. Complete a reading. Check `select * from progress_sessions;`.

- [ ] **Step 6: Commit**

  ```bash
  git add src/lib/students.js
  git commit -m "feat: sync students and sessions to cloud"
  ```

---

## Task 13: Audio-Only Recorder Rewrite

**Files:**
- Modify: `src/components/recorder.js` (full rewrite)
- Modify: `src/lib/storage.js` (add sessionId, add upload call)
- Modify: `src/components/recordingsList.js` (audio player)
- Modify: `src/app.js` (pass getActiveStudent, forward sessionId)
- Modify: `styles.css` (sticky bar + mobile, remove old recorder CSS)

- [ ] **Step 1: Rewrite recorder.js**

  Replace the entire file:

  ```js
  // Audio recorder with SpeechRecognition for scoring.
  // No camera/canvas — the story reader is the teleprompter.

  import { saveRecording } from '../lib/storage.js';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  function pickMimeType() {
    for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t)) return t;
    }
    return '';
  }

  export function renderRecorder({ root, getCurrentStory, getActiveStudent, onSaved, onActiveChange, onComplete, onStart }) {
    root.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'recorder-audio';

    const indicator = document.createElement('div');
    indicator.className = 'recording-indicator';
    indicator.style.visibility = 'hidden';
    indicator.innerHTML = '<span class="dot"></span><span>录制中 REC</span>';

    const timer = document.createElement('span');
    timer.className = 'recording-timer';
    timer.textContent = '0:00';

    const note = document.createElement('p');
    note.className = 'privacy-note';
    note.textContent = 'Audio stays on this device. Tap Record, read aloud, then tap Stop.';

    card.appendChild(indicator);
    card.appendChild(timer);
    card.appendChild(note);
    root.appendChild(card);

    // Sticky bar with Start / Stop buttons (mobile: fixed at bottom; desktop: inline)
    const stickyBar = document.createElement('div');
    stickyBar.className = 'recorder-sticky-bar';

    const startBtn = document.createElement('button');
    startBtn.className = 'primary recorder-start-btn';
    startBtn.textContent = '🎙️ 开始录音 Record';

    const stopBtn = document.createElement('button');
    stopBtn.className = 'danger recorder-stop-btn';
    stopBtn.textContent = '■ 停止 Stop & Score';
    stopBtn.disabled = true;

    stickyBar.appendChild(startBtn);
    stickyBar.appendChild(stopBtn);
    document.body.appendChild(stickyBar);

    let mediaRecorder = null, chunks = [], startedAt = 0, mimeType = '';
    let recognition = null, transcript = '';
    let timerInterval = null;

    function updateTimer() {
      const secs = Math.floor((Date.now() - startedAt) / 1000);
      timer.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    }

    async function start() {
      const story = getCurrentStory?.();
      if (!story) { alert('请先选择一个故事 (Pick a story first).'); return; }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        alert('Could not access microphone: ' + err.message);
        return;
      }

      mimeType = pickMimeType();
      mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      transcript = '';
      if (SR) {
        try {
          recognition = new SR();
          recognition.lang = 'zh-CN';
          recognition.continuous = true;
          recognition.interimResults = false;
          recognition.onresult = (e) => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
              if (e.results[i].isFinal) transcript += e.results[i][0].transcript;
            }
          };
          recognition.onerror = () => {};
          recognition.start();
        } catch { recognition = null; }
      }

      chunks = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        try { recognition?.stop(); } catch {}
        recognition = null;
        stream.getTracks().forEach(t => t.stop());
        clearInterval(timerInterval);

        const story = getCurrentStory?.();
        const student = getActiveStudent?.();
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
        const durationMs = Date.now() - startedAt;
        const sessionId = `sess-${Date.now()}`;

        try {
          await saveRecording({
            storyId: story?.id, storyTitle: story?.title,
            blob, mimeType: blob.type, durationMs,
            studentId: student?.id ?? null, sessionId,
          });
          onSaved?.();
        } catch (err) { console.warn('Save failed:', err.message); }

        indicator.style.visibility = 'hidden';
        timer.textContent = '0:00';
        startBtn.disabled = false; stopBtn.disabled = true;
        onActiveChange?.(false);
        onComplete?.({ transcript, story, sessionId });
      };

      mediaRecorder.start();
      startedAt = Date.now();
      startBtn.disabled = true; stopBtn.disabled = false;
      indicator.style.visibility = 'visible';
      timerInterval = setInterval(updateTimer, 500);
      onActiveChange?.(true);
      onStart?.();  // scroll story into view
    }

    function stop() {
      if (mediaRecorder?.state !== 'inactive') mediaRecorder?.stop();
    }

    startBtn.addEventListener('click', start);
    stopBtn.addEventListener('click', stop);

    // Clean up sticky bar if component is ever re-rendered
    root._cleanupStickyBar = () => stickyBar.remove();
  }
  ```

- [ ] **Step 2: Update storage.js to add sessionId and cloud upload**

  At the top of `storage.js`, add import:

  ```js
  import { pushRecording } from './cloud.js';
  ```

  Update `saveRecording` signature and add cloud upload:

  ```js
  export async function saveRecording({ storyId, storyTitle, blob, mimeType, durationMs, studentId, sessionId }) {
    const db = await openDb();
    const localId = await new Promise((resolve, reject) => {
      const store = tx(db, 'readwrite');
      const record = { storyId, storyTitle, blob, mimeType, durationMs, sessionId: sessionId ?? null, createdAt: Date.now() };
      const req = store.add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    // Upload to cloud in background (non-blocking)
    if (studentId && blob) {
      pushRecording({ blob, mimeType, studentId, sessionId, durationMs }).catch(() => {});
    }

    return localId;
  }
  ```

- [ ] **Step 3: Update recordingsList.js to use audio player**

  Open `src/components/recordingsList.js`, find where it creates the playback element (likely a `<video>` or download link), and replace with `<audio controls>`. The blob URL creation logic from IndexedDB stays the same — just change the element tag from `video` to `audio`:

  ```js
  // Find: document.createElement('video')
  // Replace with:
  const audioEl = document.createElement('audio');
  audioEl.controls = true;
  audioEl.style.width = '100%';
  // Set src from blob URL (same as before):
  // audioEl.src = URL.createObjectURL(blob);
  ```

  Read the full file first to find the exact lines, then make the targeted replacement.

- [ ] **Step 4: Update app.js to pass getActiveStudent and sessionId**

  In `app.js`, update the `renderRecorder` call to:

  ```js
  renderRecorder({
    root: els.recorder,
    getCurrentStory: () => activeStory,
    getActiveStudent: () => getActiveStudent(),
    onSaved: () => renderRecordingsList({ root: els.recordings }),
    onActiveChange: (active) => timerCtl.setActive(active),
    onStart: () => els.reader.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    onComplete: ({ transcript, story, sessionId }) => {
      const student = getActiveStudent();
      if (!student || !story) return;
      const score = scoreTranscript(story.tokens, transcript);
      openScoreModal({
        student, story, score, transcript, sessionId,
        onRetry: () => {},
        onDone: () => studentPanelCtl?.refresh(),
      });
      studentPanelCtl?.refresh();
    },
  });
  ```

- [ ] **Step 5: Update styles.css — mobile sticky + remove old recorder CSS**

  **Remove** the old recorder CSS block (`.recorder { ... }` with `grid-template-columns: minmax(200px, 280px) 1fr` and the `@media (max-width: 800px)` override for `.recorder`). Also remove `.recorder-canvas` and `.recorder video` styles.

  **Remove** `.reader-toolbar` sticky rules from the mobile media query (`position: sticky; bottom: ...; z-index: 5; order: 99;`).

  **Add** new styles:

  ```css
  /* ---- Audio recorder ---- */
  .recorder-audio {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    box-shadow: var(--shadow);
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .recording-timer {
    font-size: 20px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--danger);
    min-width: 3ch;
  }

  /* Sticky bar: inline on desktop, fixed at bottom on mobile */
  .recorder-sticky-bar {
    display: flex;
    gap: 10px;
    padding: 10px 0;
  }
  .recorder-sticky-bar button { flex: 1; }

  @media (max-width: 800px) {
    .recorder-sticky-bar {
      position: fixed;
      bottom: 0;
      bottom: env(safe-area-inset-bottom, 0px);
      left: 0; right: 0;
      z-index: 50;
      background: var(--surface);
      border-top: 1px solid var(--border);
      box-shadow: 0 -2px 10px rgba(0,0,0,0.10);
      padding: 10px 16px;
    }
    .app-main {
      padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
    }
    /* reader toolbar is no longer sticky — recorder bar takes that role */
    .reader-toolbar {
      position: static;
    }
  }
  ```

- [ ] **Step 6: Test on mobile and desktop**

  Desktop: recorder shows pulsing indicator + timer, no camera, story text stays readable. Record → stop → score modal appears.

  Mobile: Record/Stop buttons fixed at bottom. Story text scrolls freely. Record while scrolling works.

- [ ] **Step 7: Commit**

  ```bash
  git add src/components/recorder.js src/lib/storage.js src/components/recordingsList.js src/app.js styles.css
  git commit -m "feat: audio-only recorder with sticky mobile bar"
  ```

---

## Task 14: API Key Migration

**Files:**
- Modify: `src/components/settings.js`
- Modify: `src/components/storyGenerator.js`
- Modify: `src/components/scoreModal.js`

- [ ] **Step 1: Update settings.js**

  Add import at top:
  ```js
  import { isLoggedIn, saveApiKey as apiSaveKey } from '../lib/api.js';
  ```

  In the save handler, after `localStorage.setItem(API_KEY_STORAGE, key)`, add:
  ```js
  if (isLoggedIn()) {
    apiSaveKey(key).catch(() => {});
    statusEl.innerHTML = `<span style="color:var(--good)">✓ Saved to family account</span>`;
  } else {
    statusEl.innerHTML = `<span style="color:var(--good)">✓ Saved locally</span>`;
  }
  ```

  Update the hint text to: `"Saved to your family account — available on all devices."`

- [ ] **Step 2: Update storyGenerator.js to use proxy**

  Add import at top:
  ```js
  import { isLoggedIn, generateViaApi } from '../lib/api.js';
  ```

  In `callClaudeAPI`, replace the `fetch("https://api.anthropic.com/...")` call with:

  ```js
  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  };

  const res = isLoggedIn()
    ? await generateViaApi(body).then(data => ({ ok: true, _data: data })).catch(err => { throw err; })
    : await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      });
  ```

  Then for parsing: when logged in, `data` is already the parsed object; when not, parse with `res.json()`. Simplify by making `generateViaApi` and the direct fetch both resolve to the parsed JSON object:

  ```js
  let data;
  if (isLoggedIn()) {
    data = await generateViaApi(body);
  } else {
    if (!apiKey) throw new Error('No API key. Add one in Settings.');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey, 'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || `API error ${r.status}`); }
    data = await r.json();
  }
  let text = data.content[0].text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  ```

- [ ] **Step 3: Update scoreModal.js getAiFeedback similarly**

  Add import:
  ```js
  import { isLoggedIn, generateViaApi } from '../lib/api.js';
  ```

  In `getAiFeedback`, replace the direct Anthropic fetch with:

  ```js
  const body = { model: 'claude-haiku-4-5-20251001', max_tokens: 220, messages: [{ role: 'user', content: `...` }] };
  let data;
  if (isLoggedIn()) {
    data = await generateViaApi(body);
  } else {
    const apiKey = localStorage.getItem('anthropicApiKey');
    if (!apiKey) return null;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    data = await r.json();
  }
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/settings.js src/components/storyGenerator.js src/components/scoreModal.js
  git commit -m "feat: API key stored in cloud, Anthropic calls proxied via Railway"
  ```

---

## Task 15: Achievement Screen Redesign

**Files:**
- Modify: `src/components/scoreModal.js`
- Modify: `styles.css`

- [ ] **Step 1: Add constants and helpers to scoreModal.js**

  Add after the existing imports:

  ```js
  const BADGES = [
    { id: 'first_pass',  icon: '🌟', label: 'First Pass',     check: (p)    => p.sessions.filter(s => s.passed).length >= 1 },
    { id: 'stories_5',  icon: '📚', label: '5 Stories',       check: (p)    => new Set(p.sessions.filter(s => s.passed).map(s => s.storyId)).size >= 5 },
    { id: 'perfect',    icon: '💯', label: 'Perfect Score',   check: (p)    => p.sessions.some(s => s.score >= 100) },
    { id: 'streak_7',   icon: '🔥', label: '7-Day Streak',    check: (p, k) => k >= 7 },
    { id: 'streak_30',  icon: '🏆', label: '30-Day Streak',   check: (p, k) => k >= 30 },
    { id: 'pts_100',    icon: '💎', label: '100 Points',       check: (p)    => p.totalPoints >= 100 },
    { id: 'pts_500',    icon: '👑', label: '500 Points',       check: (p)    => p.totalPoints >= 500 },
    { id: 'pts_1000',   icon: '🎯', label: '1000 Points',      check: (p)    => p.totalPoints >= 1000 },
  ];

  function getEarnedBadgeIds(progress, streak) {
    return new Set(BADGES.filter(b => b.check(progress, streak)).map(b => b.id));
  }

  function animateCount(el, to, duration = 900) {
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function spawnConfetti(container) {
    const GLYPHS = ['🎉', '⭐', '✨', '🌟', '💫', '🎊', '🏅'];
    for (let i = 0; i < 22; i++) {
      const p = document.createElement('span');
      p.className = 'confetti-particle';
      p.textContent = GLYPHS[i % GLYPHS.length];
      const angle = (i / 22) * 360;
      const dist = 120 + Math.random() * 120;
      p.style.cssText = `--dx:${Math.round(Math.cos(angle * Math.PI / 180) * dist)}px;--dy:${Math.round(Math.sin(angle * Math.PI / 180) * dist - 80)}px;animation-delay:${(i * 0.03).toFixed(2)}s`;
      container.appendChild(p);
    }
  }
  ```

  Also add `getProgress` to the existing import from `../lib/students.js`.

- [ ] **Step 2: Replace openScoreModal with animated version**

  Replace the entire `openScoreModal` function:

  ```js
  export function openScoreModal({ student, story, score, transcript, sessionId, onRetry, onDone }) {
    const passed = score >= 60;
    const today = todayIso();

    const todayAttempts = getTodayAttempts(student.id, story.id);
    const wasFailedBefore = todayAttempts.some(s => !s.passed);
    const isRepeat = hasPassedStoryBefore(student.id, story.id);
    const alreadyCompletedToday = hasCompletedToday(student.id);
    const currentStreak = getStudentStreak(student.id);
    const streakDays = passed && !alreadyCompletedToday ? currentStreak + 1 : currentStreak;
    const { total: pointsEarned, breakdown } = calculatePoints({ score, isRepeat, wasFailedBefore, streakDays });

    const progressBefore = getProgress(student.id);
    const badgesBefore = getEarnedBadgeIds(progressBefore, currentStreak);

    addSession(student.id, {
      id: sessionId ?? `sess-${Date.now()}`,
      date: today, storyId: story.id, storyTitle: story.title,
      score, passed, pointsEarned, transcript: transcript || '',
      completedAt: Date.now(),
    });

    const progressAfter = getProgress(student.id);
    const newBadges = BADGES.filter(b => !badgesBefore.has(b.id) && b.check(progressAfter, streakDays));

    const ringColor = score >= 80 ? 'var(--good)' : score >= 60 ? 'var(--accent)' : 'var(--danger)';
    const label = score >= 90 ? '优秀 Excellent! ⭐' : score >= 80 ? '很好 Great Job! 🎊' : score >= 60 ? '及格 Passed ✓' : '继续努力 Keep Trying! 💪';
    const C = (2 * Math.PI * 50).toFixed(1);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="confetti-stage" id="score-confetti"></div>
      <div class="modal-card score-modal-v2" role="dialog" aria-modal="true">
        <div class="score-hero">
          <svg class="score-ring-svg" viewBox="0 0 120 120" aria-hidden="true">
            <circle class="score-ring-track" cx="60" cy="60" r="50"/>
            <circle class="score-ring-arc" id="score-arc" cx="60" cy="60" r="50"
              style="stroke:${ringColor};stroke-dasharray:${C};stroke-dashoffset:${C}"/>
          </svg>
          <div class="score-hero-center">
            <span class="score-big-num" id="score-num">0</span>
            <span class="score-pct">/100</span>
          </div>
        </div>
        <div class="score-label" style="color:${ringColor}">${label}</div>
        <div class="score-byline">${story.title} · ${student.name}</div>
        ${passed ? `
          <div class="score-pass-block">
            <div class="score-pts-big">+<span id="score-pts">0</span> 💎</div>
            <div class="score-breakdown">
              ${breakdown.map((b, i) => `
                <div class="score-bd-row" style="animation-delay:${(1.1 + i * 0.12).toFixed(2)}s">
                  <span>${b.label}</span><span class="score-bd-pts">+${b.pts}</span>
                </div>`).join('')}
            </div>
            ${streakDays > 0 ? `<div class="score-streak"><span class="streak-flame">🔥</span>${streakDays}-day streak!</div>` : ''}
            ${newBadges.length ? `
              <div class="score-badge-block">
                <div class="score-badge-title">🏅 Badge Unlocked!</div>
                ${newBadges.map(b => `<div class="score-badge-row"><span>${b.icon}</span><span>${b.label}</span></div>`).join('')}
              </div>` : ''}
          </div>
        ` : `
          <div class="score-fail-block">
            <p>Score at least <strong>60</strong> to complete today's reading.</p>
            <p>Pass next time for a <strong>+25 perseverance bonus! 💪</strong></p>
          </div>
        `}
        <div class="score-feedback" id="score-feedback"><span class="score-feedback-loading">✨ Getting feedback…</span></div>
        <div class="modal-actions">
          <button class="secondary" id="score-retry">🔄 Try Again</button>
          <button class="primary" id="score-done">Done ✓</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const arc = overlay.querySelector('#score-arc');
      if (arc) arc.style.strokeDashoffset = (parseFloat(C) * (1 - score / 100)).toFixed(1);
      animateCount(overlay.querySelector('#score-num'), score);
      if (passed) {
        setTimeout(() => animateCount(overlay.querySelector('#score-pts'), pointsEarned), 800);
        setTimeout(() => spawnConfetti(overlay.querySelector('#score-confetti')), 200);
      }
    }));

    function close() { overlay.remove(); }
    overlay.querySelector('#score-retry').addEventListener('click', () => { close(); onRetry?.(); });
    overlay.querySelector('#score-done').addEventListener('click', () => { close(); onDone?.(); });

    const storyText = story.tokens.filter(t => t.pinyin).map(t => t.char).join('');
    getAiFeedback(story.title, storyText, transcript, score).then(result => {
      if (!overlay.isConnected) return;
      const el = overlay.querySelector('#score-feedback');
      el.innerHTML = result
        ? `<p class="score-feedback-text">✨ ${result.feedback}</p>${result.tip ? `<p class="score-feedback-tip">💡 ${result.tip}</p>` : ''}`
        : `<p class="score-feedback-text">${passed ? '🎉 Great job! Keep reading every day!' : '💪 Don\'t give up — practice makes perfect!'}</p>`;
    });
  }
  ```

- [ ] **Step 3: Add CSS for score modal v2**

  Remove the old `/* ---- Score modal ---- */` block from `styles.css` (`.score-modal` through `.score-feedback-tip`) and replace with:

  ```css
  /* ---- Score modal v2 ---- */
  .confetti-stage {
    position: fixed; inset: 0; pointer-events: none; z-index: 101;
    display: flex; align-items: center; justify-content: center;
  }
  .confetti-particle {
    position: absolute; font-size: 26px; pointer-events: none;
    animation: confetti-fly 1.4s ease-out forwards;
  }
  @keyframes confetti-fly {
    0%   { transform: translate(0,0) scale(1.2); opacity: 1; }
    100% { transform: translate(var(--dx),var(--dy)) scale(0.4); opacity: 0; }
  }

  .score-modal-v2 { max-width: 480px; padding: 28px 24px; }

  .score-hero { position: relative; display: flex; justify-content: center; margin-bottom: 4px; }
  .score-ring-svg { width: 160px; height: 160px; }
  .score-ring-track { fill: none; stroke: var(--border); stroke-width: 10; }
  .score-ring-arc {
    fill: none; stroke-width: 10; stroke-linecap: round;
    transform: rotate(-90deg); transform-origin: 60px 60px;
    transition: stroke-dashoffset 1.4s cubic-bezier(.17,.67,.29,1.05);
  }
  .score-hero-center {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%,-50%); text-align: center; line-height: 1;
  }
  .score-big-num { display: block; font-size: 64px; font-weight: 900; line-height: 1; }
  .score-pct { font-size: 16px; color: var(--muted); font-weight: 600; }

  .score-label { font-size: 26px; font-weight: 800; text-align: center; margin: 8px 0 2px; animation: pop-in .4s 1s both; }
  .score-byline { text-align: center; color: var(--muted); font-size: 14px; margin-bottom: 16px; }

  @keyframes pop-in {
    0%  { transform: scale(.5); opacity: 0; }
    70% { transform: scale(1.1); }
    100%{ transform: scale(1);   opacity: 1; }
  }

  .score-pass-block { display: flex; flex-direction: column; gap: 10px; }
  .score-pts-big { font-size: 44px; font-weight: 900; text-align: center; color: var(--accent); animation: slide-up .4s .9s both; }
  @keyframes slide-up {
    from { transform: translateY(16px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }

  .score-breakdown { display: flex; flex-direction: column; gap: 4px; }
  .score-bd-row {
    display: flex; justify-content: space-between; font-size: 14px;
    padding: 6px 10px; background: var(--bg); border-radius: 8px;
    animation: slide-up .3s both; opacity: 0; animation-fill-mode: both;
  }
  .score-bd-pts { font-weight: 700; color: var(--accent); }

  .score-streak {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    font-size: 20px; font-weight: 700; color: #e67700;
    background: #fff3bf; border-radius: 12px; padding: 10px;
  }
  .streak-flame { font-size: 28px; animation: flame .8s ease-in-out infinite alternate; }
  @keyframes flame { from { transform: scale(1); } to { transform: scale(1.25); } }

  .score-badge-block { background: linear-gradient(135deg,#fff9c4,#ffe066); border-radius: 12px; padding: 12px; animation: pop-in .4s 1.6s both; }
  .score-badge-title { font-weight: 700; font-size: 15px; margin-bottom: 8px; }
  .score-badge-row { display: flex; align-items: center; gap: 8px; font-size: 15px; margin-top: 4px; }

  .score-fail-block { background: var(--bg); border-radius: 12px; padding: 16px; text-align: center; }
  .score-fail-block p { margin: 4px 0; font-size: 15px; }

  .score-feedback { background: var(--bg); border-radius: 12px; padding: 12px 14px; font-size: 14px; min-height: 44px; }
  .score-feedback-loading { color: var(--muted); }
  .score-feedback-text, .score-feedback-tip { margin: 0 0 4px; }
  .score-feedback-tip { color: var(--muted); }
  ```

- [ ] **Step 4: Test — complete a reading, verify animation**

  - Ring counts up ✓
  - Confetti fires on pass ✓
  - Points animate ✓
  - Streak flame if streak > 0 ✓
  - Badge unlocks show if newly earned ✓

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/scoreModal.js styles.css
  git commit -m "feat: animated achievement screen with confetti and badges"
  ```

---

## Task 16: Student Dashboard Redesign

**Files:**
- Modify: `src/components/studentDashboard.js`
- Modify: `styles.css`

- [ ] **Step 1: Add BADGES constant to studentDashboard.js**

  At the top of the file, add the same BADGES array used in scoreModal.js (copy it):

  ```js
  const BADGES = [
    { id: 'first_pass',  icon: '🌟', label: 'First Pass',     check: (p)    => p.sessions.filter(s => s.passed).length >= 1 },
    { id: 'stories_5',  icon: '📚', label: '5 Stories',       check: (p)    => new Set(p.sessions.filter(s => s.passed).map(s => s.storyId)).size >= 5 },
    { id: 'perfect',    icon: '💯', label: 'Perfect Score',   check: (p)    => p.sessions.some(s => s.score >= 100) },
    { id: 'streak_7',   icon: '🔥', label: '7-Day Streak',    check: (p, k) => k >= 7 },
    { id: 'streak_30',  icon: '🏆', label: '30-Day Streak',   check: (p, k) => k >= 30 },
    { id: 'pts_100',    icon: '💎', label: '100 Points',       check: (p)    => p.totalPoints >= 100 },
    { id: 'pts_500',    icon: '👑', label: '500 Points',       check: (p)    => p.totalPoints >= 500 },
    { id: 'pts_1000',   icon: '🎯', label: '1000 Points',      check: (p)    => p.totalPoints >= 1000 },
  ];
  ```

- [ ] **Step 2: Rewrite the openStudentDashboard HTML**

  In `openStudentDashboard`, replace the `overlay.innerHTML = ...` block with:

  ```js
  const totalPts = progress.totalPoints || 0;
  const MILESTONE = 500;
  const milestoneProgress = Math.min((totalPts % MILESTONE) / MILESTONE * 100, 100);
  const earnedIds = new Set(BADGES.filter(b => b.check(progress, streak)).map(b => b.id));

  overlay.innerHTML = `
    <div class="modal-card dash-card-v2" role="dialog" aria-modal="true">
      <div class="dash-hdr">
        <div class="student-avatar" style="background:${student.color};width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:white;flex-shrink:0">${student.name[0].toUpperCase()}</div>
        <div style="flex:1">
          <div class="dash-name">${student.name}</div>
          <div class="dash-sub">${student.level} · Since ${joinedStr}</div>
        </div>
        <button class="dash-close" id="dash-close" aria-label="Close">✕</button>
      </div>

      <div class="dash-pts-hero">
        <div class="dash-pts-num">${totalPts.toLocaleString()} 💎</div>
        <div class="dash-pts-lbl">Total Points</div>
        <div class="dash-bar-wrap"><div class="dash-bar" style="width:${milestoneProgress}%"></div></div>
        <div class="dash-bar-lbl">${totalPts % MILESTONE} / ${MILESTONE} to next milestone</div>
      </div>

      <div class="dash-stat-cards">
        <div class="dash-sc"><span class="dash-sc-v">🔥 ${streak}</span><span class="dash-sc-l">Streak</span></div>
        <div class="dash-sc"><span class="dash-sc-v">🏆 ${bestStreak}</span><span class="dash-sc-l">Best</span></div>
        <div class="dash-sc"><span class="dash-sc-v">📖 ${sessions.length}</span><span class="dash-sc-l">Sessions</span></div>
        <div class="dash-sc"><span class="dash-sc-v">⭐ ${avgScore}</span><span class="dash-sc-l">Avg</span></div>
      </div>

      <div class="dash-section-title" style="padding:0 16px 8px">Badges</div>
      <div class="dash-badge-wall">
        ${BADGES.map(b => `
          <div class="dash-badge ${earnedIds.has(b.id) ? 'earned' : 'locked'}" title="${b.label}">
            <span style="font-size:26px">${b.icon}</span>
            <span class="dash-badge-lbl">${b.label}</span>
          </div>`).join('')}
      </div>

      <div class="dash-section-title" style="padding:0 16px 8px">Last 30 Days</div>
      <div class="dash-activity-grid" id="dash-grid"></div>
      <div class="dash-legend">
        <span class="dash-legend-dot" style="background:var(--good)"></span> Passed
        <span class="dash-legend-dot" style="background:#ffb300;margin-left:8px"></span> Attempted
        <span class="dash-legend-dot" style="background:var(--danger);opacity:.35;margin-left:8px"></span> Missed
        <span class="dash-legend-dot" style="background:var(--border);margin-left:8px"></span> No reading
      </div>

      <div class="dash-history-wrap">
        <div class="dash-section-title" style="padding:8px 16px">Reading History</div>
        <div class="dash-history" id="dash-history"></div>
      </div>
      <div class="dash-footer">
        <button class="danger dash-delete-btn" id="dash-delete">🗑️ Delete Student</button>
      </div>
    </div>`;
  ```

- [ ] **Step 3: Add CSS for dashboard v2**

  Remove old `.dash-card`, `.dash-header`, `.dash-stats`, `.dash-stat` CSS. Append:

  ```css
  /* ---- Dashboard v2 ---- */
  .dash-card-v2 { max-width: 560px; width: 100%; max-height: 92vh; overflow-y: auto; padding: 0; }

  .dash-hdr {
    display: flex; align-items: center; gap: 14px;
    padding: 20px 20px 16px; border-bottom: 1px solid var(--border);
    position: sticky; top: 0; background: var(--surface); z-index: 1;
  }
  .dash-name { font-size: 22px; font-weight: 800; }

  .dash-pts-hero {
    background: linear-gradient(135deg, var(--accent), #ae3ec9);
    color: white; padding: 20px; text-align: center;
  }
  .dash-pts-num { font-size: 48px; font-weight: 900; line-height: 1.1; }
  .dash-pts-lbl { font-size: 14px; opacity: .85; margin-bottom: 12px; }
  .dash-bar-wrap { background: rgba(255,255,255,.25); border-radius: 999px; height: 10px; overflow: hidden; margin-bottom: 4px; }
  .dash-bar { height: 100%; background: white; border-radius: 999px; transition: width 1s ease-out; }
  .dash-bar-lbl { font-size: 12px; opacity: .8; }

  .dash-stat-cards { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; padding: 16px; }
  @media (max-width: 480px) { .dash-stat-cards { grid-template-columns: repeat(2,1fr); } }
  .dash-sc { background: var(--bg); border-radius: 12px; padding: 14px 10px; display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; }
  .dash-sc-v { font-size: 22px; font-weight: 800; }
  .dash-sc-l { font-size: 12px; color: var(--muted); font-weight: 600; }

  .dash-badge-wall { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; padding: 0 16px 16px; }
  @media (max-width: 400px) { .dash-badge-wall { grid-template-columns: repeat(3,1fr); } }
  .dash-badge { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 6px; border-radius: 12px; text-align: center; }
  .dash-badge.earned { background: #fff9c4; border: 2px solid #ffe066; }
  .dash-badge.locked { background: var(--bg); border: 2px solid var(--border); opacity: .45; filter: grayscale(.6); }
  .dash-badge-lbl { font-size: 11px; font-weight: 600; line-height: 1.2; }
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/studentDashboard.js styles.css
  git commit -m "feat: dashboard redesign with points hero and badge wall"
  ```

---

## Task 17: Bulk Story Generation

**Files:**
- Create: `scripts/generate-stories.mjs`
- Modify: `stories/index.json`

- [ ] **Step 1: Create the script**

  ```js
  // scripts/generate-stories.mjs
  // Run: ANTHROPIC_API_KEY=sk-ant-... node scripts/generate-stories.mjs

  import fs from 'fs';
  import path from 'path';
  import { fileURLToPath } from 'url';

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const STORIES_DIR = path.join(__dirname, '../stories');
  const INDEX_PATH = path.join(STORIES_DIR, 'index.json');

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }

  const CHAR_RANGES = { P1:'40–60', P2:'60–90', P3:'90–130', P4:'120–170', P5:'160–220', P6:'200–280' };

  const PLAN = [
    { level:'P1', theme:'家人',     slug:'jiaren'     },
    { level:'P1', theme:'动物',     slug:'dongwu'     },
    { level:'P1', theme:'学校',     slug:'xuexiao'    },
    { level:'P1', theme:'节日',     slug:'jieri'      },
    { level:'P2', theme:'友谊',     slug:'youyi'      },
    { level:'P2', theme:'自然',     slug:'ziran'      },
    { level:'P2', theme:'帮助别人', slug:'bangzhu'    },
    { level:'P2', theme:'好习惯',   slug:'xiguan'     },
    { level:'P3', theme:'环境保护', slug:'huanjing'   },
    { level:'P3', theme:'社区助人', slug:'shequ'      },
    { level:'P3', theme:'运动健康', slug:'yundong'    },
    { level:'P3', theme:'节约用水', slug:'jieyue'     },
    { level:'P4', theme:'坚持不懈', slug:'jianchi'    },
    { level:'P4', theme:'传统文化', slug:'chuantong'  },
    { level:'P4', theme:'科技生活', slug:'keji'       },
    { level:'P4', theme:'爱心服务', slug:'aixin'      },
    { level:'P5', theme:'历史故事', slug:'lishi'      },
    { level:'P5', theme:'品德修养', slug:'pinde'      },
    { level:'P5', theme:'坚强意志', slug:'yizhi'      },
    { level:'P5', theme:'环球视野', slug:'huanqiu'    },
    { level:'P6', theme:'民族和谐', slug:'minzu'      },
    { level:'P6', theme:'社会责任', slug:'zeren'      },
    { level:'P6', theme:'科学探索', slug:'kexue'      },
    { level:'P6', theme:'生命价值', slug:'shengming'  },
  ];

  async function generate(level, theme) {
    const levelNum = level.slice(1);
    const prompt = `Generate a short Chinese reading story for Singapore Primary ${levelNum} (${level}) students following MOE PSLE Chinese curriculum standards.

Theme: ${theme}
Length: approximately ${CHAR_RANGES[level]} Chinese characters (not counting punctuation).

Return ONLY valid JSON — no markdown, no code fences:
{
  "id": "gen-${level.toLowerCase()}-[3-4 syllable pinyin slug]",
  "title": "[Chinese title, 2–6 characters]",
  "level": "${level}",
  "estMinutes": 3,
  "tags": ["tag1", "tag2"],
  "tokens": [{"char": "每", "pinyin": "měi"}, {"char": "，", "pinyin": ""}]
}

RULES:
1. Each token is ONE Chinese character OR one punctuation mark.
2. Pinyin uses Unicode diacritics (ā á ǎ à, ē é ě è, etc.).
3. Punctuation (。！？，：；""''—…《》) has empty pinyin "".
4. Particles: 的→"de" 地→"de" 得→"de" 了→"le" 着→"zhe" 过→"guo" 吗→"ma" 呢→"ne" 吧→"ba"
5. Age-appropriate, positive, aligned with Singapore PSLE ${level} vocabulary.
6. End with 。`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `API ${res.status}`); }

    const data = await res.json();
    let text = data.content[0].text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const story = JSON.parse(text);
    if (!story.tokens?.length || !story.title) throw new Error('Invalid format');

    const cjk = story.tokens.filter(t => /[\u4e00-\u9fff]/.test(t.char));
    const withPinyin = cjk.filter(t => t.pinyin);
    if (withPinyin.length / cjk.length < 0.8) throw new Error(`Low pinyin: ${withPinyin.length}/${cjk.length}`);
    return story;
  }

  async function main() {
    const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    const existingIds = new Set(index.map(s => s.id));
    let generated = 0;

    for (const { level, theme, slug } of PLAN) {
      const id = `${level.toLowerCase()}-${slug}`;
      if (existingIds.has(id)) { console.log(`  SKIP  ${id}`); continue; }

      process.stdout.write(`  GEN   ${level} ${theme} ... `);
      try {
        const story = await generate(level, theme);
        story.id = id;
        fs.writeFileSync(path.join(STORIES_DIR, `${id}.json`), JSON.stringify(story, null, 2), 'utf8');
        index.push({ id: story.id, title: story.title, level: story.level, estMinutes: story.estMinutes, tags: story.tags });
        existingIds.add(id);
        generated++;
        console.log(`✓ "${story.title}" (${story.tokens.filter(t => t.pinyin).length} chars)`);
      } catch (err) {
        console.log(`✗ ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 1200));
    }

    const LEVEL_ORDER = ['P1','P2','P3','P4','P5','P6'];
    index.sort((a, b) => (LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level)) || a.id.localeCompare(b.id));
    fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n', 'utf8');
    console.log(`\nDone. ${generated} new stories. Total: ${index.length}`);
  }

  main().catch(e => { console.error(e); process.exit(1); });
  ```

- [ ] **Step 2: Run**

  ```bash
  cd "/Users/wengleong/Claude Workspace/chinese-reading"
  ANTHROPIC_API_KEY=sk-ant-YOUR_KEY node scripts/generate-stories.mjs
  ```

  Expected: 24 lines of `✓ "title"`, then `Done. 24 new stories. Total: 28`.

- [ ] **Step 3: Validate**

  ```bash
  node --input-type=module <<'EOF'
  import fs from 'fs';
  const index = JSON.parse(fs.readFileSync('stories/index.json','utf8'));
  console.log('Total:', index.length);
  let errors = 0;
  for (const s of index) {
    if (!fs.existsSync(`stories/${s.id}.json`)) { console.error('MISSING:', s.id); errors++; continue; }
    const story = JSON.parse(fs.readFileSync(`stories/${s.id}.json`,'utf8'));
    const cjk = story.tokens.filter(t => /[\u4e00-\u9fff]/.test(t.char));
    const ok = cjk.filter(t => t.pinyin).length;
    if (ok/cjk.length < 0.9) { console.warn('LOW PINYIN:', s.id, ok+'/'+cjk.length); errors++; }
  }
  console.log(errors ? `${errors} issues found` : 'All OK');
  EOF
  ```

  Expected: `Total: 28` and `All OK`.

- [ ] **Step 4: Commit**

  ```bash
  git add stories/ scripts/generate-stories.mjs
  git commit -m "feat: add 24 new stories (P1-P6) and generation script"
  ```

---

## Task 18: Deploy and Verify

- [ ] **Step 1: Push to main → deploys to GitHub Pages**

  ```bash
  cd "/Users/wengleong/Claude Workspace/chinese-reading"
  git push origin main
  ```

  GitHub Actions (`.github/workflows/pages.yml`) deploys automatically.

- [ ] **Step 2: Confirm Railway API is live**

  ```bash
  curl https://YOUR_RAILWAY_URL/health
  # Expected: {"ok":true}
  ```

- [ ] **Step 3: End-to-end smoke test on live site**

  1. Open GitHub Pages URL in fresh incognito window
  2. Onboarding appears → Create Family → write down code
  3. Add a student → opens app
  4. Pick a story → verify 28 stories in list
  5. Record audio → stop → score modal animates
  6. Check Railway DB: `select count(*) from progress_sessions;` → 1 row
  7. Open a second incognito tab → enter code → progress syncs
  8. Open Settings → enter Anthropic API key → saved to family account
  9. Mobile: open on phone → sticky record bar at bottom, story scrolls freely

- [ ] **Step 4: Save API URL to memory**

  Once Railway URL is known, update `src/lib/api.js` with the real URL and push again.

---

## Dependency Order

```
Tasks 1–2  (scaffold + schema)     → must complete before 3–6
Tasks 3–6  (routes)                → must complete before 7 (deploy)
Task 7     (Railway deploy)        → must complete before 8 (api.js URL)
Tasks 8–9  (api.js + cloud.js)     → must complete before 10–14
Tasks 10–12 (sync data)            → can run in parallel after 9
Tasks 13–16 (UI improvements)      → independent, can run in parallel
Task 17    (stories)               → fully independent
Task 18    (deploy + verify)       → last
```
