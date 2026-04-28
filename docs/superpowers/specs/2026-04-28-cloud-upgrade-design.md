# Chinese Reading App — Cloud Upgrade Design
*2026-04-28*

## Scope

Five improvements in one release:

1. **Cloud persistence** — sessions, scores, and recordings sync to the cloud so data survives device changes
2. **Family code auth** — short memorable code (e.g. `TIGER-2847`) created and entered in-app; each family has multiple students
3. **API key in the cloud** — Anthropic key stored server-side per family; Anthropic calls proxied via Edge Function so the key never touches the browser again
4. **Mobile sticky record button** — Record/Stop button fixed at bottom of screen on mobile so kids can read the story and tap record without scrolling
5. **Bigger, more exciting achievement screen** — animated confetti, large score ring, animated point counter, streak flame, badges
6. **Bulk story library** — 24 new stories (4 per level P1–P6) generated and committed to repo

GitHub Pages static hosting stays as-is. No new server.

---

## Architecture

### Backend: Supabase

- **Auth**: Supabase `signInWithPassword` — family code maps to a generated email/password pair stored by an Edge Function
- **Database**: Supabase Postgres — families, students, progress_sessions
- **Storage**: Supabase Storage bucket `recordings` — path `{family_id}/{student_id}/{timestamp}.webm`
- **Edge Functions**:
  - `create-family` — generates code + Supabase auth user, returns code
  - `join-family` — given code, returns auth credentials so client can sign in
  - `generate-story` — proxies Anthropic API call using family's stored API key

### Supabase JS SDK

Added via CDN `<script type="module">` import (no bundler needed). Single `src/lib/supabase.js` wraps the client instance.

---

## Database Schema

```sql
-- families: one per family, keyed by human-readable code
create table families (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,          -- e.g. "TIGER-2847"
  anthropic_key text,                  -- stored encrypted by Supabase
  created_at timestamptz default now()
);

-- students: multiple per family
create table students (
  id text primary key,                 -- reuse existing "stu-{timestamp}" IDs
  family_id uuid references families not null,
  name text not null,
  level text not null,
  color text not null,
  created_at timestamptz default now()
);

-- progress_sessions: one row per reading attempt
create table progress_sessions (
  id text primary key,                 -- "sess-{timestamp}"
  student_id text references students not null,
  family_id uuid references families not null,  -- for fast RLS
  story_id text not null,
  story_title text not null,
  date text not null,                  -- "YYYY-MM-DD" in SG time
  score integer not null,
  passed boolean not null,
  points_earned integer not null default 0,
  transcript text,
  recording_url text,                  -- Supabase Storage public URL
  completed_at bigint,                 -- Unix ms
  created_at timestamptz default now()
);
```

### Row Level Security

All tables: `auth.uid() = family_id` (or via student FK).
Anonymous + unauthenticated access: denied.

---

## Family Code Auth Flow

### Create Family (first-time setup)
1. User opens app with no family → "Welcome" screen shown
2. Taps "Create Family" → enters family name (optional)
3. Frontend calls Edge Function `create-family`
4. Edge Function:
   - Generates code: `{ANIMAL}-{4 digits}` (e.g. `TIGER-2847`)
   - Generates a strong password
   - Creates Supabase auth user: email=`{code}@cr.app`, password=generated
   - Inserts into `families` table
   - Returns `{code, email, password}`
5. Frontend calls `supabase.auth.signInWithPassword(email, password)` → session established
6. Code is displayed prominently with copy button: "Save this code! You'll need it on other devices."
7. Session (email+password) stored in localStorage for auto-restore

### Join on New Device
1. App opens → detects no session → shows "Enter Family Code"
2. User types code → frontend calls Edge Function `join-family` with code
3. Edge Function looks up family → returns `{email, password}` (protected by Supabase service role)
4. Frontend signs in → data syncs

### Session Persistence
- Supabase session tokens stored in localStorage (handled by SDK automatically)
- On app start: `supabase.auth.getSession()` → if valid, restore silently
- If expired: show family code entry

---

## Sync Strategy

### Offline-first with write-through cache

- `localStorage` remains the **primary read source** — app works fully offline
- Every write also fires an async cloud upsert (no await, silent failure)
- On first login / new device: pull all family data from cloud → populate localStorage

### `src/lib/cloud.js` (new module)

```js
// Thin wrapper — every function is a no-op if not authenticated
export async function syncDown()       // Pull students + sessions → localStorage
export async function pushStudent(s)   // Upsert student row
export async function pushSession(s, studentId)  // Upsert session row
export async function uploadRecording(blob, mimeType, studentId, sessionId)  // → URL
export async function saveApiKey(key)  // Upsert into families.anthropic_key
export async function getApiKey()      // Fetch from families.anthropic_key
```

### Recording Upload

- Triggered in `recorder.js` immediately after `saveRecording()` succeeds
- Uploads blob to Supabase Storage: `{family_id}/{student_id}/{Date.now()}.webm`
- On success: updates `progress_sessions.recording_url` in Postgres
- On failure: silently logged; local IndexedDB copy is the fallback

---

## API Key Changes

- `settings.js`: "Save key to your family account" instead of "Save in browser"
- `storyGenerator.js` + `scoreModal.js`: call Edge Function `generate-story` instead of direct Anthropic fetch
- API key never sent to browser after initial save
- If no cloud session: fallback to `localStorage` key (backwards compat during transition)

