# Chinese Reading App — Cloud Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase cloud backend for family auth, data sync, and recording storage; redesign the achievement + dashboard screens; add sticky mobile record button; bulk-generate 24 new stories.

**Architecture:** Static GitHub Pages site gains a Supabase backend (Postgres + Auth + Storage + Edge Functions). Family code (e.g. `TIGER-2310`) acts as the auth credential — Edge Functions proxy family creation/joining and Anthropic API calls. `localStorage` remains the primary read cache; all writes also fire async cloud upserts. Sessions and recordings upload automatically after each reading.

**Tech Stack:** Vanilla JS ES modules, Supabase JS v2 (CDN), Deno Edge Functions, Supabase Storage (recordings), Claude Haiku 4.5 (story gen + feedback proxy).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/supabase.js` | Create | Supabase client singleton |
| `src/lib/cloud.js` | Create | Sync helpers: push/pull students, sessions, recordings, API key |
| `src/components/familyOnboarding.js` | Create | Create/Join family UI shown on first visit |
| `supabase/migrations/001_initial.sql` | Create | Schema: families, students, progress_sessions + RLS |
| `supabase/functions/create-family/index.ts` | Create | Generate code, create Supabase auth user |
| `supabase/functions/join-family/index.ts` | Create | Lookup code → return auth credentials |
| `supabase/functions/generate-story/index.ts` | Create | Anthropic proxy using stored family API key |
| `scripts/generate-stories.mjs` | Create | Bulk generate 24 stories via Anthropic |
| `src/app.js` | Modify | Boot: check session, show onboarding if needed |
| `src/lib/students.js` | Modify | `createStudent`, `deleteStudent`, `addSession` call cloud push |
| `src/lib/storage.js` | Modify | `saveRecording` triggers cloud upload |
| `src/components/recorder.js` | Modify | Sticky mobile buttons; pass sessionId to storage |
| `src/components/scoreModal.js` | Modify | Animated score ring, confetti, point counter, badges |
| `src/components/studentDashboard.js` | Modify | Bigger stats, badge wall, points progress bar |
| `src/components/settings.js` | Modify | Save API key to cloud; fallback to localStorage |
| `src/components/storyGenerator.js` | Modify | Use Edge Function proxy instead of direct Anthropic fetch |
| `stories/index.json` | Modify | Add 24 new story entries |
| `styles.css` | Modify | Mobile sticky recorder, score modal animations, dashboard redesign |

---

## Task 1: Supabase Project Setup (Manual Steps)

> One-time manual setup — no code yet.

**Files:** None (manual setup, produces values for later tasks)

- [ ] **Step 1: Create Supabase project**

  Go to [supabase.com](https://supabase.com), create a new project called `chinese-reading`. Choose a region close to Singapore (ap-southeast-1 or ap-east-1). Save the database password.

- [ ] **Step 2: Note your project credentials**

  From Project Settings → API, copy:
  - `Project URL` → call this `SUPABASE_URL` (e.g. `https://abcxyz.supabase.co`)
  - `anon/public` key → call this `SUPABASE_ANON_KEY`
  - `service_role` key → call this `SERVICE_ROLE_KEY` (keep secret, Edge Functions only)

- [ ] **Step 3: Install Supabase CLI**

  ```bash
  brew install supabase/tap/supabase
  supabase login
  ```

- [ ] **Step 4: Link to your project**

  ```bash
  cd "/Users/wengleong/Claude Workspace/chinese-reading"
  supabase init       # creates supabase/ directory
  supabase link --project-ref YOUR_PROJECT_REF
  # Project ref is the subdomain in SUPABASE_URL
  ```

- [ ] **Step 5: Create recordings storage bucket**

  In Supabase Dashboard → Storage → New Bucket:
  - Name: `recordings`
  - Public: **No** (authenticated access only)
  - File size limit: 200MB

- [ ] **Step 6: Commit placeholder supabase config**

  ```bash
  git add supabase/
  git commit -m "chore: init supabase project config"
  ```

---

## Task 2: Database Schema + RLS

**Files:**
- Create: `supabase/migrations/001_initial.sql`

- [ ] **Step 1: Create migration file**

  ```bash
  mkdir -p supabase/migrations
  ```

  Create `supabase/migrations/001_initial.sql`:

  ```sql
  -- Families: one per family group
  create table public.families (
    id uuid primary key references auth.users(id) on delete cascade,
    code text unique not null,
    auth_password text not null,
    anthropic_key text,
    created_at timestamptz default now()
  );

  -- Students: multiple per family
  create table public.students (
    id text primary key,
    family_id uuid not null references public.families(id) on delete cascade,
    name text not null,
    level text not null,
    color text not null,
    created_at timestamptz default now()
  );

  -- Progress sessions: one row per reading attempt
  create table public.progress_sessions (
    id text primary key,
    student_id text not null references public.students(id) on delete cascade,
    family_id uuid not null references public.families(id) on delete cascade,
    story_id text not null,
    story_title text not null,
    date text not null,
    score integer not null,
    passed boolean not null,
    points_earned integer not null default 0,
    transcript text,
    recording_url text,
    completed_at bigint,
    created_at timestamptz default now()
  );

  -- Enable RLS
  alter table public.families enable row level security;
  alter table public.students enable row level security;
  alter table public.progress_sessions enable row level security;

  -- Families: own row only
  create policy "family_self" on public.families
    for all using (auth.uid() = id);

  -- Students: own family only
  create policy "students_family" on public.students
    for all using (auth.uid() = family_id);

  -- Sessions: own family only
  create policy "sessions_family" on public.progress_sessions
    for all using (auth.uid() = family_id);

  -- Storage RLS: authenticated users can manage their own prefix
  create policy "recordings_own" on storage.objects
    for all using (
      bucket_id = 'recordings'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  ```

- [ ] **Step 2: Apply migration**

  ```bash
  supabase db push
  ```

  Expected output: `Applying migration 001_initial.sql... Done`

- [ ] **Step 3: Commit**

  ```bash
  git add supabase/migrations/001_initial.sql
  git commit -m "feat: add supabase schema with RLS"
  ```

---

## Task 3: Supabase Client Module

**Files:**
- Create: `src/lib/supabase.js`

- [ ] **Step 1: Create the module**

  Replace `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY` with the values from Task 1 Step 2.

  ```js
  // src/lib/supabase.js
  // Supabase client singleton. Import this wherever Supabase access is needed.
  import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

  const SUPABASE_URL = 'YOUR_SUPABASE_URL';
  const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

  export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      storageKey: 'cr-supabase-session',
    },
  });

  /** Returns the current family UUID, or null if not signed in. */
  export async function getFamilyId() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  }

  /** True if there is an active Supabase session. */
  export async function isAuthenticated() {
    const id = await getFamilyId();
    return id !== null;
  }
  ```

