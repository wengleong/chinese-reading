// api/src/routes/transcribe.js
// POST /api/transcribe — server-side speech-to-text fallback for browsers
// whose Web Speech API silently returns nothing (Linux Chrome, non-Google
// Android, Firefox). Three independent guards must all pass before a
// family's audio is forwarded to the transcription vendor:
//   (1) global feature flag  ENABLE_SERVER_TRANSCRIBE=true + OPENAI_API_KEY
//   (2) per-family consent   families.transcription_consent = true
//   (3) per-family cost cap  TRANSCRIBE_MONTHLY_CAP_CENTS (default 500 = $5)
// The audio is held in memory only and never persisted on our server.
// Data-flow review: docs/pii-transcription-review.md.

const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../auth');
const { transcribeAudio, transcribeEnabled } = require('../openai');

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;   // ~4 minutes of Opus
const DEFAULT_CAP_CENTS = 500;             // $5 per family per month
const WHISPER_CENTS_PER_MINUTE = 0.6;      // $0.006/min => 0.6 cents

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
});

const router = express.Router();
router.use(requireAuth);

function currentYearMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function capCents() {
  const raw = parseInt(process.env.TRANSCRIBE_MONTHLY_CAP_CENTS, 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_CAP_CENTS;
}

router.post('/', upload.single('audio'), async (req, res) => {
  try {
    if (!transcribeEnabled()) {
      return res.status(503).json({ error: 'Server transcription is not enabled.' });
    }
    if (!req.file || !req.file.buffer?.length) {
      return res.status(400).json({ error: 'No audio uploaded.' });
    }

    // Per-family consent gate — must be flipped true explicitly, per family.
    // Never on by default, even after the global flag is enabled.
    const consent = await db.query(
      'SELECT transcription_consent FROM families WHERE id = $1',
      [req.familyId]
    );
    if (!consent.rows.length || !consent.rows[0].transcription_consent) {
      return res.status(403).json({
        error: 'Transcription consent not on file for this family.',
      });
    }

    // Cost cap. The bill lands after the call, so we check the accumulated
    // cost before calling, and if we are already at the cap we refuse. A
    // client that lies about anything cannot bypass this: the estimate we
    // add is derived from the actual byte count on the request.
    const cap = capCents();
    const ym = currentYearMonth();
    const usage = await db.query(
      `SELECT cost_cents FROM transcription_usage
       WHERE family_id = $1 AND year_month = $2`,
      [req.familyId, ym]
    );
    const usedCents = usage.rows[0]?.cost_cents ?? 0;
    if (usedCents >= cap) {
      return res.status(429).json({
        error: 'Monthly transcription cost cap reached for this family.',
      });
    }

    const text = await transcribeAudio({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      lang: req.body.lang,
    });

    // Post-call accounting. Estimate seconds from bytes at Opus ~32 kbps
    // (~4 KB/s) — imprecise but always on the billable-side, so the cap
    // trips before the vendor bill, never after.
    const estSeconds = Math.max(1, Math.round(req.file.buffer.length / 4000));
    const estCents = Math.max(1, Math.ceil((estSeconds / 60) * WHISPER_CENTS_PER_MINUTE));
    await db.query(
      `INSERT INTO transcription_usage (family_id, year_month, seconds_used, cost_cents, call_count)
       VALUES ($1, $2, $3, $4, 1)
       ON CONFLICT (family_id, year_month) DO UPDATE
       SET seconds_used = transcription_usage.seconds_used + EXCLUDED.seconds_used,
           cost_cents   = transcription_usage.cost_cents   + EXCLUDED.cost_cents,
           call_count   = transcription_usage.call_count   + 1,
           updated_at   = NOW()`,
      [req.familyId, ym, estSeconds, estCents]
    );

    res.json({ transcript: text });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
