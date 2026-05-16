# Tingxie (听写) Feature Design
**Date:** 2026-05-16
**App:** chinese-reading
**Status:** Approved — ready for implementation planning

---

## Overview

A full dictation-practice system integrated into the existing Chinese reading app. Families upload school exam papers (photo or PDF), AI extracts the word list and exam date, and the app generates a spaced-repetition revision schedule with handwriting practice and mock exams. Touch-screen only (intentional — writing requires a touch device).

---

## 1. Navigation Restructure

The existing sidebar gets a **mode toggle** at the top — a pill switcher with two options:

- **📖🎤 阅读 & 口试** — current reading + oral stories (unchanged inside)
- **✍️ 听写** — new tingxie section

The toggle sits above the existing level tabs (P1–P6 / 口试). Switching modes swaps the entire sidebar content and main panel. The student panel (top bar with student selector, points, streak) persists across both modes.

The oral stories (picture/video) remain under the 阅读 & 口试 tab — they are the same category as reading.

---

## 2. Tingxie Home Screen

### Month calendar (default view)
- Full month calendar showing all exam dates (circled) and scheduled practice/mock days (coloured dots)
- Colour legend: orange = practice day, purple = mock day, red circle = exam date
- Month navigation (prev/next)
- Below calendar: **Upcoming exams list** — one chip per exam, colour-coded by proximity (orange = >5 days, purple = ≤5 days, red = ≤2 days)
- "+" button to upload a new exam paper

### Exam detail (drill-down)
Tap any exam chip → opens detail view:
- 3 stat pills: exam date, word count, days remaining
- **Revision strip** — one cell per day from today to exam date (capped at 14 cells; if exam is >14 days away, show first 7 days + "…" + exam day). Each cell shows session type (practice/mock/exam) and score if completed.
- **Weak words panel** — characters the student has gotten wrong, sorted by error frequency, colour-coded red (≥2 wrong) / orange (1 wrong)
- Two CTAs:
  - Primary: "Practice Today's N Weak Words →" (or "All N Words" on day 1)
  - Secondary: "Take Full Mock Exam" (always available, student can override schedule)
- Back button returns to calendar

---

## 3. Paper Upload & AI Extraction

**Entry point:** "+" button on tingxie home → upload screen

**Upload options:**
- "Take a photo" — opens camera (iOS/Android native)
- "Choose PDF" — file picker

**Backend route:** `POST /api/tingxie/extract` (multipart, same auth pattern as existing routes)
- Sends image/PDF to Claude Vision
- **PDF handling:** For PDFs, the backend renders all pages to images (using `pdf-to-img` or equivalent) and sends all page images to Claude Vision in a single multi-image message. Claude Vision accepts multiple images per call. If the PDF exceeds 5 pages, reject with a user-facing error: "PDF too long — please upload just the word list page."
- Prompt extracts: exam title, exam date (if present), word list with per-word type (听写 / 默写) inferred from section headers. **Hard cap: 30 words maximum.** If more than 30 are detected, include only the first 30 and flag with a warning.
- Pinyin generated server-side via `pinyin-pro` — **must be added to `api/package.json`** (currently absent)
- Returns structured JSON: `{ title, examDate, words: [{ hanzi, pinyin, type, sentence? }], warning? }`
- **Extraction failure:** If Claude Vision cannot identify any Chinese words (blurry image, wrong document, etc.), return `{ error: 'extraction_failed', message: '...' }`. Frontend shows: "We couldn't read the paper clearly — please try a clearer photo or enter words manually." Manual entry fallback opens an empty confirmation screen with an "Add word" button.

**Confirmation screen:** Parent reviews extracted list before saving
- Editable exam title and date
- Each word shown with hanzi, pinyin, and 听写/默写 toggle
- Delete individual words, add missing words manually
- One-tap confirm → `POST /api/tingxie/exams`

**Auto-schedule generation:** On exam creation, backend stores a fixed session-type calendar (dates + practice/mock labels). The `schedule` column stores `[{ date, mode }]` only — not word selections, since no session history exists yet.

