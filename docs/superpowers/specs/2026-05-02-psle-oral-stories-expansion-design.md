# PSLE Oral Stories Expansion & Picture Oral Redesign

**Date:** 2026-05-02
**Status:** Approved

---

## Goal

Expand story content across all three tagged types (Challenge, Exam, Picture) using PSLE thematic topics, and redesign the picture oral format to mirror the real PSLE oral exam: a 2-part flow where the student first describes a scene, then answers 3 AI-selected questions one at a time.

---

## Part 1: Story Content Expansion

### Quantities

| Type | Current | Target | New to add |
|---|---|---|---|
| Challenge | 12 (2/level P1–P6) | 18 (3/level P1–P6) | 6 |
| Exam (past-years thematic) | 4 (1 each P3–P6) | 12 (2/level P1–P6) | 8 |
| Picture | 4 (1 each P3–P6) | 12 (2/level P1–P6) | 8 |

### PSLE Thematic Topics

Stories are grounded in Singapore Ministry of Education oral exam topic pool:

- 爱护环境 / Environment & sustainability
- 社区与和谐 / Community & harmony
- 科技与生活 / Technology & daily life
- 健康生活 / Health & wellness
- 新加坡精神 / Singapore identity & national values
- 家庭与亲情 / Family & relationships
- 学习与成长 / Education & personal growth
- 助人为乐 / Kindness & civic duty
- 文化传统 / Cultural heritage
- 时间管理与责任 / Responsibility & time management

### Existing picture stories to update

All 4 existing picture stories (`p3-pic-gongyuan`, `p4-pic-caichang`, `p5-pic-ditie`, `p6-pic-yisaihui`) must be updated to add a `questions` array (5–7 items each).

### Picture story JSON schema (updated)

```json
{
  "id": "p3-pic-gongyuan",
  "type": "picture",
  "title": "公园里的一天",
  "level": "P3",
  "estMinutes": 3,
  "tags": ["picture", "community"],
  "scene": "一个阳光明媚的下午，公园里热闹极了。",
  "sceneParts": [
    { "emoji": "🌳", "label": "大树" },
    ...
  ],
  "keyElements": ["公园", "老人", ...],
  "questions": [
    "你平时喜欢去公园做什么活动？",
    "图片里的老人和小孩在做什么？你觉得他们心情怎样？",
    "公园对社区的居民有什么好处？",
    "如果你是公园的设计师，你会增加什么设施？为什么？",
    "你认为我们应该怎样爱护公园的环境？"
  ]
}
```

### Challenge and Exam story JSON schema

Same as existing — no `questions` field, no `type` field (type is inferred from tags). Generated via `scripts/add-pinyin.mjs`.

---

## Part 2: Picture Oral Multi-Part Flow

### Overview

The picture oral becomes a 4-phase interaction:

```
Phase 0 — Describe scene
  Student sees: emoji scene card + "请描述以下图片的内容："
  Student records description
  → On complete: AI picks 3 questions from story.questions based on transcript
  → Transition to Phase 1

Phase 1–3 — Answer questions (one at a time)
  Student sees: question text + counter (第1题 共3题 / 第2题 共3题 / 第3题 共3题)
  Student records answer
  → On complete of Phase 3: score all responses

After Phase 3 — Score
  All transcripts (description + 3 answers) sent together to AI for scoring
  → Show score modal
```

### State machine

`app.js` owns the phase counter. State stored in a local `pictureOralState` object:

```js
{
  phase: 0,                    // 0 = description, 1/2/3 = question index
  questions: [],               // 3 questions selected by AI after phase 0
  transcripts: [],             // accumulated transcripts [description, a1, a2, a3]
  durationMs: [],              // per-phase durations
}
```

When `story.type === 'picture'`, `onComplete` drives the state machine:
- Phase 0 → call `selectQuestions()` → advance phase, update `pictureReader` with question text → re-arm recorder
- Phase 1, 2 → accumulate transcript, advance phase, update `pictureReader` → re-arm recorder
- Phase 3 → accumulate transcript → call `scorePicture()` with all transcripts → `openScoreModal()`

### `selectQuestions({ story, descriptionTranscript })`

New function in `src/lib/pictureScorer.js`. Calls Claude Haiku:

```
Given this picture description by a student and 5-7 pre-written questions,
choose exactly 3 questions most relevant to what the student said.
Return JSON: { "selected": [index, index, index] }
```

Falls back to first 3 questions if AI call fails.

### `scorePicture({ story, transcripts, durations })`

Updated signature. `transcripts` is an array: `[description, answer1, answer2, answer3]`.

Scoring prompt sends all 4 responses together to Claude Haiku and asks for:

```json
{
  "content_score": <0-100>,
  "language_score": <0-100>,
  "expression_score": <0-100>,
  "feedback": "<1-2 sentences encouraging feedback in English>"
}
```