---

## Mobile: Sticky Record Button

**Problem**: On mobile, the read button (playback controls) is sticky/fixed, but kids need to scroll through the story text while recording — the record/stop button disappears off-screen.

**Fix**:
- `@media (max-width: 768px)`:
  - Remove `position: sticky` / `position: fixed` from `.reader-toolbar` (playback controls)
  - `.recorder-sticky` wrapper: `position: fixed; bottom: 0; left: 0; right: 0; z-index: 100; background: var(--surface); border-top: 1px solid var(--border); padding: 12px 16px`
  - Only the Start/Stop record buttons are in the sticky bar on mobile; the full recorder canvas stays in the normal flow above
  - `main` gets `padding-bottom: 80px` on mobile to avoid overlap
- On desktop: no change — recorder stays inline as before

Implementation: wrap `startBtn` + `stopBtn` in a `div.recorder-sticky` in `recorder.js`; CSS handles mobile-only sticky behaviour.

---

## Achievement Screen Redesign

### Score Modal (`scoreModal.js`)

**Current**: Small modal, plain score ring, flat points list.

**New**:
- Full-screen overlay (not just centered card) for celebration impact
- **Animated score ring**: SVG circle with `stroke-dasharray` animation counting up from 0 to score %
- **Score number**: large (80px), animates counting up
- **Pass banner**: for score ≥ 60, full-width gradient banner (`优秀！⭐` / `很好！` / `及格 ✓`) with CSS confetti particle burst (20 emoji particles flung in arcs using CSS keyframe animations)
- **Points block**: total points in large text (`+165 💎`), breakdown rows animate in with stagger delay
- **Streak flame**: if streak ≥ 1, pulsing 🔥 animation with streak count
- **Badge unlocks**: first-pass badge, 7-day streak badge, 100-point milestone — shown if newly earned this session
- Fail state: encouraging, no confetti — just clear "Score 60+ to pass" message with retry CTA

### Student Dashboard (`studentDashboard.js`)

**Current**: Compact modal with small stat boxes.

**New**:
- Full-height sliding panel (mobile: slides up from bottom; desktop: wide modal)
- **Hero stat**: total points displayed large (64px) with a progress bar toward next milestone (every 500 pts)
- **Stat cards**: streak, best streak, sessions, avg score — larger cards with colour coding
- **Badge wall**: trophy icons for unlocked achievements (first pass, 7-day streak, 30-day streak, 1000 pts, etc.) — greyed out if not yet earned
- **Activity grid**: same 30-day grid but larger cells with score tooltip on tap
- **History**: unchanged

---

## Bulk Story Generation

Script: `scripts/generate-stories.mjs`

- Requires `ANTHROPIC_API_KEY` env var
- Generates 4 stories per level (P1–P6) = 24 stories
- Themes distributed across: family life, school, nature, friendship, festivals, community helpers, environment, moral values
- Each story generated sequentially with 1s delay between calls
- Output: `stories/{level-slug}-{theme-slug}.json`
- After generation: updates `stories/index.json`
- Validates pinyin diacritics and token format before saving
- Run: `node scripts/generate-stories.mjs`

Target library: 28 stories (4 original + 24 new).

---

## What's NOT Changing

- GitHub Pages static hosting
- Story JSON format (tokens array)
- PWA / service worker / install button
- Recording canvas + speech recognition logic
- Student data model (IDs, progress structure)

---

## File Changelist

### New files
- `src/lib/supabase.js` — Supabase client singleton
- `src/lib/cloud.js` — sync helpers
- `src/components/familyOnboarding.js` — create/join family UI
- `supabase/functions/create-family/index.ts`
- `supabase/functions/join-family/index.ts`
- `supabase/functions/generate-story/index.ts`
- `supabase/migrations/001_initial.sql`
- `scripts/generate-stories.mjs`

### Modified files
- `src/app.js` — boot: check session, show onboarding if needed; init cloud sync
- `src/lib/students.js` — `createStudent`, `addSession` call cloud push after localStorage write
- `src/lib/storage.js` — `saveRecording` triggers cloud upload
- `src/components/recorder.js` — sticky mobile wrapper; pass session ID to storage
- `src/components/scoreModal.js` — full animated redesign
- `src/components/studentDashboard.js` — larger, badge wall, progress bar
- `src/components/settings.js` — save key to cloud; fall back to localStorage
- `src/components/storyGenerator.js` — call Edge Function proxy instead of direct Anthropic
- `index.html` — Supabase SDK script tag; family onboarding mount point
- `stories/index.json` — 28 stories
- `styles.css` — mobile sticky recorder, score modal animations, dashboard redesign

---

## Supabase Project Setup (manual steps, once)

1. Create Supabase project at supabase.com
2. Run `supabase/migrations/001_initial.sql`
3. Enable RLS on all tables
4. Create `recordings` storage bucket (public reads, auth writes)
5. Deploy 3 Edge Functions via Supabase CLI
6. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to `src/lib/supabase.js` (public values, safe to commit)
7. Add `ANTHROPIC_API_KEY` as Edge Function secret: `supabase secrets set ANTHROPIC_API_KEY=...`