The schedule structure:
- Early days (>5 days out): `mode: 'practice'` each day
- Middle days (3–5 days out): `mode: 'practice'` each day
- Day before exam: `mode: 'mock'`
- Exam day: no entry
- **Edge case — 1 day out:** one `mode: 'practice'` entry for today
- **Edge case — same day as exam:** no schedule; show "好好加油！Good luck today!" with option to do a quick practice anyway

**Word selection is computed dynamically at session start** — not stored in the schedule. The frontend fetches past session results for this exam, computes which words are weak (wrong ≥1 time), and applies the repetition rules (weak: 3×, new: 2×, mastered: 1×). This is what makes spaced repetition work — if word selection were stored at exam creation time there would be no session history to adapt from.

---

## 4. Data Model (Cloud — PostgreSQL)

All tingxie data stored in backend DB, scoped by family and student. No localStorage for tingxie data.

### `tingxie_exams`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| family_id | UUID | FK → families |
| student_id | UUID | FK → students |
| title | TEXT | e.g. "词语单元一" |
| exam_date | DATE | |
| words | JSONB | `[{ hanzi, pinyin, type, sentence? }]` |
| schedule | JSONB | computed array of `{ date, mode }` — dates and types only; word selection is dynamic |
| created_at | TIMESTAMPTZ | |

### `tingxie_sessions`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| exam_id | UUID | FK → tingxie_exams |
| student_id | UUID | FK → students |
| date | DATE | Singapore time |
| mode | TEXT | `'practice'` or `'mock'` |
| results | JSONB | `[{ hanzi, correct, attempts, imageB64? }]` |
| score | INTEGER | 0–100 (% correct) |
| passed | BOOLEAN | score ≥ 80 for mock |
| created_at | TIMESTAMPTZ | |

### API routes (new, JWT Bearer auth)
All routes verify JWT and scope to `req.familyId`. Routes that accept `examId` must join to `tingxie_exams` and assert `family_id = req.familyId` before returning data — no cross-family leakage.

- `GET /api/tingxie/exams?studentId=` — list exams for student (scoped to family)
- `POST /api/tingxie/exams` — create exam
- `PATCH /api/tingxie/exams/:id` — edit exam title, date, or word list after creation
- `DELETE /api/tingxie/exams/:id` — delete exam; `tingxie_sessions` rows cascade (`ON DELETE CASCADE`)
- `POST /api/tingxie/extract` — Claude Vision paper extraction (multipart)
- `POST /api/tingxie/sessions` — save completed session
- `GET /api/tingxie/sessions?examId=` — session history (verifies examId belongs to family)
- `POST /api/tingxie/grade` — Claude Vision OCR for single character (practice mode); body `{ studentId, hanzi, imageB64 }`; backend fetches up to 2 confirmed-correct past drawings of that exact character for few-shot context
- `POST /api/tingxie/grade-batch` — batch OCR for mock exam; body `{ studentId, items: [{ hanzi, imageB64 }] }`; returns `[{ hanzi, read, correct }]`; **does NOT use few-shot examples** (mock mode has no hints — grading is blind)

---

## 5. Writing Interface (Canvas + Claude Vision OCR)

**Touch-only:** On non-touch devices, show an error message: "听写练习需要触屏设备 — Please use a phone or tablet."

**Canvas component:** One square per character in the word
- 米字格 guide lines (horizontal, vertical, inner square) in light gray
- Freehand touch drawing, black strokes on white
- Clear button per character
- Submit button behaviour differs by mode (see below)

**Practice grading (immediate):** On submit, each character canvas sent to `POST /api/tingxie/grade` one at a time. Returns `{ read, correct, tip? }` immediately so the student sees instant feedback before moving to the next word.

**Mock grading (batch):** Canvases are collected in memory as the student progresses. After the final word is submitted, all images sent together to `POST /api/tingxie/grade-batch` — a single API call returning an array of results. This avoids 40 sequential round-trips for a 20-word exam. Body: `{ studentId, items: [{ hanzi, imageB64 }] }`. Returns `[{ hanzi, read, correct }]` (no tips in mock mode).

---

## 6. Practice Mode

