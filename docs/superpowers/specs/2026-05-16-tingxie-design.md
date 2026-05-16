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
- **7-day revision strip** — one cell per day from today to exam, showing session type (practice/mock/exam) and score if done
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
- Prompt extracts: exam title, exam date (if present), word list with per-word type (听写 / 默写) inferred from section headers
- Pinyin generated server-side via `pinyin-pro`
- Returns structured JSON: `{ title, examDate, words: [{ hanzi, pinyin, type, sentence? }] }`

**Confirmation screen:** Parent reviews extracted list before saving
- Editable exam title and date
- Each word shown with hanzi, pinyin, and 听写/默写 toggle
- Delete individual words, add missing words manually
- One-tap confirm → `POST /api/tingxie/exams`

**Auto-schedule generation:** On exam creation, backend computes the revision schedule from creation date to exam date:
- Early days (>5 days out): spaced repetition — all words day 1, then focus on weak words
- Middle days (3–5 days out): weak words + full-set review
- Day before exam: full mock
- Exam day: no scheduled session
- **Edge case — 1 day out:** schedule is just one full practice session today
- **Edge case — same day as exam:** no schedule generated; show "好好加油！Good luck today!" message with option to do a quick practice anyway

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
| schedule | JSONB | computed array of `{ date, mode, wordIndices[] }` |
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
- `GET /api/tingxie/exams?studentId=` — list exams
- `POST /api/tingxie/exams` — create exam
- `DELETE /api/tingxie/exams/:id`
- `POST /api/tingxie/extract` — Claude Vision paper extraction
- `POST /api/tingxie/sessions` — save completed session
- `GET /api/tingxie/sessions?examId=` — session history
- `POST /api/tingxie/grade` — Claude Vision OCR grading for a single character image; body includes `{ studentId, hanzi, imageB64 }` so the backend can fetch this student's past confirmed-correct examples for few-shot context

---

## 5. Writing Interface (Canvas + Claude Vision OCR)

**Touch-only:** On non-touch devices, show an error message: "听写练习需要触屏设备 — Please use a phone or tablet."

**Canvas component:** One square per character in the word
- 米字格 guide lines (horizontal, vertical, inner square) in light gray
- Freehand touch drawing, black strokes on white
- Clear button per character
- Submit button sends each canvas as a PNG (base64) to `POST /api/tingxie/grade`

**Grading:** Claude Vision receives the canvas image + the correct character. Returns:
- `{ read: string, correct: boolean, tip?: string }`
- `tip` is only returned when wrong — a specific visual hint about the difference (e.g. "你写的是'己'，正确答案是'已' — 注意最后一笔")

---

## 6. Practice Mode

**Presentation:**
- Word is shown upfront (hanzi + pinyin + meaning) — copy practice, not a guessing test
- 听写 words also play via TTS (existing Chinese Web Speech API)
- 默写 words: character flashes on screen for 3 seconds then hides; TTS does not play

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

**Retake:** Student can retake a mock at any time. Best score per exam per day counts for badges/leaderboard.

---

## 8. AI Handwriting Learning Loop

Each practice session stores the drawn canvas image (base64, compressed) alongside the grading result in `tingxie_sessions.results[].imageB64`.

When grading a mock exam attempt, the `POST /api/tingxie/grade` prompt includes:
- 2–3 examples of this student's previously confirmed-correct drawings of similar characters (fetched from past sessions)
- Presented as few-shot images: "Here is how this student writes [char] correctly: [image]"

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
| Comeback Kid | 💪 | Failed a mock, then passed the next mock for same exam |
| Word Master | 🧠 | Master 50 total words across all exams |
| Prepared | 📅 | Complete the full revision schedule before any exam |
| Perfect Week | ⭐ | Practice every day for 7 days |
| Tingxie Champion | 🏆 | Pass 5 mock exams with score ≥90% |

### Points and badge integration with localStorage
Tingxie session data lives in the cloud DB. Points and badges use the existing `cr-progress` localStorage system. Bridge: after saving a tingxie session to the cloud, call a new `addTingxieSession()` function (analogous to existing `addSession()`) that writes a lightweight record into `cr-progress.sessions` with `storyType: 'tingxie'` and the computed `pointsEarned`. This lets existing badge checks and point totals work without modification.

### End-of-session summary
- Practice: word-by-word grid (green/red), wrong words flagged for next session
- Mock: score bar, pass/fail, wrong words looped to practice queue
- Confetti on passing mock (reuses existing confetti component)
- Badge unlock overlay if new badge earned (reuses existing badge celebration component)

---

## 10. Technical Constraints

- **Touch-only writing:** `navigator.maxTouchPoints > 0` check on session start; error shown on desktop
- **No localStorage for tingxie:** All data fetched from API on load, cached in component state only
- **Existing infrastructure reused:** Claude API proxy (`/api/generate` pattern), JWT auth, `pinyin-pro`, Web Speech API TTS, confetti, badge celebration overlay
- **New backend:** 2 DB tables, 6 API routes, 1 new Claude Vision grading route
- **New frontend:** Tingxie section is a new rendering mode inside `app.js` (same SPA), not a new HTML page
- **Canvas images:** Compressed to 80×80px PNG before storing — keeps JSONB storage manageable

---

## Out of Scope

- Stroke order validation (not graded in real Singapore tingxie)
- Parent notifications / push reminders (future phase)
- Leaderboards between students (future phase)
- Audio recording of teacher reading (TTS is sufficient)
- Offline-first for tingxie (requires network for AI grading)