| Category | Weight | Measurement |
|---|---|---|
| 内容 Content | 40% | AI `content_score`: key elements in description + answer relevance |
| 语言 Language | 40% | AI `language_score`: vocabulary, grammar, sentence variety |
| 表达 Expression | 20% | AI `expression_score`: fluency, confidence — informed by total duration |

`overall = round(content*0.4 + language*0.4 + expression*0.2)`. Pass: overall ≥ 60.

### `pictureReader.js` — phase display

`renderPictureReader` gets an optional `phase` and `questionText` parameter.

- Phase 0: existing scene card + "请描述以下图片的内容："
- Phase 1–3: same scene card (smaller, above the fold) + question counter + question text in a card

```
┌──────────────────────────────┐
│  [Scene emojis — compact]    │
│  第1题 共3题                  │
│  ┌────────────────────────┐  │
│  │ 你平时喜欢去公园做      │  │
│  │ 什么活动？              │  │
│  └────────────────────────┘  │
│  🎙️ [Record your answer]    │
└──────────────────────────────┘
```

The return value adds a `setPhase(phase, questionText)` method so `app.js` can update the display without re-rendering the full component.

### Recorder re-arming

The recorder currently expects one `onComplete` callback per story pick. For multi-phase picture oral, `app.js` calls a new `rearmRecorder()` method exposed by the recorder component. This resets the recorder UI to its initial "press record" state without full re-render.

---

## File Map

### Modified files

| File | Change |
|---|---|
| `stories/index.json` | Add 22 new entries |
| `stories/p3-pic-gongyuan.json` + 3 others | Add `questions` array |
| `src/lib/pictureScorer.js` | Add `selectQuestions()`, update `scorePicture()` signature (breaking: `transcript` → `transcripts[]`, `durationMs` → `durations[]`) |
| `src/components/pictureReader.js` | Add `setPhase()` method, question card UI |
| `src/components/recorder.js` | Expose `rearm()` method |
| `src/app.js` | Phase state machine for picture oral |
| `src/components/scoreModal.js` | Update picture cat3 label from "节奏 Pace" → "表达 Expression" |
| `styles.css` | Question card styles |

### New story files (22)

**Challenge (6 new, 1 more per level):**
- `p1-challenge-shijian.json` — time management
- `p2-challenge-wenhua.json` — cultural heritage
- `p3-challenge-jiankang.json` — healthy living
- `p4-challenge-zeren.json` — responsibility
- `p5-challenge-chuangxin.json` — innovation
- `p6-challenge-weilai.json` — future & ambition

**Exam / past-years thematic (8 new, target 2/level P1–P6):**
- `p1-past-qinlao.json` — diligence
- `p2-past-chengshi.json` — honesty
- `p3-past-yundong.json` — sports & health
- `p4-past-keji.json` — technology in life
- `p5-past-zhiyuan.json` — volunteering
- `p6-past-huanjing.json` — environment
- `p5-past-jiaoyu.json` — value of education
- `p6-past-minzu.json` — racial harmony

**Picture (8 new + questions on existing 4):**
- `p1-pic-jiaoshi.json` — classroom scene
- `p2-pic-caochang.json` — school sports day
- `p3-pic-tushuguan.json` — library
- `p4-pic-yiyuan.json` — hospital visit
- `p5-pic-huanbao.json` — recycling station
- `p6-pic-zhiyuan.json` — volunteer event
- `p5-pic-jiaotong.json` — road safety scene
- `p6-pic-keji.json` — tech/innovation scene

---

## Recorder `rearm()` API

The recorder component currently exposes nothing to the parent. Add:

```js
// renderRecorder returns:
return {
  rearm() {
    // Reset UI: hide recording indicators, show "Press record" state
    // Does NOT reset onComplete callback — that lives in app.js
  }
}
```

`app.js` stores the return value: `const recorderCtl = renderRecorder({...})`.

---

## Error handling

- `selectQuestions` fails → use first 3 questions from `story.questions` array
- Any phase's `scorePicture` call fails → return null → show alert "Unable to score — please try again"
- User navigates away mid-flow → phase state is cleared on next `pickStory()`

---

## Backward compatibility

- Existing picture stories without `questions` field: `selectQuestions` returns first 3 of empty array → falls back to 3 generic questions hardcoded in `pictureScorer.js`:
  ```
  ["你觉得图片里发生了什么事？", "图片里的人物心情怎样？", "你从这幅图片学到了什么？"]
  ```
- Existing sessions in localStorage have no `phase` or multi-transcript data — scoring is unchanged for old sessions.

---

## Out of scope

- Saving individual Q&A transcripts separately to the DB (session saves description + combined transcript string)
- Voice playback of questions (text display only)
- Skipping questions