**Presentation:**
- Word is shown upfront (hanzi + pinyin + meaning) — copy practice, not a guessing test
- 听写 words also play via TTS (existing Chinese Web Speech API)
- 默写 words: character flashes on screen then hides; TTS does not play. Flash duration = max(3s, word character count × 1.5s) — e.g. 2-char word = 3s, 4-char word = 6s

**Repetition logic:**
- Mastered words (correct 3× across sessions): appear 1× per session
- Weak words (wrong in last session): appear 3× per session
- New words: appear 2× per session
- Order randomised within session

**Per-attempt flow:**
1. Word displayed → student writes on canvas → submit
2. AI grades immediately
3. **Correct:** green confirmation, progress bar for that word's repetitions, points awarded (+3 💎), next rep or next word
4. **Wrong:** red, side-by-side comparison (what AI read vs correct), specific tip from Claude, retry immediately
5. Attempt image saved to `results[]` in session for handwriting profile

**Student override:** "Take mock exam instead" button always visible on session start screen.

---

## 7. Mock Exam Mode

**Presentation:** Same as practice (TTS for 听写, flash for 默写) but word is NOT shown — this is a real test.

**Rules:**
- One attempt per word — no retries during the exam
- No hints or AI tips during exam
- All words presented in random order
- After all words submitted → graded in batch

**Results screen:**
- Score (N/20, percentage, pass/fail at ≥80%)
- Word-by-word breakdown: green = correct, red = wrong with correct answer shown
- Wrong words automatically queued into next practice session (+2 repetitions each)
- Points awarded: +80 for passing, +40 for 90%+, +80 for 100%, +25 for improving on personal best

**Retake:** Student can retake a mock at any time. Points are awarded once per exam per day — best score for the day determines which tier bonus applies (same dedup as reading uses `computeTotalPoints`). If the student scores 85% in attempt 1 (+80pts) and 92% in attempt 2, the day's total is capped at the tier-2 award (120pts), not additive. Total per mock: pass(≥80%) = 120pts; 90–99% = 120pts; 100% = 160pts (pass + 100% bonus); +25pts if best score today beats personal best overall.

---

## 8. AI Handwriting Learning Loop

Each practice session stores the drawn canvas image (base64, compressed) alongside the grading result in `tingxie_sessions.results[].imageB64`.

When grading a mock exam attempt, the `POST /api/tingxie/grade` prompt includes:
- Up to 2 confirmed-correct drawings of **that exact character** by this student (fetched from past `tingxie_sessions.results` where `correct: true` and `hanzi === target`)
- Presented as few-shot images: "Here is how this student correctly writes [char]: [image1], [image2]"
- If no past correct drawings exist for that character, no few-shot context is included — Claude grades from the image alone

Effect: the more practice sessions a student completes, the better calibrated Claude's grading becomes to that student's specific handwriting style. This is in-context few-shot learning — no fine-tuning required.

Storage budget: images compressed to <10KB each (80×80px PNG). 1000 practice attempts ≈ 10MB per student — acceptable in JSONB.

---

## 9. Gamification

All tingxie points and badges integrate into the existing `cr-progress` system (same 💎 points, same badge wall in student dashboard).

### Points
| Action | Points |
|--------|--------|
| Complete a practice session | +20 💎 |
| Each correct word in practice | +3 💎 |
| Perfect practice session | +30 💎 |
| Master a word (correct 3× total) | +10 💎 |
| Pass mock exam (≥80%) | +80 💎 |
| Mock score 90–99% | +40 💎 bonus |
| Mock score 100% | +80 💎 bonus |
| Improve on last mock score | +25 💎 |
| Daily practice streak | ×streak multiplier (same as reading) |

### New Badges (8)
| Badge | Icon | Condition |
|-------|------|-----------|
| First Tingxie | ✍️ | Complete first practice session |
| Mock Ace | 🎯 | Score 100% in any mock exam |
| Streak Scholar | 🔥 | Practice 5 consecutive days before an exam |
| Comeback Kid | 💪 | Failed a mock (score <80%), then passed (≥80%) the very next mock session for the same exam — same-day retake counts |
| Word Master | 🧠 | Master 50 total words across all exams |
| Prepared | 📅 | Complete the full revision schedule before any exam |
| Perfect Week | ⭐ | Practice every day for 7 days |
| Tingxie Champion | 🏆 | Pass 5 mock exams with score ≥90% |

