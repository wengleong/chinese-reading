# Chinese Reading App — Cloud Upgrade Design (v2)
*2026-04-28 · Revised: Railway backend, audio-only recording*

## Scope

1. **Cloud persistence** — sessions, scores, and audio recordings sync to the cloud
2. **Family code auth** — memorable code (e.g. `TIGER-2310`) created/entered in-app
3. **API key in the cloud** — stored server-side; Anthropic calls proxied so key never touches the browser
4. **Audio-only recording** — drop video/camera; mic-only recording. Story text on screen is the teleprompter. Simpler, smaller files, better mobile UX.
5. **Mobile sticky record button** — Record/Stop fixed at bottom on mobile so kids can scroll the story and tap record
6. **Bigger, more exciting achievement screen** — animated score ring, confetti, point counter, streak flame, badges
7. **Bulk story library** — 24 new stories (4 per level, P1–P6) committed to repo

GitHub Pages static hosting stays. No Supabase.

---

## Architecture

### Backend: Express on Railway

New service `chinese-reading/api/` — Node.js + Express + Railway PostgreSQL.

```
POST /api/families             create family → returns { code, token }
POST /api/families/join        join with code → returns { token }
PUT  /api/families/apikey      save Anthropic API key (auth)

GET    /api/students           list (auth)
POST   /api/students           create (auth)
DELETE /api/students/:id       delete (auth)

POST   /api/sessions           save session (auth)
GET    /api/sessions           list all for family (auth)

POST   /api/recordings         upload audio blob (auth) → returns id
GET    /api/recordings         list metadata (auth)
GET    /api/recordings/:id     stream audio (auth)

POST   /api/generate           proxy Anthropic (auth)
```

### Auth: JWT

- On create/join: server returns a JWT (`{ familyId }`, 1-year expiry, signed with `JWT_SECRET` env var)
- Client stores token in `localStorage` as `cr-token`
- All API calls: `Authorization: Bearer {token}`
- Server middleware verifies and extracts `familyId`

### Database: Railway PostgreSQL

```sql
families (id uuid, code text unique, anthropic_key text, created_at)
students (id text, family_id uuid, name, level, color, created_at)
progress_sessions (id text, student_id text, family_id uuid,
  story_id, story_title, date, score, passed, points_earned,
  transcript, completed_at)
recordings (id uuid, session_id text, student_id text, family_id uuid,
  audio_data bytea, mime_type text, duration_ms int, created_at)
```

Audio files stored as `bytea` in PostgreSQL. At ~500KB per reading × 3 kids × 365 days ≈ 550MB/year — well within Railway's PostgreSQL limits.

### Sync Strategy

Same as before — `localStorage` is the primary read cache:
- **On write**: write localStorage first (synchronous), then fire async API call
- **On login**: pull cloud data, merge into localStorage by ID
- **Audio recordings**: saved to IndexedDB locally, uploaded to server; playback uses local copy first, falls back to server fetch

---

## Audio Recorder Redesign

### What's removed
- Camera stream, canvas compositing, Overlay class, Star particles
- `roundRect` polyfill, `captureStream()`

### What replaces it
- `getUserMedia({ audio: true })` only
- `MediaRecorder` on the audio stream
- UI: pulsing red dot + duration timer + Start/Stop buttons
- SpeechRecognition still runs alongside (for transcript/scoring)
- On mobile: Start/Stop buttons are sticky at bottom; story text scrolls freely above

### Playback
- `<audio controls>` instead of `<video>`
- Src: blob URL created from IndexedDB audio data (or fetched from server on new device)

---

## Achievement Screen

**Score Modal:**
- Animated SVG score ring (stroke-dasharray CSS transition)
- Large score number counts up (rAF animation)
- CSS confetti burst on pass (emoji particles fly outward)
- Points counter animates up; breakdown rows stagger in
- Streak flame with CSS pulse animation
- Badge unlock reveal for newly earned badges

**Badges:** first pass, 5 stories, perfect score, 7-day streak, 30-day streak, 100/500/1000 pts

**Student Dashboard:**
- Points hero section (large number + gradient background + milestone progress bar)
- 4 stat cards (streak, best streak, sessions, avg score)
- Badge wall (8 badges, locked = grey/faded, earned = gold)
- Existing 30-day activity grid + history (unchanged)

---

## Mobile Sticky Record Button

- Remove `position: sticky` from `.reader-toolbar` on mobile (playback/Read button scrolls with content)
- `div.recorder-sticky-bar`: `position: fixed; bottom: 0` on mobile — contains Start/Stop buttons only
- `main` gets `padding-bottom: 80px` on mobile to avoid overlap

---

## Bulk Story Generation

Script `scripts/generate-stories.mjs` — 4 stories × 6 levels = 24 new stories. Themes: family, animals, school, festivals (P1), friendship, nature, helping others, habits (P2), environment, community, sports, conservation (P3), perseverance, culture, technology, kindness (P4), history, values, global awareness, resilience (P5), harmony, responsibility, science, life purpose (P6).

---

## API Service File Structure

```
chinese-reading/api/
├── src/
│   ├── index.js          Express app + routes wiring
│   ├── db.js             pg Pool singleton
│   ├── auth.js           JWT middleware + helpers
│   └── routes/
│       ├── families.js   /api/families
│       ├── students.js   /api/students
│       ├── sessions.js   /api/sessions
│       ├── recordings.js /api/recordings
│       └── generate.js   /api/generate
├── migrations/
│   └── 001_initial.sql
├── package.json
├── Dockerfile
└── .env.example
```

---

## Frontend File Changes

| File | Change |
|------|--------|
| `src/lib/api.js` | New: thin fetch wrapper with Bearer token |
| `src/lib/cloud.js` | New: sync helpers using api.js |
| `src/components/familyOnboarding.js` | New: create/join family UI |
| `src/app.js` | Boot: check token, show onboarding if needed |
| `src/lib/students.js` | Push to cloud on create/delete/addSession |
| `src/lib/storage.js` | Upload audio on save |
| `src/components/recorder.js` | **Full rewrite**: audio-only, sticky mobile bar |
| `src/components/recordingsList.js` | Audio player instead of video |
| `src/components/scoreModal.js` | Animated redesign + badges |
| `src/components/studentDashboard.js` | Points hero + badge wall |
| `src/components/settings.js` | Save API key to cloud |
| `src/components/storyGenerator.js` | Use /api/generate proxy |
| `stories/index.json` | 28 stories total |
| `styles.css` | Mobile sticky, score animations, dashboard |

---

## What's NOT Changing

- GitHub Pages static hosting
- Story JSON format
- PWA / service worker
- Student data model (IDs, progress structure)
- Speech recognition scoring logic
