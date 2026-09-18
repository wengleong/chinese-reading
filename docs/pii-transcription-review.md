# PII data-flow review: server-side speech transcription

**Prepared for:** Compliance / Data Protection Officer review
**Prepared by:** Engineering (via AI-assisted drafting; requires human sign-off before implementation)
**Date:** 2026-09-18
**Status:** Awaiting approval

---

## 1. Purpose of this review

We are asking for approval to enable a **server-side speech-to-text (transcription) fallback** in the Chinese Reader / oral practice web app.

The change is required because the browser's own speech-recognition engine does not work on every device our students use (confirmed today on Linux Chrome; also affects Chromium forks, some non-Google Android tablets, older iOS Safari, and Firefox). On those devices the app currently cannot produce a transcript and therefore cannot score the read-aloud. A server-side fallback restores the feature on all supported browsers.

Because the change involves sending a **child's voice recording to an overseas third-party vendor**, it is a personal-data flow that must be reviewed under our PDPA obligations before it is built.

---

## 2. Data being processed

**Data class:** Voice audio recording of a minor student reading a preset passage aloud.

**Fields transmitted to the vendor:**

| Field | Description | PII sensitivity |
|---|---|---|
| Audio blob | Opus-encoded audio, ~10–30 seconds, ~40–200 KB | High — voice is biometric |
| Language hint | `zh-CN` or `en-SG` | None |

**Fields explicitly NOT transmitted:**

- Real name of the student
- NRIC / birth cert / passport number
- School, class, contact details, home address
- Family account holder details
- Any device identifier beyond what the browser sends by default (User-Agent header)

The student's real name and family details already exist in the app's database. They stay on our server and are **not** sent to the transcription vendor. Only an internal UUID is used to correlate the returned transcript back to the correct student on our side.

---

## 3. Data flow (step by step)

1. Child records themselves reading a passage in the app (existing behaviour, unchanged).
2. The audio is held in the browser's memory. A copy is also written to the browser's on-device storage for later playback (existing behaviour, unchanged).
3. The browser first attempts to transcribe the audio locally using the Web Speech API (existing behaviour).
4. **New:** if the local transcription returns nothing, the browser sends the audio to our own server (`POST /api/transcribe`) over HTTPS.
5. **New:** our server forwards the audio to **OpenAI's Whisper transcription API** (`https://api.openai.com/v1/audio/transcriptions`) over HTTPS, using our server-side `OPENAI_API_KEY`.
6. Whisper returns the transcribed text to our server.
7. Our server returns the text to the browser.
8. The browser uses the text to compute the read-aloud score (existing behaviour).

**Retention:**

- On the browser: audio stays in on-device storage (already the case).
- On our server: the blob is held in memory for the duration of the transcription call only, never written to disk or database.
- On OpenAI: see section 4 below.

---

## 4. Vendor: OpenAI Whisper

| Attribute | Value |
|---|---|
| Endpoint | `POST https://api.openai.com/v1/audio/transcriptions` |
| Transport | HTTPS (TLS 1.2+) |
| Processing location | US-based data centres |
| Standard retention | 30 days for abuse-monitoring, then deleted (per OpenAI API data usage policy, current as of Jan 2026) |
| Training use | Inputs are **not** used to train OpenAI models by default on the API |
| Zero-data-retention | Available on Enterprise plans or by request; recommended for this use case |
| Certifications | SOC 2 Type II. GDPR-eligible. No PDPA-specific certification. |
| DPA | Required — OpenAI publishes a standard Data Processing Addendum |

**Alternative vendors considered but not recommended for this use case:**

- Google Cloud Speech-to-Text — solid, but ~4× the cost and requires broader IAM setup.
- Deepgram, ElevenLabs Scribe — cheaper, but less well-attested for `zh-CN` accuracy on children's voices.

---

## 5. Legal basis (Singapore PDPA)

### 5.1 Personal data
A child's voice recording is personal data under the Personal Data Protection Act 2012 (PDPA). Voice is biometric and highly identifiable.

### 5.2 Consent (s.13–14)
Existing family onboarding consent must be updated to disclose:

- That the child's voice is captured for scoring.
- That the voice may be transmitted to a US-based transcription provider (OpenAI) on devices where local transcription is unavailable.
- The retention period at that provider.
- That parents may withdraw this consent, in which case the transcription fallback is disabled and read-aloud scoring becomes unavailable on affected devices.