### Points and badge integration with localStorage
Tingxie session data lives in the cloud DB. Points and badges use the existing `cr-progress` localStorage system as a bridge — this is an **intentional exception** to the "no localStorage for tingxie" rule (Section 10); session data is cloud-authoritative, but the gamification bridge writes only a lightweight token.

`addTingxieSession()` writes into `cr-progress.sessions`:
```json
{ "storyId": "tingxie-{examId}", "storyType": "tingxie", "passed": true, "score": 90, "pointsEarned": 120, "date": "2026-05-16" }
```

**Double-counting guard — required changes to `src/lib/badges.js`:**
- All badge `check` functions that count reading stories (`stories_5`, `stories_15`, `stories_30`, `p3_master`…`p6_master`) must add `.filter(s => s.storyType !== 'tingxie')` before counting
- `perfect` badge checks `s.score >= 100` — must also filter `storyType !== 'tingxie'` so a 100% mock doesn't award the reading Perfect Score badge
- `computeTotalPoints` in `students.js` must partition: reading total = sessions where `storyType !== 'tingxie'`; tingxie total = sessions where `storyType === 'tingxie'`. The student panel shows a **combined** total (single 💎 number) but the reading-milestone badges (`pts_100`…`pts_5000`) count only reading points. Tingxie point milestone badges count only tingxie points.
- Tingxie badge `check` functions filter `storyType === 'tingxie'`

### End-of-session summary
- Practice: word-by-word grid (green/red), wrong words flagged for next session
- Mock: score bar, pass/fail, wrong words looped to practice queue
- Confetti on passing mock (reuses existing confetti component)
- Badge unlock overlay if new badge earned (reuses existing badge celebration component)

---

## 10. Technical Constraints

- **Touch-only writing:** `navigator.maxTouchPoints > 0` check on session start; error shown on desktop
- **No localStorage for tingxie session/exam data:** All exam and session data fetched from API on load, cached in component state only. The `cr-progress` localStorage bridge for gamification points/badges is the only intentional exception (see Section 9).
- **Mid-session navigation:** If the student closes the browser or navigates away mid-session, the session is lost and must be restarted. Practice sessions are short (8–20 words) so this is acceptable. A warning is shown when leaving a mock exam mid-way: "If you leave now your mock exam will not be saved."
- **Existing infrastructure reused:** Claude API proxy (`/api/generate` pattern), JWT auth, `pinyin-pro`, Web Speech API TTS, confetti, badge celebration overlay
- **New backend:** 2 DB tables, 6 API routes, 1 new Claude Vision grading route
- **New frontend:** Tingxie section is a new rendering mode inside `app.js` (same SPA), not a new HTML page
- **Canvas images:** Compressed to 80×80px PNG before storing — keeps JSONB storage manageable

---

## 11. Additional Behaviours

- **Exam date passed:** Exam cards remain visible for 7 days after the exam date (for parents to review scores), then auto-archived — hidden from the calendar but accessible via an "Archived" section below the exam list.
- **Not logged in:** Tingxie requires a family account (cloud storage). If the student switches to ✍️ 听写 mode without being logged in, show: "听写 requires a family account — please log in or sign up." with a button to open the family onboarding flow.
- **Canvas resolution:** The writing canvas renders at 240×240px display size but the exported PNG is 80×80px (downscaled before sending). This resolution has been validated as sufficient for Claude Vision to read handwritten CJK characters reliably.
- **`api/package.json` must add `pinyin-pro`** before any backend implementation begins.
- **`api/package.json` must add a PDF-to-image library** (e.g. `pdf-to-img`, which uses pdfjs-dist under the hood) for the multi-page PDF rendering step in `/api/tingxie/extract`.

## Out of Scope

- Stroke order validation (not graded in real Singapore tingxie)
- Parent notifications / push reminders (future phase)
- Leaderboards between students (future phase)
- Audio recording of teacher reading (TTS is sufficient)
- Offline-first for tingxie (requires network for AI grading)