- [ ] **Step 2: Verify it loads in browser**

  Open `index.html` in a browser (via local server: `python3 -m http.server 8080` from the project dir).
  Open DevTools console, run:
  ```js
  import('/src/lib/supabase.js').then(m => console.log('supabase ok', m.supabase))
  ```
  Expected: logs the supabase client object, no 404 errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/lib/supabase.js
  git commit -m "feat: add supabase client module"
  ```

---

## Task 4: Cloud Sync Module

**Files:**
- Create: `src/lib/cloud.js`

- [ ] **Step 1: Create cloud.js**

  ```js
  // src/lib/cloud.js
  // Cloud sync helpers. All functions are no-ops when unauthenticated.
  // localStorage is the primary store — cloud is write-through and pulls on login.

  import { supabase, getFamilyId } from './supabase.js';

  // ---- Students ----

  export async function pushStudent(student) {
    const familyId = await getFamilyId();
    if (!familyId) return;
    await supabase.from('students').upsert({
      id: student.id,
      family_id: familyId,
      name: student.name,
      level: student.level,
      color: student.color,
      created_at: new Date(student.createdAt).toISOString(),
    }, { onConflict: 'id' }).throwOnError().catch(() => {});
  }

  export async function deleteStudentCloud(studentId) {
    const familyId = await getFamilyId();
    if (!familyId) return;
    await supabase.from('students').delete().eq('id', studentId).catch(() => {});
  }

  // ---- Sessions ----

  export async function pushSession(session, studentId) {
    const familyId = await getFamilyId();
    if (!familyId) return;
    await supabase.from('progress_sessions').upsert({
      id: session.id,
      student_id: studentId,
      family_id: familyId,
      story_id: session.storyId,
      story_title: session.storyTitle,
      date: session.date,
      score: session.score,
      passed: session.passed,
      points_earned: session.pointsEarned ?? 0,
      transcript: session.transcript ?? '',
      recording_url: session.recordingUrl ?? null,
      completed_at: session.completedAt ?? null,
    }, { onConflict: 'id' }).throwOnError().catch(() => {});
  }

  export async function updateSessionRecordingUrl(sessionId, url) {
    await supabase.from('progress_sessions')
      .update({ recording_url: url })
      .eq('id', sessionId)
      .catch(() => {});
  }

  // ---- Recordings ----

  /**
   * Upload a recording blob to Supabase Storage.
   * Returns the public URL string, or null on failure.
   */
  export async function uploadRecording(blob, mimeType, studentId, sessionId) {
    const familyId = await getFamilyId();
    if (!familyId) return null;
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const path = `${familyId}/${studentId}/${sessionId}.${ext}`;
    const { data, error } = await supabase.storage
      .from('recordings')
      .upload(path, blob, { contentType: mimeType, upsert: true });
    if (error) { console.warn('Recording upload failed:', error.message); return null; }
    const { data: { publicUrl } } = supabase.storage.from('recordings').getPublicUrl(path);
    return publicUrl;
  }

  // ---- API Key ----

  export async function saveApiKeyCloud(key) {
    const familyId = await getFamilyId();
    if (!familyId) return false;
    const { error } = await supabase.from('families')
      .update({ anthropic_key: key })
      .eq('id', familyId);
    return !error;
  }

  export async function getApiKeyCloud() {
    const familyId = await getFamilyId();
    if (!familyId) return null;
    const { data } = await supabase.from('families')
      .select('anthropic_key')
      .eq('id', familyId)
      .single();
    return data?.anthropic_key ?? null;
  }

  // ---- Sync Down (call on login) ----

  /**
   * Pull all family data from cloud and merge into localStorage.
   * Merges by ID — adds missing records, does not overwrite newer local data.
   */
  export async function syncDown() {
    const familyId = await getFamilyId();
    if (!familyId) return;

    // Pull students
    const { data: cloudStudents } = await supabase
      .from('students').select('*').eq('family_id', familyId);
    if (cloudStudents?.length) {
      const localRaw = localStorage.getItem('cr-students');
      const local = localRaw ? JSON.parse(localRaw) : [];
      const localIds = new Set(local.map(s => s.id));
      const toAdd = cloudStudents.filter(s => !localIds.has(s.id)).map(s => ({
        id: s.id, name: s.name, level: s.level, color: s.color,
        createdAt: new Date(s.created_at).getTime(),
      }));
      if (toAdd.length) {
        localStorage.setItem('cr-students', JSON.stringify([...local, ...toAdd]));
      }
    }

    // Pull sessions
    const { data: cloudSessions } = await supabase
      .from('progress_sessions').select('*').eq('family_id', familyId);
    if (cloudSessions?.length) {
      // Group by student_id
      const byStudent = {};
      for (const s of cloudSessions) {
        if (!byStudent[s.student_id]) byStudent[s.student_id] = [];
        byStudent[s.student_id].push(s);
      }
      for (const [studentId, sessions] of Object.entries(byStudent)) {
        const key = `cr-progress-${studentId}`;
        const localRaw = localStorage.getItem(key);
        const local = localRaw ? JSON.parse(localRaw) : { totalPoints: 0, sessions: [] };
        const localIds = new Set(local.sessions.map(s => s.id));
        const toAdd = sessions
          .filter(s => !localIds.has(s.id))
          .map(s => ({
            id: s.id,
            date: s.date,
            storyId: s.story_id,
            storyTitle: s.story_title,
            score: s.score,
            passed: s.passed,
            pointsEarned: s.points_earned,
            transcript: s.transcript ?? '',
            recordingUrl: s.recording_url ?? null,
            completedAt: s.completed_at,
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
  }
  ```

- [ ] **Step 2: Verify module parses**

  ```bash
  node --input-type=module <<'EOF'
  import('/Users/wengleong/Claude Workspace/chinese-reading/src/lib/cloud.js')
    .then(() => console.log('cloud.js OK'))
    .catch(e => console.error('FAIL:', e.message))
  EOF
  ```

  Expected: `cloud.js OK` (or a fetch error for the supabase CDN import — that's fine in Node, it's a browser module).

- [ ] **Step 3: Commit**

  ```bash
  git add src/lib/cloud.js
  git commit -m "feat: add cloud sync module"
  ```

---

## Task 5: Edge Function — create-family

**Files:**
- Create: `supabase/functions/create-family/index.ts`

- [ ] **Step 1: Create the function**

  ```bash
  mkdir -p supabase/functions/create-family
  ```

  ```typescript
  // supabase/functions/create-family/index.ts
  import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  const ANIMALS = [
    'TIGER', 'PANDA', 'DRAGON', 'EAGLE', 'LION',
    'WOLF', 'BEAR', 'CRANE', 'DEER', 'HAWK',
    'FOX', 'OWL', 'SEAL', 'LYNX', 'DOVE',
  ];

  function generateCode(): string {
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const digits = String(Math.floor(Math.random() * 9000) + 1000);
    return `${animal}-${digits}`;
  }

  serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Generate unique code (retry up to 5 times on collision)
    let code = '';
    for (let i = 0; i < 5; i++) {
      code = generateCode();
      const { data } = await admin.from('families').select('id').eq('code', code).maybeSingle();
      if (!data) break;
    }

    const password = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const email = `${code.toLowerCase()}@cr.app`;

    // Create Supabase auth user
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authErr) {
      return new Response(JSON.stringify({ error: authErr.message }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Insert family record
    const { error: dbErr } = await admin.from('families').insert({
      id: authData.user.id,
      code,
      auth_password: password,
    });
    if (dbErr) {
      // Rollback: delete auth user
      await admin.auth.admin.deleteUser(authData.user.id);
      return new Response(JSON.stringify({ error: dbErr.message }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ code, email, password }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  });
  ```

- [ ] **Step 2: Deploy function**

  ```bash
  supabase functions deploy create-family --no-verify-jwt
  ```

  Expected: `Function create-family deployed`

- [ ] **Step 3: Test in terminal**

  ```bash
  curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/create-family \
    -H "apikey: YOUR_ANON_KEY" \
    -H "Content-Type: application/json"
  ```

  Expected response:
  ```json
  {"code":"TIGER-2847","email":"tiger-2847@cr.app","password":"..."}
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add supabase/functions/create-family/
  git commit -m "feat: create-family edge function"
  ```

---

## Task 6: Edge Function — join-family

**Files:**
- Create: `supabase/functions/join-family/index.ts`

- [ ] **Step 1: Create the function**

  ```bash
  mkdir -p supabase/functions/join-family
  ```

  ```typescript
  // supabase/functions/join-family/index.ts
  import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

    let code: string;
    try {
      ({ code } = await req.json());
    } catch {
      return new Response(JSON.stringify({ error: 'Missing code' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: family, error } = await admin
      .from('families')
      .select('auth_password')
      .eq('code', code.toUpperCase().trim())
      .maybeSingle();

    if (error || !family) {
      return new Response(JSON.stringify({ error: 'Invalid family code' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const email = `${code.toLowerCase().trim()}@cr.app`;
    return new Response(JSON.stringify({ email, password: family.auth_password }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  });
  ```

- [ ] **Step 2: Deploy**

  ```bash
  supabase functions deploy join-family --no-verify-jwt
  ```

- [ ] **Step 3: Test**

  Replace `TIGER-2847` with the code returned in Task 5 Step 3.

  ```bash
  curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/join-family \
    -H "apikey: YOUR_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"code":"TIGER-2847"}'
  ```

  Expected: `{"email":"tiger-2847@cr.app","password":"..."}` matching what was returned in Task 5.

- [ ] **Step 4: Commit**

  ```bash
  git add supabase/functions/join-family/
  git commit -m "feat: join-family edge function"
  ```

---

## Task 7: Edge Function — generate-story (Anthropic Proxy)

**Files:**
- Create: `supabase/functions/generate-story/index.ts`

- [ ] **Step 1: Create the function**

  ```bash
  mkdir -p supabase/functions/generate-story
  ```

  ```typescript
  // supabase/functions/generate-story/index.ts
  import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Verify the user session
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Get family's API key via service role
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: family } = await admin
      .from('families')
      .select('anthropic_key')
      .eq('id', user.id)
      .single();

    if (!family?.anthropic_key) {
      return new Response(JSON.stringify({ error: 'No API key configured for this family' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Proxy to Anthropic
    const body = await req.json();
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': family.anthropic_key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await anthropicRes.json();
    return new Response(JSON.stringify(data), {
      status: anthropicRes.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  });
  ```

- [ ] **Step 2: Deploy**

  ```bash
  supabase functions deploy generate-story
  # Note: no --no-verify-jwt here — this function requires auth
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add supabase/functions/generate-story/
  git commit -m "feat: generate-story edge function (anthropic proxy)"
  ```

---

## Task 8: Family Onboarding UI

**Files:**
- Create: `src/components/familyOnboarding.js`

- [ ] **Step 1: Create the component**

  ```js
  // src/components/familyOnboarding.js
  // Shown on first visit (no Supabase session). Lets a family create or join.

  import { supabase } from '../lib/supabase.js';
  import { syncDown } from '../lib/cloud.js';

  const EDGE_BASE = 'https://YOUR_PROJECT.supabase.co/functions/v1';
  const ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

  async function callEdge(fn, body = {}) {
    const res = await fetch(`${EDGE_BASE}/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  /**
   * Show the onboarding overlay. Calls onDone() when the family is signed in.
   * Calls onSkip() if the user dismisses without signing in (offline mode).
   */
  export function showFamilyOnboarding({ onDone, onSkip }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay onboarding-overlay';
    overlay.innerHTML = `
      <div class="modal-card onboarding-card" role="dialog" aria-modal="true">
        <div class="onboarding-logo">📚</div>
        <h2 class="modal-title">每日华文阅读</h2>
        <p class="modal-hint" style="text-align:center">
          Daily Chinese Reading · Sync your progress across devices
        </p>

        <div class="onboarding-tabs">
          <button class="onboarding-tab active" id="tab-join">Enter Code</button>
          <button class="onboarding-tab" id="tab-create">New Family</button>
        </div>

        <!-- Join panel -->
        <div id="panel-join">
          <p class="modal-hint">Enter your family code to restore your progress on this device.</p>
          <input class="modal-input onboarding-code-input" id="ob-code"
            type="text" placeholder="TIGER-2310"
            autocomplete="off" autocapitalize="characters" spellcheck="false" />
          <div class="modal-error" id="ob-join-error" hidden></div>
          <div class="modal-actions">
            <button class="secondary" id="ob-skip">Use without code</button>
            <button class="primary" id="ob-join-btn">Join →</button>
          </div>
        </div>

        <!-- Create panel (hidden initially) -->
        <div id="panel-create" hidden>
          <p class="modal-hint">We'll generate a unique code for your family. Write it down — you'll need it to add more devices.</p>
          <div class="modal-error" id="ob-create-error" hidden></div>
          <div class="modal-actions">
            <button class="secondary" id="ob-back">← Back</button>
            <button class="primary" id="ob-create-btn">✨ Create Family</button>
          </div>
        </div>

        <!-- Code reveal panel (hidden initially) -->
        <div id="panel-code" hidden>
          <p class="modal-hint" style="text-align:center">Your family code is:</p>
          <div class="onboarding-code-display" id="ob-code-display"></div>
          <p class="modal-hint" style="text-align:center;color:var(--danger)">
            ⚠️ Save this code! You'll need it to sign in on other devices.
          </p>
          <button class="secondary" id="ob-copy-btn" style="width:100%">📋 Copy Code</button>
          <div class="modal-actions" style="margin-top:8px">
            <button class="primary" id="ob-done-btn" style="width:100%">Start Reading →</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const tabJoin = overlay.querySelector('#tab-join');
    const tabCreate = overlay.querySelector('#tab-create');
    const panelJoin = overlay.querySelector('#panel-join');
    const panelCreate = overlay.querySelector('#panel-create');
    const panelCode = overlay.querySelector('#panel-code');

    function showPanel(name) {
      panelJoin.hidden = name !== 'join';
      panelCreate.hidden = name !== 'create';
      panelCode.hidden = name !== 'code';
      tabJoin.classList.toggle('active', name === 'join');
      tabCreate.classList.toggle('active', name === 'create');
    }

    tabJoin.addEventListener('click', () => showPanel('join'));
    tabCreate.addEventListener('click', () => showPanel('create'));
    overlay.querySelector('#ob-back').addEventListener('click', () => showPanel('join'));

    // Join flow
    const codeInput = overlay.querySelector('#ob-code');
    const joinError = overlay.querySelector('#ob-join-error');
    const joinBtn = overlay.querySelector('#ob-join-btn');

    overlay.querySelector('#ob-skip').addEventListener('click', () => {
      overlay.remove();
      onSkip?.();
    });

    joinBtn.addEventListener('click', async () => {
      const code = codeInput.value.trim().toUpperCase();
      if (!code) { joinError.textContent = 'Please enter your family code.'; joinError.hidden = false; return; }
      joinBtn.disabled = true; joinBtn.textContent = '⏳ Joining…';
      joinError.hidden = true;

      const result = await callEdge('join-family', { code }).catch(() => ({ error: 'Network error' }));
      if (result.error) {
        joinError.textContent = result.error === 'Invalid family code'
          ? 'Code not found. Check spelling and try again.'
          : result.error;
        joinError.hidden = false;
        joinBtn.disabled = false; joinBtn.textContent = 'Join →';
        return;
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: result.email, password: result.password,
      });
      if (signInErr) {
        joinError.textContent = 'Sign-in failed. Please try again.';
        joinError.hidden = false;
        joinBtn.disabled = false; joinBtn.textContent = 'Join →';
        return;
      }

      await syncDown();
      overlay.remove();
      onDone?.();
    });

    // Create flow
    const createError = overlay.querySelector('#ob-create-error');
    const createBtn = overlay.querySelector('#ob-create-btn');

    createBtn.addEventListener('click', async () => {
      createBtn.disabled = true; createBtn.textContent = '⏳ Creating…';
      createError.hidden = true;

      const result = await callEdge('create-family').catch(() => ({ error: 'Network error' }));
      if (result.error) {
        createError.textContent = result.error;
        createError.hidden = false;
        createBtn.disabled = false; createBtn.textContent = '✨ Create Family';
        return;
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: result.email, password: result.password,
      });
      if (signInErr) {
        createError.textContent = 'Account created but sign-in failed. Use code: ' + result.code;
        createError.hidden = false;
        createBtn.disabled = false; createBtn.textContent = '✨ Create Family';
        return;
      }

      // Show code reveal
      overlay.querySelector('#ob-code-display').textContent = result.code;
      showPanel('code');
    });

    // Copy code
    overlay.querySelector('#ob-copy-btn').addEventListener('click', () => {
      const code = overlay.querySelector('#ob-code-display').textContent;
      navigator.clipboard?.writeText(code).catch(() => {});
      overlay.querySelector('#ob-copy-btn').textContent = '✓ Copied!';
    });

    overlay.querySelector('#ob-done-btn').addEventListener('click', () => {
      overlay.remove();
      onDone?.();
    });

    setTimeout(() => overlay.querySelector('#ob-code')?.focus(), 50);
  }
  ```

  Replace `YOUR_PROJECT` and `YOUR_SUPABASE_ANON_KEY` with real values.

- [ ] **Step 2: Add CSS to `styles.css`**

  Append to `styles.css`:

  ```css
  /* ---- Family onboarding ---- */
  .onboarding-overlay { z-index: 200; }
  .onboarding-card { max-width: 400px; text-align: left; }
  .onboarding-logo { font-size: 48px; text-align: center; margin-bottom: 4px; }

  .onboarding-tabs {
    display: flex;
    border-bottom: 2px solid var(--border);
    margin-bottom: 16px;
  }
  .onboarding-tab {
    flex: 1;
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    margin-bottom: -2px;
    padding: 10px;
    font: inherit;
    font-weight: 600;
    color: var(--muted);
    cursor: pointer;
  }
  .onboarding-tab.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .onboarding-code-input {
    text-align: center;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .onboarding-code-display {
    font-size: 36px;
    font-weight: 900;
    text-align: center;
    color: var(--accent);
    letter-spacing: 0.08em;
    background: var(--accent-soft);
    border-radius: 12px;
    padding: 16px;
    margin: 8px 0;
  }
  ```

- [ ] **Step 3: Test manually in browser**

  Open the app. Temporarily add to `index.html` just before `</body>`:
  ```html
  <script type="module">
    import { showFamilyOnboarding } from './src/components/familyOnboarding.js';
    showFamilyOnboarding({ onDone: () => console.log('done'), onSkip: () => console.log('skip') });
  </script>
  ```
  Verify:
  - Onboarding modal appears
  - Tab switching works
  - "Use without code" dismisses it
  - Create family → generates code → shows code panel
  - Join with valid code → signs in (check Supabase Auth dashboard for the new user)

  Remove the test script after verifying.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/familyOnboarding.js styles.css
  git commit -m "feat: family onboarding UI (create/join)"
  ```

---

## Task 9: Wire Auth Into App Boot

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Add auth boot to app.js**

  At the top of `src/app.js`, add these imports after the existing ones:

  ```js
  import { supabase, isAuthenticated } from './lib/supabase.js';
  import { syncDown } from './lib/cloud.js';
  import { showFamilyOnboarding } from './components/familyOnboarding.js';
  ```

  Replace the bottom `(async function init() { ... })()` block with:

  ```js
  (async function init() {
    // Check for existing Supabase session
    const authed = await isAuthenticated();
    if (!authed) {
      // Show onboarding; proceed to load stories regardless of outcome
      await new Promise(resolve => {
        showFamilyOnboarding({
          onDone: async () => { await syncDown(); resolve(); },
          onSkip: resolve,
        });
      });
    } else {
      // Silently sync in background
      syncDown().catch(() => {});
    }

    // Existing story loading
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

- [ ] **Step 2: Verify in browser**

  Open the app fresh (clear localStorage first: `localStorage.clear()` in console, reload). Onboarding should appear. Click "Use without code" — app should load normally. Reload → onboarding appears again (no session). Create a family → code appears → click "Start Reading" → app loads → Supabase Auth dashboard should show 1 user.

- [ ] **Step 3: Commit**

  ```bash
  git add src/app.js
  git commit -m "feat: wire supabase auth into app boot"
  ```

---

## Task 10: Sync Students to Cloud

**Files:**
- Modify: `src/lib/students.js`

- [ ] **Step 1: Add cloud imports at top of students.js**

  Add after the existing constants at the top:

  ```js
  import { pushStudent, deleteStudentCloud } from './cloud.js';
  ```

- [ ] **Step 2: Update createStudent to push to cloud**

  Find the `createStudent` function and add a cloud push at the end, before `return student`:

  ```js
  export function createStudent(name, level) {
    const students = getStudents();
    const color = AVATAR_COLORS[students.length % AVATAR_COLORS.length];
    const student = { id: `stu-${Date.now()}`, name: name.trim(), level, color, createdAt: Date.now() };
    students.push(student);
    localStorage.setItem(STUDENTS_KEY, JSON.stringify(students));
    pushStudent(student).catch(() => {});  // async cloud push, non-blocking
    return student;
  }
  ```

- [ ] **Step 3: Update deleteStudent to delete from cloud**

  Find `deleteStudent` and add cloud delete:

  ```js
  export function deleteStudent(id) {
    localStorage.setItem(STUDENTS_KEY, JSON.stringify(getStudents().filter(s => s.id !== id)));
    localStorage.removeItem(PROGRESS_PREFIX + id);
    if (getActiveStudentId() === id) localStorage.removeItem(ACTIVE_KEY);
    deleteStudentCloud(id).catch(() => {});  // async cloud delete, non-blocking
  }
  ```

- [ ] **Step 4: Verify in browser**

  Create a new student. Check Supabase Dashboard → Table Editor → students. The new student should appear within a few seconds.

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/students.js
  git commit -m "feat: sync students to cloud on create/delete"
  ```

---

## Task 11: Sync Sessions to Cloud

**Files:**
- Modify: `src/lib/students.js`
- Modify: `src/components/scoreModal.js`

- [ ] **Step 1: Update addSession in students.js to push session**

  Add `pushSession` to the import line added in Task 10:

  ```js
  import { pushStudent, deleteStudentCloud, pushSession } from './cloud.js';
  ```

  Find `addSession` and add cloud push:

  ```js
  export function addSession(studentId, session) {
    const progress = getProgress(studentId);
    progress.sessions.unshift(session);
    progress.totalPoints = (progress.totalPoints || 0) + (session.pointsEarned || 0);
    saveProgress(studentId, progress);
    pushSession(session, studentId).catch(() => {});  // async cloud push
  }
  ```

- [ ] **Step 2: Verify in browser**

  Complete a reading session. Check Supabase Dashboard → progress_sessions. The session row should appear.

- [ ] **Step 3: Commit**

  ```bash
  git add src/lib/students.js
  git commit -m "feat: sync sessions to cloud on save"
  ```

---

## Task 12: Cloud Recording Upload

**Files:**
- Modify: `src/lib/storage.js`
- Modify: `src/components/recorder.js`

- [ ] **Step 1: Update saveRecording in storage.js to accept sessionId**

  The function signature needs `sessionId` added. Find `saveRecording` and update:

  ```js
  export async function saveRecording({ storyId, storyTitle, blob, mimeType, durationMs, sessionId }) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const store = tx(db, 'readwrite');
      const record = {
        storyId, storyTitle, blob, mimeType, durationMs,
        sessionId: sessionId ?? null,
        createdAt: Date.now(),
      };
      const req = store.add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  ```

- [ ] **Step 2: Add cloud upload trigger to storage.js**

  Add this import at the top of `storage.js`:

  ```js
  import { uploadRecording, updateSessionRecordingUrl } from './cloud.js';
  ```

  Add a new exported function below `saveRecording`:

  ```js
  /**
   * Save recording locally AND upload to cloud.
   * Returns the local IndexedDB id.
   */
  export async function saveAndUploadRecording({ storyId, storyTitle, blob, mimeType, durationMs, studentId, sessionId }) {
    // Always save locally first
    const localId = await saveRecording({ storyId, storyTitle, blob, mimeType, durationMs, sessionId });

    // Upload to cloud in background
    if (studentId && sessionId) {
      uploadRecording(blob, mimeType, studentId, sessionId)
        .then(url => {
          if (url) updateSessionRecordingUrl(sessionId, url);
        })
        .catch(() => {});
    }

    return localId;
  }
  ```

- [ ] **Step 3: Update recorder.js to use saveAndUploadRecording**

  In `recorder.js`, update the import at the top:

  ```js
  import { saveAndUploadRecording } from '../lib/storage.js';
  ```

  Update the `renderRecorder` function signature to accept `getActiveStudent`:

  ```js
  export function renderRecorder({ root, getCurrentStory, getActiveStudent, onSaved, onActiveChange, onComplete }) {
  ```

  Inside `recorder.onstop`, replace the `saveRecording` call:

  ```js
  recorder.onstop = async () => {
    try { recognition?.stop(); } catch {}
    recognition = null;
    const story = getCurrentStory?.();
    const student = getActiveStudent?.();
    const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
    const durationMs = Date.now() - startedAt;
    const sessionId = `sess-${Date.now()}`;  // provisional ID for recording upload
    try {
      await saveAndUploadRecording({
        storyId: story?.id,
        storyTitle: story?.title,
        blob,
        mimeType: blob.type,
        durationMs,
        studentId: student?.id ?? null,
        sessionId,
      });
      onSaved?.();
    } catch (err) { console.warn('Save failed:', err.message); }

    stopStream();
    overlay = null;
    indicator.style.visibility = 'hidden';
    startBtn.disabled = false; stopBtn.disabled = true;
    nextBtn.disabled = true; nextBtn.hidden = true;
    onActiveChange?.(false);
    onComplete?.({ transcript, story, sessionId });
  };
  ```

- [ ] **Step 4: Update app.js to pass getActiveStudent and forward sessionId**

  In `app.js`, update the `renderRecorder` call:

  ```js
  renderRecorder({
    root: els.recorder,
    getCurrentStory: () => activeStory,
    getActiveStudent: () => getActiveStudent(),
    onSaved: () => renderRecordingsList({ root: els.recordings }),
    onActiveChange: (active) => timerCtl.setActive(active),
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

- [ ] **Step 5: Verify in browser**

  Complete a recording session. Check Supabase Dashboard → Storage → recordings. A `.webm` file should appear under `{family_id}/{student_id}/`.

- [ ] **Step 6: Commit**

  ```bash
  git add src/lib/storage.js src/components/recorder.js src/app.js
  git commit -m "feat: upload recordings to supabase storage after each session"
  ```

---

## Task 13: API Key Cloud Migration

**Files:**
- Modify: `src/components/settings.js`
- Modify: `src/components/storyGenerator.js`
- Modify: `src/components/scoreModal.js`

- [ ] **Step 1: Update settings.js to save key to cloud**

  Replace the entire file:

  ```js
  // Settings modal — configure Anthropic API key stored in cloud (falls back to localStorage).

  import { saveApiKeyCloud, getApiKeyCloud } from '../lib/cloud.js';
  import { isAuthenticated } from '../lib/supabase.js';

  const API_KEY_STORAGE = 'anthropicApiKey';

  export function getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE) || '';
  }

  export function renderSettingsButton({ root }) {
    const btn = document.createElement('button');
    btn.className = 'secondary settings-btn';
    btn.title = 'Settings';
    btn.innerHTML = '⚙️';
    btn.addEventListener('click', openSettingsModal);
    root.appendChild(btn);
  }

  function openSettingsModal() {
    const existing = getApiKey();
    const hasKey = existing.length > 0;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true">
        <h2 class="modal-title">⚙️ Settings</h2>

        <div class="settings-section">
          <div class="settings-section-title">Anthropic API Key</div>
          <p class="modal-hint">Used for AI reading feedback and story generation. Saved to your family account — works on all your devices.</p>
          <div class="settings-key-row">
            <input class="modal-input settings-key-input" id="settings-key"
              type="password" placeholder="sk-ant-…"
              value="${existing}" autocomplete="off" />
            <button class="secondary settings-show-btn" id="settings-show" title="Show/hide key">👁</button>
          </div>
          <div class="settings-key-status" id="settings-status">
            ${hasKey
              ? `<span style="color:var(--good)">✓ API key configured</span>`
              : `<span style="color:var(--muted)">No key set — AI feedback and story generation unavailable</span>`}
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">About</div>
          <p class="modal-hint">
            每日华文阅读 · Daily Chinese Reading<br>
            Aligned with Singapore MOE PSLE Chinese curriculum (P1–P6).
          </p>
        </div>

        <div class="modal-error" id="settings-error" hidden></div>
        <div class="modal-actions">
          <button class="secondary" id="settings-clear">Clear Key</button>
          <button class="secondary" id="settings-cancel">Cancel</button>
          <button class="primary" id="settings-save">Save</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const keyEl = overlay.querySelector('#settings-key');
    const statusEl = overlay.querySelector('#settings-status');
    const showBtn = overlay.querySelector('#settings-show');
    const errorEl = overlay.querySelector('#settings-error');

    showBtn.addEventListener('click', () => {
      keyEl.type = keyEl.type === 'password' ? 'text' : 'password';
    });

    keyEl.addEventListener('input', () => {
      statusEl.innerHTML = keyEl.value.trim()
        ? `<span style="color:var(--accent)">Key entered — click Save to apply</span>`
        : `<span style="color:var(--muted)">No key set</span>`;
      errorEl.hidden = true;
    });

    function close() {
      document.removeEventListener('keydown', handleEsc);
      overlay.remove();
    }
    function handleEsc(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', handleEsc);

    overlay.querySelector('#settings-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('#settings-clear').addEventListener('click', () => {
      localStorage.removeItem(API_KEY_STORAGE);
      saveApiKeyCloud(null).catch(() => {});
      keyEl.value = '';
      statusEl.innerHTML = `<span style="color:var(--muted)">Key cleared</span>`;
    });

    overlay.querySelector('#settings-save').addEventListener('click', async () => {
      const key = keyEl.value.trim();
      if (key && !key.startsWith('sk-ant-')) {
        errorEl.textContent = "That doesn't look like an Anthropic API key (should start with sk-ant-).";
        errorEl.hidden = false;
        return;
      }
      const saveBtn = overlay.querySelector('#settings-save');
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';

      if (key) {
        localStorage.setItem(API_KEY_STORAGE, key);
        const authed = await isAuthenticated();
        if (authed) {
          const ok = await saveApiKeyCloud(key);
          statusEl.innerHTML = ok
            ? `<span style="color:var(--good)">✓ API key saved to family account</span>`
            : `<span style="color:var(--good)">✓ API key saved locally</span>`;
        } else {
          statusEl.innerHTML = `<span style="color:var(--good)">✓ API key saved locally</span>`;
        }
      } else {
        localStorage.removeItem(API_KEY_STORAGE);
        await saveApiKeyCloud(null).catch(() => {});
      }
      errorEl.hidden = true;
      saveBtn.disabled = false; saveBtn.textContent = 'Save';
      setTimeout(close, 700);
    });

    setTimeout(() => keyEl.focus(), 50);
  }
  ```

- [ ] **Step 2: Update storyGenerator.js to use Edge Function proxy**

  In `storyGenerator.js`, update the `callClaudeAPI` function to use the Edge Function when authenticated:

  Add import at the top:
  ```js
  import { isAuthenticated, supabase } from '../lib/supabase.js';
  ```

  Replace the `callClaudeAPI` fetch call (the `fetch("https://api.anthropic.com/v1/messages", ...)` block) with:

  ```js
  async function callClaudeAPI(apiKey, level, theme) {
    // ... (keep existing prompt construction code) ...

    const authed = await isAuthenticated();
    let res;

    if (authed) {
      // Use server-side proxy (API key stays server-side)
      const { data: { session } } = await supabase.auth.getSession();
      res = await fetch('https://YOUR_PROJECT.supabase.co/functions/v1/generate-story', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
    } else {
      // Fallback: direct browser call (requires apiKey from localStorage)
      if (!apiKey) throw new Error('No API key configured. Please enter one in Settings.');
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
    }

    // ... (keep existing response parsing code unchanged) ...
  }
  ```

  Replace `YOUR_PROJECT` with your Supabase project reference.

- [ ] **Step 3: Update scoreModal.js API call similarly**

  In `scoreModal.js`, update `getAiFeedback` to use the proxy when authenticated:

  Add import at top:
  ```js
  import { isAuthenticated, supabase } from '../lib/supabase.js';
  ```

  Replace the `getAiFeedback` fetch call:

  ```js
  async function getAiFeedback(storyTitle, storyText, transcript, score) {
    const apiKey = localStorage.getItem('anthropicApiKey');
    const authed = await isAuthenticated();
    if (!authed && !apiKey) return null;

    const body = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 220,
      messages: [{ role: 'user', content: `A Singapore primary school student just read this Chinese story aloud.

Story: ${storyTitle}
Story text: ${storyText}
Speech recognition transcript: ${transcript || '(not captured)'}
Computed accuracy: ${score}/100

Write a SHORT, warm assessment for a young student. Return JSON only — no code fences:
{"feedback": "1-2 encouraging sentences in English", "tip": "one short specific improvement tip or empty string if score >= 85"}` }],
    };

    try {
      let res;
      if (authed) {
        const { data: { session } } = await supabase.auth.getSession();
        res = await fetch('https://YOUR_PROJECT.supabase.co/functions/v1/generate-story', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) return null;
      const data = await res.json();
      let text = data.content[0].text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      return JSON.parse(text);
    } catch { return null; }
  }
  ```

- [ ] **Step 4: On app start, pull API key from cloud into localStorage**

  In `src/app.js`, in the `init` function, after `await syncDown()`, add:

  ```js
  // Pull API key from cloud into localStorage for offline fallback
  getApiKeyCloud().then(key => {
    if (key) localStorage.setItem('anthropicApiKey', key);
  }).catch(() => {});
  ```

  Add the import at the top of `app.js`:
  ```js
  import { getApiKeyCloud } from './lib/cloud.js';
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/settings.js src/components/storyGenerator.js src/components/scoreModal.js src/app.js
  git commit -m "feat: API key stored in cloud, Anthropic calls proxied via edge function"
  ```

---

## Task 14: Mobile Sticky Record Button

**Files:**
- Modify: `styles.css`
- Modify: `src/components/recorder.js`

- [ ] **Step 1: Update styles.css — remove toolbar sticky, add recorder sticky**

  Find the `@media (max-width: 800px)` block containing `.reader-toolbar` (around line 757):

  ```css
  @media (max-width: 800px) {
    .reader-toolbar {
      position: sticky;
      bottom: env(safe-area-inset-bottom);
      z-index: 5;
      order: 99;
      margin-top: 8px;
      box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.08);
    }
    ...
  }
  ```

  Remove ONLY the `.reader-toolbar` rules inside that block (keep other rules in the block). The `.reader-toolbar` should become a regular non-sticky element on mobile:

  ```css
  @media (max-width: 800px) {
    /* reader-toolbar is NOT sticky on mobile — recorder bar takes that role */
    .reader-pane {
      display: flex;
      flex-direction: column;
    }
    .controls {
      flex-wrap: wrap;
      gap: 8px;
    }
    .speed-slider input {
      width: 80px;
    }
  }
  ```

  Then add the sticky recorder bar styles (append to the mobile media query or add a new one):

  ```css
  @media (max-width: 800px) {
    .recorder-sticky-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      bottom: env(safe-area-inset-bottom, 0px);
      z-index: 50;
      background: var(--surface);
      border-top: 1px solid var(--border);
      box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.10);
      padding: 10px 16px;
      display: flex;
      gap: 10px;
      align-items: center;
    }

    .recorder-sticky-bar button {
      flex: 1;
    }

    /* Push main content above the sticky bar */
    .app-main {
      padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
    }
  }

  @media (min-width: 801px) {
    .recorder-sticky-bar { display: none; }
  }
  ```

- [ ] **Step 2: Update recorder.js to add sticky bar elements**

  In `recorder.js`, after creating `startBtn` and `stopBtn`, create a sticky bar element:

  ```js
  // Sticky mobile bar — contains clones of start/stop for mobile sticky UX
  const stickyBar = document.createElement('div');
  stickyBar.className = 'recorder-sticky-bar';

  const stickyStart = document.createElement('button');
  stickyStart.className = 'primary';
  stickyStart.textContent = '🎬 开始录像 Record';

  const stickyStop = document.createElement('button');
  stickyStop.className = 'danger';
  stickyStop.textContent = '■ 停止 Stop & Score';
  stickyStop.disabled = true;

  stickyBar.appendChild(stickyStart);
  stickyBar.appendChild(stickyStop);
  document.body.appendChild(stickyBar);

  // Mirror start/stop state to sticky bar
  stickyStart.addEventListener('click', start);
  stickyStop.addEventListener('click', stop);
  ```

  Then in the `start` function, after `startBtn.disabled = true; stopBtn.disabled = false;`:
  ```js
  stickyStart.disabled = true; stickyStop.disabled = false;
  ```

  In `recorder.onstop`, after `startBtn.disabled = false; stopBtn.disabled = true;`:
  ```js
  stickyStart.disabled = false; stickyStop.disabled = true;
  ```

  Clean up the sticky bar when recorder section is destroyed (add to `stopStream`):
  ```js
  // Note: stickyBar lives on body; clean up on page unload only
  // (it's a single-page app, so this is fine)
  ```

- [ ] **Step 3: Test on mobile**

  Open the app on a mobile device or use Chrome DevTools device simulation (iPhone 12 Pro). Verify:
  - Story text is readable in the scrollable content area
  - Record/Stop buttons appear fixed at the bottom of the screen
  - Playback controls (Read button) scroll with content
  - No overlap between sticky bar and content at the bottom

- [ ] **Step 4: Commit**

  ```bash
  git add styles.css src/components/recorder.js
  git commit -m "feat: sticky record button on mobile"
  ```

---

## Task 15: Achievement Screen Redesign

**Files:**
- Modify: `src/components/scoreModal.js`
- Modify: `styles.css`

- [ ] **Step 1: Add badge definitions to scoreModal.js**

  Add this constant near the top of `scoreModal.js` after the imports:

  ```js
  const BADGES = [
    { id: 'first_pass',  icon: '🌟', label: 'First Pass',      check: (prog)         => prog.sessions.filter(s => s.passed).length >= 1 },
    { id: 'stories_5',  icon: '📚', label: '5 Stories',        check: (prog)         => new Set(prog.sessions.filter(s => s.passed).map(s => s.storyId)).size >= 5 },
    { id: 'perfect',    icon: '💯', label: 'Perfect Score',    check: (prog)         => prog.sessions.some(s => s.score >= 100) },
    { id: 'streak_7',   icon: '🔥', label: '7-Day Streak',     check: (prog, streak) => streak >= 7 },
    { id: 'streak_30',  icon: '🏆', label: '30-Day Streak',    check: (prog, streak) => streak >= 30 },
    { id: 'pts_100',    icon: '💎', label: '100 Points',        check: (prog)         => prog.totalPoints >= 100 },
    { id: 'pts_500',    icon: '👑', label: '500 Points',        check: (prog)         => prog.totalPoints >= 500 },
    { id: 'pts_1000',   icon: '🎯', label: '1000 Points',       check: (prog)         => prog.totalPoints >= 1000 },
  ];

  function getEarnedBadges(progress, streak) {
    return BADGES.filter(b => b.check(progress, streak)).map(b => b.id);
  }

  function animateCount(el, to, duration = 900) {
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(to * eased);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function spawnConfetti(container) {
    const GLYPHS = ['🎉', '⭐', '✨', '🌟', '💫', '🎊', '🏅'];
    for (let i = 0; i < 22; i++) {
      const p = document.createElement('span');
      p.className = 'confetti-particle';
      p.textContent = GLYPHS[i % GLYPHS.length];
      const angle = (i / 22) * 360;
      const dist = 120 + Math.random() * 120;
      const dx = Math.round(Math.cos((angle * Math.PI) / 180) * dist);
      const dy = Math.round(Math.sin((angle * Math.PI) / 180) * dist - 80);
      p.style.cssText = `--dx:${dx}px; --dy:${dy}px; animation-delay:${(i * 0.03).toFixed(2)}s`;
      container.appendChild(p);
    }
  }
  ```

- [ ] **Step 2: Rewrite openScoreModal**

  Replace the `openScoreModal` function body with the new animated version:

  ```js
  export function openScoreModal({ student, story, score, transcript, sessionId, onRetry, onDone }) {
    const passed = score >= 60;
    const today = todayIso();

    // Gamification context (before saving this session)
    const { getProgress } = await import('../lib/students.js').catch(() => ({}));
    const todayAttempts = getTodayAttempts(student.id, story.id);
    const wasFailedBefore = todayAttempts.some(s => !s.passed);
    const isRepeat = hasPassedStoryBefore(student.id, story.id);
    const alreadyCompletedToday = hasCompletedToday(student.id);
    const currentStreak = getStudentStreak(student.id);
    const streakDays = passed && !alreadyCompletedToday ? currentStreak + 1 : currentStreak;

    const { total: pointsEarned, breakdown } = calculatePoints({ score, isRepeat, wasFailedBefore, streakDays });

    // Capture badges BEFORE saving (to detect newly unlocked)
    const progressBefore = getProgress(student.id);
    const badgesBefore = new Set(getEarnedBadges(progressBefore, currentStreak));

    // Save session
    const session = {
      id: sessionId ?? `sess-${Date.now()}`,
      date: today,
      storyId: story.id,
      storyTitle: story.title,
      score,
      passed,
      pointsEarned,
      transcript: transcript || '',
      completedAt: Date.now(),
    };
    addSession(student.id, session);

    // Badges AFTER saving
    const progressAfter = getProgress(student.id);
    const newBadges = BADGES.filter(b =>
      !badgesBefore.has(b.id) && b.check(progressAfter, streakDays)
    );

    const ringColor = score >= 80 ? 'var(--good)' : score >= 60 ? 'var(--accent)' : 'var(--danger)';
    const scoreLabel = score >= 90 ? '优秀 Excellent! ⭐'
      : score >= 80 ? '很好 Great Job! 🎊'
      : score >= 60 ? '及格 Passed ✓'
      : '继续努力 Keep Trying! 💪';

    const CIRCUMFERENCE = 2 * Math.PI * 50;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay score-overlay-v2';
    overlay.innerHTML = `
      <div class="score-confetti-layer" id="score-confetti"></div>
      <div class="modal-card score-modal-v2" role="dialog" aria-modal="true">

        <div class="score-hero">
          <svg class="score-ring-svg" viewBox="0 0 120 120" aria-hidden="true">
            <circle class="score-ring-track" cx="60" cy="60" r="50"/>
            <circle class="score-ring-fill" id="score-ring-arc" cx="60" cy="60" r="50"
              style="stroke:${ringColor}; stroke-dasharray:${CIRCUMFERENCE.toFixed(1)}; stroke-dashoffset:${CIRCUMFERENCE.toFixed(1)}"/>
          </svg>
          <div class="score-hero-center">
            <span class="score-big-number" id="score-big-num">0</span>
            <span class="score-pct-label">/100</span>
          </div>
        </div>

        <div class="score-label-banner" style="color:${ringColor}" id="score-label-banner">${scoreLabel}</div>
        <div class="score-story-byline">${story.title} · ${student.name}</div>

        ${passed ? `
          <div class="score-pass-section">
            <div class="score-pts-big">+<span id="score-pts-counter">0</span> 💎</div>
            <div class="score-breakdown-list">
              ${breakdown.map((b, i) => `
                <div class="score-breakdown-row" style="animation-delay:${(1.2 + i * 0.12).toFixed(2)}s">
                  <span>${b.label}</span>
                  <span class="score-breakdown-pts">+${b.pts}</span>
                </div>`).join('')}
            </div>
            ${streakDays > 0 ? `
              <div class="score-streak-banner">
                <span class="score-streak-flame">🔥</span>
                <span>${streakDays}-day streak!</span>
              </div>` : ''}
            ${newBadges.length ? `
              <div class="score-new-badges">
                <div class="score-new-badges-title">🏅 Badge${newBadges.length > 1 ? 's' : ''} Unlocked!</div>
                ${newBadges.map(b => `
                  <div class="score-badge-unlock">
                    <span class="score-badge-icon">${b.icon}</span>
                    <span>${b.label}</span>
                  </div>`).join('')}
              </div>` : ''}
          </div>
        ` : `
          <div class="score-fail-section">
            <div class="score-fail-msg">Score at least <strong>60</strong> to complete today's reading.</div>
            <div class="score-fail-hint">Pass next time for a <strong>+25 perseverance bonus! 💪</strong></div>
          </div>
        `}

        <div class="score-feedback-area" id="score-feedback">
          <span class="score-feedback-loading">✨ Getting feedback…</span>
        </div>

        <div class="modal-actions">
          <button class="secondary" id="score-retry">🔄 Try Again</button>
          <button class="primary" id="score-done">Done ✓</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    // Animate score ring after a tick
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const arc = overlay.querySelector('#score-ring-arc');
        if (arc) arc.style.strokeDashoffset = (CIRCUMFERENCE * (1 - score / 100)).toFixed(1);
        animateCount(overlay.querySelector('#score-big-num'), score);
        if (passed) {
          setTimeout(() => animateCount(overlay.querySelector('#score-pts-counter'), pointsEarned), 800);
        }
        if (passed && score >= 60) {
          setTimeout(() => spawnConfetti(overlay.querySelector('#score-confetti')), 200);
        }
      });
    });

    function close() { overlay.remove(); }

    overlay.querySelector('#score-retry').addEventListener('click', () => { close(); onRetry?.(); });
    overlay.querySelector('#score-done').addEventListener('click', () => { close(); onDone?.(); });

    // AI Feedback
    const storyText = story.tokens.filter(t => t.pinyin).map(t => t.char).join('');
    const feedbackEl = overlay.querySelector('#score-feedback');
    getAiFeedback(story.title, storyText, transcript, score).then(result => {
      if (!overlay.isConnected) return;
      feedbackEl.innerHTML = result
        ? `<p class="score-feedback-text">✨ ${result.feedback}</p>` +
          (result.tip ? `<p class="score-feedback-tip">💡 ${result.tip}</p>` : '')
        : `<p class="score-feedback-text">${passed
            ? '🎉 Great job! Keep reading every day!'
            : '💪 Don\'t give up — practice makes perfect!'}</p>`;
    });
  }
  ```

  Note: Since `openScoreModal` uses `await import(...)` inside a non-async function, change it to be `async`:
  ```js
  export async function openScoreModal({ ... }) {
  ```
  And update `app.js` accordingly: `await openScoreModal(...)` or keep as fire-and-forget (the function already works either way since it renders synchronously and awaits internally).

  Actually, simplify: instead of dynamic import, just add `getProgress` to the existing import line at the top of `scoreModal.js`:
  ```js
  import {
    addSession, calculatePoints, getProgress,
    hasPassedStoryBefore, getTodayAttempts,
    hasCompletedToday, getStudentStreak,
  } from '../lib/students.js';
  ```
  And remove the `await import(...)` line. Make `openScoreModal` a regular (non-async) function again.

- [ ] **Step 3: Add CSS for the new score modal**

  Append to `styles.css`:

  ```css
  /* ---- Score modal v2 ---- */
  .score-overlay-v2 { z-index: 100; }

  .score-confetti-layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 101;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .confetti-particle {
    position: absolute;
    font-size: 26px;
    animation: confetti-fly 1.4s ease-out forwards;
    pointer-events: none;
  }

  @keyframes confetti-fly {
    0%   { transform: translate(0, 0) scale(1.2); opacity: 1; }
    100% { transform: translate(var(--dx), var(--dy)) scale(0.4); opacity: 0; }
  }

  .score-modal-v2 { max-width: 480px; padding: 28px 24px; }

  .score-hero {
    position: relative;
    display: flex;
    justify-content: center;
    margin-bottom: 4px;
  }

  .score-ring-svg { width: 160px; height: 160px; }

  .score-ring-track {
    fill: none;
    stroke: var(--border);
    stroke-width: 10;
  }

  .score-ring-fill {
    fill: none;
    stroke-width: 10;
    stroke-linecap: round;
    transform: rotate(-90deg);
    transform-origin: 60px 60px;
    transition: stroke-dashoffset 1.4s cubic-bezier(0.17, 0.67, 0.29, 1.05);
  }

  .score-hero-center {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    line-height: 1;
  }

  .score-big-number {
    display: block;
    font-size: 64px;
    font-weight: 900;
    line-height: 1;
  }

  .score-pct-label {
    font-size: 16px;
    color: var(--muted);
    font-weight: 600;
  }

  .score-label-banner {
    font-size: 26px;
    font-weight: 800;
    text-align: center;
    margin: 8px 0 2px;
    animation: pop-in 0.4s 1s both;
  }

  @keyframes pop-in {
    0%   { transform: scale(0.5); opacity: 0; }
    70%  { transform: scale(1.1); }
    100% { transform: scale(1);   opacity: 1; }
  }

  .score-story-byline {
    text-align: center;
    color: var(--muted);
    font-size: 14px;
    margin-bottom: 16px;
  }

  .score-pass-section { display: flex; flex-direction: column; gap: 10px; }

  .score-pts-big {
    font-size: 44px;
    font-weight: 900;
    text-align: center;
    color: var(--accent);
    animation: slide-up 0.4s 0.9s both;
  }

  @keyframes slide-up {
    from { transform: translateY(16px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }

  .score-breakdown-list { display: flex; flex-direction: column; gap: 4px; }

  .score-breakdown-row {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    padding: 6px 10px;
    background: var(--bg);
    border-radius: 8px;
    animation: slide-up 0.3s both;
    opacity: 0;
    animation-fill-mode: both;
  }

  .score-breakdown-pts { font-weight: 700; color: var(--accent); }

  .score-streak-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 20px;
    font-weight: 700;
    color: #e67700;
    background: #fff3bf;
    border-radius: 12px;
    padding: 10px;
  }

  .score-streak-flame { font-size: 28px; animation: flame-pulse 0.8s ease-in-out infinite alternate; }
  @keyframes flame-pulse {
    from { transform: scale(1);    }
    to   { transform: scale(1.25); }
  }

  .score-new-badges {
    background: linear-gradient(135deg, #fff9c4, #ffe066);
    border-radius: 12px;
    padding: 12px;
    animation: pop-in 0.4s 1.6s both;
  }
  .score-new-badges-title { font-weight: 700; font-size: 15px; margin-bottom: 8px; }
  .score-badge-unlock { display: flex; align-items: center; gap: 8px; font-size: 15px; margin-top: 4px; }
  .score-badge-icon { font-size: 24px; }

  .score-fail-section {
    background: var(--bg);
    border-radius: 12px;
    padding: 16px;
    text-align: center;
  }
  .score-fail-msg { font-size: 16px; margin-bottom: 6px; }
  .score-fail-hint { font-size: 14px; color: var(--muted); }

  .score-feedback-area {
    background: var(--bg);
    border-radius: 12px;
    padding: 12px 14px;
    font-size: 14px;
    min-height: 44px;
  }
  .score-feedback-loading { color: var(--muted); }
  .score-feedback-text, .score-feedback-tip { margin: 0 0 4px; }
  .score-feedback-tip { color: var(--muted); }
  ```

- [ ] **Step 4: Remove old score modal CSS**

  In `styles.css`, find and remove the old score modal block (the section starting with `/* ---- Score modal ---- */` and the old `.score-modal`, `.score-header`, `.score-ring`, etc. classes — approximately lines 435–551). The new classes above replace them entirely.

- [ ] **Step 5: Test in browser**

  Complete a reading session. Verify:
  - Score ring animates from 0 to score
  - Number counts up
  - Points animate in with stagger
  - Confetti fires on pass
  - Streak flame pulses if streak > 0
  - Badge unlocks show if newly earned
  - Fail state shows without confetti

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/scoreModal.js styles.css
  git commit -m "feat: animated achievement screen with confetti and badges"
  ```

---

## Task 16: Student Dashboard Redesign

**Files:**
- Modify: `src/components/studentDashboard.js`
- Modify: `styles.css`

- [ ] **Step 1: Rewrite openStudentDashboard**

  Replace the entire file content:

  ```js
  // Student dashboard — full stats, badge wall, activity grid, history.

  import {
    getProgress, getStudentStreak, getBestStreak,
    getActivityDays, deleteStudent, setActiveStudentId, getActiveStudentId,
  } from '../lib/students.js';

  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const BADGES = [
    { id: 'first_pass',  icon: '🌟', label: 'First Pass',      check: (prog, streak) => prog.sessions.filter(s => s.passed).length >= 1 },
    { id: 'stories_5',  icon: '📚', label: '5 Stories',        check: (prog)         => new Set(prog.sessions.filter(s => s.passed).map(s => s.storyId)).size >= 5 },
    { id: 'perfect',    icon: '💯', label: 'Perfect Score',    check: (prog)         => prog.sessions.some(s => s.score >= 100) },
    { id: 'streak_7',   icon: '🔥', label: '7-Day Streak',     check: (prog, streak) => streak >= 7 },
    { id: 'streak_30',  icon: '🏆', label: '30-Day Streak',    check: (prog, streak) => streak >= 30 },
    { id: 'pts_100',    icon: '💎', label: '100 Points',        check: (prog)         => prog.totalPoints >= 100 },
    { id: 'pts_500',    icon: '👑', label: '500 Points',        check: (prog)         => prog.totalPoints >= 500 },
    { id: 'pts_1000',   icon: '🎯', label: '1000 Points',       check: (prog)         => prog.totalPoints >= 1000 },
  ];

  function sgTime(ts) {
    return new Date(ts).toLocaleTimeString('en-SG', {
      timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: true,
    });
  }

  function fmtIsoDate(iso) {
    const [, m, d] = iso.split('-').map(Number);
    return `${d} ${MONTH_SHORT[m - 1]}`;
  }

  function scoreColor(score) {
    return score >= 80 ? 'var(--good)' : score >= 60 ? 'var(--accent)' : 'var(--danger)';
  }

  export function openStudentDashboard({ student, onDeleted, onClose }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay dash-overlay';

    const progress = getProgress(student.id);
    const sessions = progress.sessions;
    const totalPts = progress.totalPoints || 0;
    const streak = getStudentStreak(student.id);
    const bestStreak = getBestStreak(student.id);
    const passSessions = sessions.filter(s => s.passed);
    const avgScore = passSessions.length
      ? Math.round(passSessions.reduce((s, x) => s + x.score, 0) / passSessions.length)
      : 0;

    const joinedMonth = new Date(student.createdAt);
    const joinedStr = `${MONTH_SHORT[joinedMonth.getMonth()]} ${joinedMonth.getFullYear()}`;

    const MILESTONE = 500;
    const milestoneProgress = Math.min((totalPts % MILESTONE) / MILESTONE * 100, 100);
    const nextMilestone = Math.ceil((totalPts + 1) / MILESTONE) * MILESTONE;

    const earnedBadgeIds = new Set(
      BADGES.filter(b => b.check(progress, streak)).map(b => b.id)
    );

    overlay.innerHTML = `
      <div class="modal-card dash-card-v2" role="dialog" aria-modal="true">
        <!-- Header -->
        <div class="dash-header-v2">
          <div class="student-avatar dash-avatar-v2" style="background:${student.color}">
            ${student.name[0].toUpperCase()}
          </div>
          <div class="dash-header-info">
            <div class="dash-name-v2">${student.name}</div>
            <div class="dash-sub">${student.level} · Since ${joinedStr}</div>
          </div>
          <button class="dash-close" id="dash-close" aria-label="Close">✕</button>
        </div>

        <!-- Points hero -->
        <div class="dash-points-hero">
          <div class="dash-pts-number">${totalPts.toLocaleString()} 💎</div>
          <div class="dash-pts-label">Total Points</div>
          <div class="dash-progress-bar-wrap">
            <div class="dash-progress-bar" style="width:${milestoneProgress}%"></div>
          </div>
          <div class="dash-progress-label">${totalPts % MILESTONE} / ${MILESTONE} to next milestone</div>
        </div>

        <!-- Stat cards -->
        <div class="dash-stat-cards">
          <div class="dash-stat-card">
            <span class="dash-stat-card-val">🔥 ${streak}</span>
            <span class="dash-stat-card-lbl">Streak</span>
          </div>
          <div class="dash-stat-card">
            <span class="dash-stat-card-val">🏆 ${bestStreak}</span>
            <span class="dash-stat-card-lbl">Best Streak</span>
          </div>
          <div class="dash-stat-card">
            <span class="dash-stat-card-val">📖 ${sessions.length}</span>
            <span class="dash-stat-card-lbl">Sessions</span>
          </div>
          <div class="dash-stat-card">
            <span class="dash-stat-card-val">⭐ ${avgScore}</span>
            <span class="dash-stat-card-lbl">Avg Score</span>
          </div>
        </div>

        <!-- Badge wall -->
        <div class="dash-section-title">Badges</div>
        <div class="dash-badge-wall">
          ${BADGES.map(b => `
            <div class="dash-badge ${earnedBadgeIds.has(b.id) ? 'earned' : 'locked'}"
              title="${b.label}">
              <span class="dash-badge-icon">${b.icon}</span>
              <span class="dash-badge-label">${b.label}</span>
            </div>`).join('')}
        </div>

        <!-- Activity grid -->
        <div class="dash-section-title">Last 30 Days</div>
        <div class="dash-activity-grid" id="dash-grid"></div>
        <div class="dash-legend">
          <span class="dash-legend-dot" style="background:var(--good)"></span> Passed
          <span class="dash-legend-dot" style="background:#ffb300; margin-left:8px"></span> Attempted
          <span class="dash-legend-dot" style="background:var(--danger); opacity:0.35; margin-left:8px"></span> Missed
          <span class="dash-legend-dot" style="background:var(--border); margin-left:8px"></span> No reading
        </div>

        <!-- Reading history -->
        <div class="dash-history-wrap">
          <div class="dash-section-title">Reading History</div>
          <div class="dash-history" id="dash-history"></div>
        </div>

        <!-- Delete -->
        <div class="dash-footer">
          <button class="danger dash-delete-btn" id="dash-delete">🗑️ Delete Student</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    // Activity grid
    const grid = overlay.querySelector('#dash-grid');
    for (const day of getActivityDays(student.id, 30)) {
      const cell = document.createElement('div');
      cell.className = 'dash-day-cell';
      cell.title = `${fmtIsoDate(day.iso)}${day.bestScore ? ` · ${day.bestScore}` : ''}`;
      if (day.isToday && !day.passed) {
        cell.style.cssText = 'background:var(--accent-soft); border:2px solid var(--accent)';
      } else if (day.passed) {
        cell.style.background = 'var(--good)';
      } else if (day.attempted) {
        cell.style.background = '#ffb300';
      } else if (!day.isToday) {
        cell.style.cssText = 'background:var(--danger); opacity:0.35';
      } else {
        cell.style.background = 'var(--border)';
      }
      const num = document.createElement('span');
      num.className = 'dash-day-num';
      num.textContent = day.iso.split('-')[2].replace(/^0/, '');
      cell.appendChild(num);
      grid.appendChild(cell);
    }

    // Reading history
    const histEl = overlay.querySelector('#dash-history');
    if (!sessions.length) {
      histEl.innerHTML = `<p class="dash-empty">No reading sessions yet.</p>`;
    } else {
      for (const s of sessions.slice(0, 50)) {
        const row = document.createElement('div');
        row.className = 'dash-history-row';
        const timeStr = s.completedAt ? sgTime(s.completedAt) : '';
        row.innerHTML = `
          <span class="dash-hist-date">${fmtIsoDate(s.date)} ${timeStr}</span>
          <span class="dash-hist-story">${s.storyTitle || s.storyId}</span>
          <span class="dash-hist-score" style="color:${scoreColor(s.score)}">${s.score}</span>
          <span class="dash-hist-pass">${s.passed ? '✓' : '✗'}</span>
          <span class="dash-hist-pts">${s.passed ? `+${s.pointsEarned}💎` : '—'}</span>`;
        histEl.appendChild(row);
      }
    }

    function close() {
      document.removeEventListener('keydown', handleEsc);
      overlay.remove();
      onClose?.();
    }
    function handleEsc(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', handleEsc);
    overlay.querySelector('#dash-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const deleteBtn = overlay.querySelector('#dash-delete');
    let confirmPending = false;
    deleteBtn.addEventListener('click', () => {
      if (!confirmPending) {
        confirmPending = true;
        deleteBtn.textContent = '⚠️ Tap again to confirm delete';
        deleteBtn.style.background = '#c00';
        setTimeout(() => {
          confirmPending = false;
          deleteBtn.textContent = '🗑️ Delete Student';
          deleteBtn.style.background = '';
        }, 3000);
        return;
      }
      if (getActiveStudentId() === student.id) setActiveStudentId(null);
      deleteStudent(student.id);
      close();
      onDeleted?.();
    });
  }
  ```

- [ ] **Step 2: Add CSS for dashboard v2**

  Append to `styles.css`:

  ```css
  /* ---- Dashboard v2 ---- */
  .dash-card-v2 {
    max-width: 560px;
    width: 100%;
    max-height: 92vh;
    overflow-y: auto;
    padding: 0;
  }

  .dash-header-v2 {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 20px 20px 16px;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    background: var(--surface);
    z-index: 1;
  }

  .dash-avatar-v2 {
    width: 52px; height: 52px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 24px; font-weight: 700; color: white;
    flex-shrink: 0;
  }

  .dash-name-v2 { font-size: 22px; font-weight: 800; }

  .dash-points-hero {
    background: linear-gradient(135deg, var(--accent), #ae3ec9);
    color: white;
    padding: 20px;
    text-align: center;
  }

  .dash-pts-number { font-size: 48px; font-weight: 900; line-height: 1.1; }
  .dash-pts-label { font-size: 14px; opacity: 0.85; margin-bottom: 12px; }

  .dash-progress-bar-wrap {
    background: rgba(255,255,255,0.25);
    border-radius: 999px;
    height: 10px;
    overflow: hidden;
    margin-bottom: 4px;
  }
  .dash-progress-bar {
    height: 100%;
    background: white;
    border-radius: 999px;
    transition: width 1s ease-out;
  }
  .dash-progress-label { font-size: 12px; opacity: 0.8; }

  .dash-stat-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    padding: 16px;
  }

  @media (max-width: 480px) {
    .dash-stat-cards { grid-template-columns: repeat(2, 1fr); }
  }

  .dash-stat-card {
    background: var(--bg);
    border-radius: 12px;
    padding: 14px 10px;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    text-align: center;
  }
  .dash-stat-card-val { font-size: 22px; font-weight: 800; }
  .dash-stat-card-lbl { font-size: 12px; color: var(--muted); font-weight: 600; }

  /* Badge wall */
  .dash-badge-wall {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    padding: 0 16px 16px;
  }

  @media (max-width: 400px) {
    .dash-badge-wall { grid-template-columns: repeat(3, 1fr); }
  }

  .dash-badge {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 10px 6px;
    border-radius: 12px;
    text-align: center;
    font-size: 11px;
    font-weight: 600;
  }
  .dash-badge.earned {
    background: #fff9c4;
    border: 2px solid #ffe066;
  }
  .dash-badge.locked {
    background: var(--bg);
    border: 2px solid var(--border);
    opacity: 0.45;
    filter: grayscale(0.6);
  }
  .dash-badge-icon { font-size: 26px; }
  .dash-badge-label { line-height: 1.2; }

  .dash-section-title {
    font-size: 13px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--muted);
    padding: 0 16px 8px;
  }
  ```

  Remove the old dash CSS from `styles.css` (find the section with `.dash-card`, `.dash-header`, `.dash-stats`, `.dash-stat` etc. and remove those old rules — the new `.dash-card-v2` rules above replace them. Keep `.dash-activity-grid`, `.dash-day-cell`, `.dash-day-num`, `.dash-legend`, `.dash-history*`, `.dash-footer`, `.dash-empty`, `.dash-close` — those are reused).

- [ ] **Step 3: Test in browser**

  Click on a student avatar to open the dashboard. Verify:
  - Big points hero with gradient
  - Progress bar toward next 500-pt milestone
  - 4 stat cards
  - 8 badges (unlocked = yellow, locked = grey)
  - Activity grid
  - Reading history

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/studentDashboard.js styles.css
  git commit -m "feat: student dashboard redesign with badge wall and points hero"
  ```

---

## Task 17: Bulk Story Generation Script

**Files:**
- Create: `scripts/generate-stories.mjs`
- Modify: `stories/index.json`

- [ ] **Step 1: Create the script**

  ```js
  // scripts/generate-stories.mjs
  // Run: ANTHROPIC_API_KEY=sk-ant-... node scripts/generate-stories.mjs
  // Generates 4 stories per level (P1-P6) = 24 stories, saves to stories/ dir.

  import fs from 'fs';
  import path from 'path';
  import { fileURLToPath } from 'url';

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const STORIES_DIR = path.join(__dirname, '../stories');
  const INDEX_PATH = path.join(STORIES_DIR, 'index.json');

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }

  const CHAR_RANGES = { P1: '40–60', P2: '60–90', P3: '90–130', P4: '120–170', P5: '160–220', P6: '200–280' };

  const PLAN = [
    { level: 'P1', theme: '家人',     slug: 'jiaren'       },
    { level: 'P1', theme: '动物',     slug: 'dongwu'       },
    { level: 'P1', theme: '学校',     slug: 'xuexiao'      },
    { level: 'P1', theme: '节日',     slug: 'jieri'        },
    { level: 'P2', theme: '友谊',     slug: 'youyi'        },
    { level: 'P2', theme: '自然',     slug: 'ziran'        },
    { level: 'P2', theme: '帮助别人', slug: 'bangzhu'      },
    { level: 'P2', theme: '好习惯',   slug: 'xiguan'       },
    { level: 'P3', theme: '环境保护', slug: 'huanjing'     },
    { level: 'P3', theme: '社区助人', slug: 'shequ'        },
    { level: 'P3', theme: '运动健康', slug: 'yundong'      },
    { level: 'P3', theme: '节约用水', slug: 'jieyue'       },
    { level: 'P4', theme: '坚持不懈', slug: 'jianchi'      },
    { level: 'P4', theme: '传统文化', slug: 'chuantong'    },
    { level: 'P4', theme: '科技生活', slug: 'keji'         },
    { level: 'P4', theme: '爱心服务', slug: 'aixin'        },
    { level: 'P5', theme: '历史故事', slug: 'lishi'        },
    { level: 'P5', theme: '品德修养', slug: 'pinde'        },
    { level: 'P5', theme: '环球视野', slug: 'huanqiu'      },
    { level: 'P5', theme: '逆境自强', slug: 'nijing'       },
    { level: 'P6', theme: '民族和谐', slug: 'minzu'        },
    { level: 'P6', theme: '社会责任', slug: 'zeren'        },
    { level: 'P6', theme: '科学探索', slug: 'kexue'        },
    { level: 'P6', theme: '生命价值', slug: 'shengming'    },
  ];

  async function generateStory(level, theme) {
    const charCount = CHAR_RANGES[level];
    const levelNum = level.slice(1);
    const prompt = `Generate a short Chinese reading story for Singapore Primary ${levelNum} (${level}) students following MOE PSLE Chinese curriculum standards.

Theme / topic: ${theme}

Story length: approximately ${charCount} Chinese characters (not counting punctuation).

Return ONLY a valid JSON object — no markdown, no code fences, no explanation:
{
  "id": "gen-${level.toLowerCase()}-[3-4 syllable pinyin title slug]",
  "title": "[Chinese title, 2–6 characters]",
  "level": "${level}",
  "estMinutes": 3,
  "tags": ["tag1", "tag2"],
  "tokens": [
    {"char": "每", "pinyin": "měi"},
    {"char": "天", "pinyin": "tiān"},
    {"char": "，", "pinyin": ""}
  ]
}

CRITICAL RULES:
1. Each token is exactly ONE Chinese character OR one punctuation mark.
2. Pinyin MUST use Unicode tone diacritics (not numbers).
3. Punctuation tokens (。！？，：；""''—…《》) have empty pinyin: "".
4. Structural particles: 的→"de" 地→"de" 得→"de" 了→"le" 着→"zhe" 过→"guo" 吗→"ma" 呢→"ne" 吧→"ba"
5. Story must be age-appropriate and aligned with Singapore PSLE ${level} vocabulary.
6. End the story with 。`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API ${res.status}`);
    }

    const data = await res.json();
    let text = data.content[0].text.trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const story = JSON.parse(text);

    if (!story.tokens || !Array.isArray(story.tokens) || !story.title) {
      throw new Error('Invalid story format');
    }
    // Validate at least 80% of CJK tokens have pinyin
    const cjk = story.tokens.filter(t => /[\u4e00-\u9fff]/.test(t.char));
    const withPinyin = cjk.filter(t => t.pinyin && t.pinyin.length > 0);
    if (withPinyin.length / cjk.length < 0.8) {
      throw new Error(`Too many tokens missing pinyin (${withPinyin.length}/${cjk.length})`);
    }

    return story;
  }

  async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function main() {
    const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    const existingIds = new Set(index.map(s => s.id));
    let generated = 0;

    for (const { level, theme, slug } of PLAN) {
      const candidateId = `${level.toLowerCase()}-${slug}`;
      if (existingIds.has(candidateId)) {
        console.log(`  SKIP  ${candidateId} (already exists)`);
        continue;
      }

      process.stdout.write(`  GEN   ${level} ${theme} ... `);
      try {
        const story = await generateStory(level, theme);
        story.id = candidateId;

        const filePath = path.join(STORIES_DIR, `${candidateId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(story, null, 2), 'utf8');

        index.push({ id: story.id, title: story.title, level: story.level, estMinutes: story.estMinutes, tags: story.tags });
        existingIds.add(story.id);
        generated++;
        console.log(`✓ "${story.title}" (${story.tokens.filter(t => t.pinyin).length} chars)`);
      } catch (err) {
        console.log(`✗ ${err.message}`);
      }

      await sleep(1200); // Rate limit buffer
    }

    // Sort index: originals first, then by level, then alphabetically
    index.sort((a, b) => {
      const lvl = ['P1','P2','P3','P4','P5','P6'].indexOf(a.level) - ['P1','P2','P3','P4','P5','P6'].indexOf(b.level);
      if (lvl !== 0) return lvl;
      return a.id.localeCompare(b.id);
    });

    fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n', 'utf8');
    console.log(`\nDone. Generated ${generated} new stories. Total: ${index.length}`);
  }

  main().catch(err => { console.error(err); process.exit(1); });
  ```

- [ ] **Step 2: Run the script**

  ```bash
  cd "/Users/wengleong/Claude Workspace/chinese-reading"
  ANTHROPIC_API_KEY=sk-ant-YOUR_KEY node scripts/generate-stories.mjs
  ```

  Expected output (24 lines like):
  ```
    GEN   P1 家人 ... ✓ "快乐的家" (52 chars)
    GEN   P1 动物 ... ✓ "小猫的朋友" (48 chars)
    ...
  Done. Generated 24 new stories. Total: 28
  ```

- [ ] **Step 3: Verify stories are valid**

  ```bash
  node --input-type=module <<'EOF'
  import fs from 'fs';
  const index = JSON.parse(fs.readFileSync('stories/index.json', 'utf8'));
  console.log('Total stories:', index.length);
  for (const s of index) {
    const file = `stories/${s.id}.json`;
    if (!fs.existsSync(file)) { console.error('MISSING:', file); continue; }
    const story = JSON.parse(fs.readFileSync(file, 'utf8'));
    const cjk = story.tokens.filter(t => /[\u4e00-\u9fff]/.test(t.char));
    const ok = cjk.filter(t => t.pinyin).length;
    if (ok / cjk.length < 0.9) console.warn(`LOW PINYIN: ${s.id} (${ok}/${cjk.length})`);
  }
  console.log('Validation complete');
  EOF
  ```

  Expected: `Total stories: 28` and `Validation complete` with no warnings.

- [ ] **Step 4: Commit**

  ```bash
  git add stories/ scripts/generate-stories.mjs
  git commit -m "feat: add 24 new stories (P1-P6) and generation script"
  ```

---

## Task 18: Push to GitHub Pages

- [ ] **Step 1: Final check — verify no console errors in browser**

  Open the app (`python3 -m http.server 8080`). Check DevTools console. Expect no errors.

- [ ] **Step 2: Push to main**

  ```bash
  git push origin main
  ```

  GitHub Actions will deploy to GitHub Pages automatically (CI defined in `.github/workflows/pages.yml`).

- [ ] **Step 3: Verify live site**

  Visit the GitHub Pages URL. Verify:
  - App loads and shows onboarding on first visit
  - Can create a family and get a code
  - Can join with the code on a second browser tab (use incognito)
  - Stories load — 28 stories in the picker
  - Record a reading → score modal shows with animation
  - Student dashboard opens with badge wall
  - On mobile: sticky record button at bottom

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Cloud persistence (sessions, scores, recordings) — Tasks 10–12
- ✅ Family code auth in-app — Tasks 5–9
- ✅ API key stored server-side — Task 13
- ✅ Mobile sticky record button — Task 14
- ✅ Animated achievement screen — Task 15
- ✅ Student dashboard redesign — Task 16
- ✅ Bulk story generation — Task 17
- ✅ GitHub Pages hosting unchanged — static files only, Task 18

**Dependency order:**
- Task 1 (Supabase setup) → must complete before Tasks 2–9
- Task 3 (supabase.js) + Task 4 (cloud.js) → must complete before Tasks 10–13
- Tasks 5–7 (Edge Functions) → must deploy before Task 9 (app boot) and Task 13 (API proxy)
- Tasks 14–17 are fully independent of each other and of the cloud tasks
- Task 18 (deploy) → last

**Replace `YOUR_PROJECT` sentinel:** Search the codebase after Task 8 for all occurrences of `YOUR_PROJECT`, `YOUR_SUPABASE_URL`, `YOUR_SUPABASE_ANON_KEY` and replace with real values before testing.