### 5.3 Overseas transfer (s.26)
PDPA s.26 requires that overseas transferees provide a standard of protection comparable to PDPA. Steps to satisfy:

- Sign OpenAI's DPA.
- Prefer OpenAI's zero-data-retention configuration where available.

### 5.4 Purpose limitation (s.18)
The purpose is educational assessment (read-aloud fluency scoring). Data must not be repurposed. The API call is scoped to transcription only; no other OpenAI product is used with this data.

### 5.5 Access and correction (s.21, s.22)
Because our server retains no copy of the audio after the transcription call, we have no data to produce in response to an access request beyond what already exists in the app's database (recording remains in the browser only).

---

## 6. Legal basis (Malaysia PDPA 2010)

Similar requirements. Explicit consent, cross-border transfer needing consent or a qualifying condition, and data-user responsibility for processor safeguards. The same DPA + updated consent copy satisfies both jurisdictions.

---

## 7. Security controls

- HTTPS in both hops: browser → our server → OpenAI.
- `OPENAI_API_KEY` stored as a Railway environment secret; never exposed to the browser; never checked into the repository.
- No persistence of the audio on our server. In-memory forward only.
- Rate limit per family account to prevent abuse and cost run-away.
- Optional per-family monthly cost cap (circuit breaker) — recommended.

---

## 8. When the transcription call fires (not every recording)

The fallback runs **only when** the browser's own speech recognition returned zero results. Expected split across the current user base (rough estimate):

| Device / browser | Local transcription works | Server fallback fires |
|---|---|---|
| Android with Google Speech Services | Yes | No |
| iOS Safari 15+ | Yes | No |
| Chromebook (Chrome OS) | Yes | No |
| Linux Chrome / Chromium | **No** (silently returns nothing) | **Yes** |
| Non-Google Android (Huawei/HarmonyOS, Amazon Fire) | **No** | **Yes** |
| Desktop Firefox | **No** | **Yes** |

So the fallback protects the minority of devices where the feature is currently broken. It is not a wholesale re-routing of every recording.

---

## 9. Cost estimate

- Whisper pricing: **USD $0.006 per minute of audio**.
- Typical P3–P6 read-aloud take: ~30 seconds → ~$0.003 per fallback take.
- If ~10% of ~1000 monthly takes trigger the fallback: **~$3–$5 per month at current usage.**
- Scales linearly with adoption.

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Recording contains incidental PII (child says their name, school, address) | Read-aloud passages are preset scripted text; no free-form content on the read-aloud path. Free-form oral prompts (picture / video conversation) already flow through our AI-scoring path with equal or higher exposure. |
| Voice biometric could be misused | OpenAI DPA prohibits use for other purposes; zero-data-retention configuration eliminates provider-side storage entirely. |
| Wrong transcription → unfair score | Scoring is advisory. Our firm's internal policy already requires human review of AI outputs before they are relied on — scores must be verified by a teacher/parent before feedback to the student. |
| API key leak | Server-only secret; never exposed to client; can be rotated. |
| Cost overrun | Per-family monthly cap + global monitoring. |
| Vendor outage | User falls back to today's behaviour: no score, generic "try again" message. Feature degrades, not breaks. |

---

## 11. Sign-off checklist

Before engineering ships the change, the following must be complete:

- [ ] Compliance / DPO approval on this document
- [ ] OpenAI Data Processing Addendum signed
- [ ] Family onboarding consent copy updated to disclose the new data flow
- [ ] Zero-data-retention arrangement with OpenAI (recommended)
- [ ] Per-family cost cap value agreed (recommended)
- [ ] Decision recorded on whether an existing family who has not consented to the new copy is (a) opted out of the fallback until they reconsent, or (b) opted in with a notification

---

## 12. Reviewer instructions

Please approve, request changes, or block via a PR review comment on this document.

On approval, engineering will:

1. Update onboarding consent copy in a follow-up PR (which will also require review).
2. Implement the `/api/transcribe` endpoint with the safeguards described in section 7.
3. Wire the client-side fallback trigger.
4. Add the per-family cost cap.
5. Ship behind a feature flag so the DPO can verify the live behaviour before general rollout.

Nothing described in sections 2–10 will be built until this document is approved.
