# 每日华文阅读 · Daily Chinese Reading

A browser-based daily reading app for primary school students (P3–P6).
Pick a Chinese story, listen to a read-along voice highlight each character,
optionally show Hanyu Pinyin, and record yourself reading aloud.

## Features

- **Read-along TTS** — Web Speech API speaks each character in `zh-CN` and
  highlights it in the page as it's read.
- **Hanyu Pinyin toggle** — show or hide pinyin above every character; the
  preference is remembered.
- **Speed control** — slow the voice down for harder words.
- **Camera + mic recorder** — record yourself reading and play back, download
  (`.webm`), or delete. Recordings are stored only in your browser
  (IndexedDB) and never uploaded.
- **10-minute daily timer + streak** — a small ring fills as the student
  reads/records; consecutive completed days count as a streak.
- **Story library** — 4 starter stories (one each at P3, P4, P5, P6). Add
  more with the author tool below.

## Run locally

No build step. Serve the folder over HTTP (the browser blocks `fetch()` for
JSON files when opened as `file://`):

```bash
# Python 3
python3 -m http.server 8000
# or Node
npx serve .
```

Then open `http://localhost:8000` in Chrome, Edge, or Safari. Allow camera +
microphone when prompted to use the recorder.

> Camera/mic access requires a secure context. `localhost` qualifies; if you
> deploy this, use HTTPS.

## Deploy to GitHub Pages

A workflow at `.github/workflows/pages.yml` deploys the site automatically
on every push to `main` (or `master`). One-time setup:

1. In GitHub: **Settings → Pages → Build and deployment → Source:
   GitHub Actions**.
2. Merge this branch to `main` (or push a commit there). The
   *Deploy to GitHub Pages* workflow will run.
3. The site appears at
   `https://<your-user>.github.io/<your-repo>/` — HTTPS is automatic, so
   camera/mic and the install button work out of the box.

## Mobile (phone / tablet)

The app is responsive and installable as a PWA on iOS and Android.

- On Android Chrome: an **⬇ Install** button appears in the header — tap to
  install. Recordings save as `.webm`.
- On iOS Safari: tap **Share → Add to Home Screen**. Recordings save as
  `.mp4` (the download button picks the right extension automatically).
- Works offline after the first visit (a service worker caches the app
  shell and bundled stories).
- Hosting: must be served over HTTPS for camera/mic to work. GitHub Pages
  (above) is the easiest option.

## Add a new story

The starter stories ship with hand-verified pinyin. To add more, use the
author script:

```bash
# 1. Install the offline pinyin tool (only needed once, for the author).
npm install --no-save pinyin-pro

# 2. Save your raw Chinese text to e.g. raw/new-story.txt

# 3. Generate the tokenized story JSON.
node scripts/add-pinyin.mjs raw/new-story.txt p4-new-story "新故事" P4 4 fable,animals \
  > stories/p4-new-story.json

# 4. Add an entry to stories/index.json.
```

> **Teacher review required.** `pinyin-pro` picks one reading for polyphone
> characters (多音字) and may be wrong in context. Always have a teacher
> proofread `tokens[].pinyin` before classroom use.

### Story file shape

```json
{
  "id": "p4-new-story",
  "title": "新故事",
  "level": "P4",
  "estMinutes": 4,
  "tags": ["fable"],
  "tokens": [
    { "char": "小", "pinyin": "xiǎo" },
    { "char": "猫", "pinyin": "māo" },
    { "char": "。", "pinyin": "" }
  ]
}
```

`tokens` is the unit of read-along highlighting. Punctuation gets an empty
`pinyin` and is skipped by the voice but still highlighted briefly.

## Privacy & child-safety notes

- Designed for under-12 users. **No accounts, no analytics, no network calls
  for student data.**
- Recordings are stored locally in the browser's IndexedDB only. They never
  leave the device unless the student/parent clicks **Download**.
- Camera + mic permission is requested only when the student presses
  **Start Recording**.
- Please ask a parent or teacher to review any recording before sharing.

## Project layout

```
index.html              # single-page shell
styles.css              # global styles + reader/recorder UI
sw.js                   # service worker (offline cache)
manifest.webmanifest    # PWA manifest
icons/                  # app icons (svg + PNG + apple-touch)
src/
  app.js                # entry point, wires components, registers SW
  components/           # storyPicker, storyReader, pinyinToggle,
                        # playbackControls, recorder, recordingsList,
                        # dailyTimer
  lib/                  # speech (TTS), storage (IndexedDB),
                        # progress (streak), stories (loader)
stories/
  index.json            # library catalogue
  p3-*.json … p6-*.json # individual stories with tokenized pinyin
scripts/
  add-pinyin.mjs        # author tool (Node; uses pinyin-pro offline)
.github/workflows/
  pages.yml             # auto-deploy to GitHub Pages on push to main
```

## Browser support

- Chrome / Edge — full support (recommended).
- Safari — works; voice quality varies by macOS/iOS version.
- Firefox — reading + pinyin work; TTS for `zh-CN` may be unavailable on
  some platforms.

## Future ideas (not yet implemented)

- AI-generated new stories (e.g. via Anthropic's Claude API).
- Teacher dashboard / class progress view.
- Cloud sync across devices.
