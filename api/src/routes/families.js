// api/src/routes/families.js
const express = require('express');
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

// GET /api/families/transcription-consent — read the current per-family opt-in.
router.get('/transcription-consent', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'select transcription_consent from families where id = $1',
      [req.familyId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Family not found' });
    res.json({ consent: !!rows[0].transcription_consent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/families/transcription-consent — { consent: true|false }
// The data-flow reviewed in docs/pii-transcription-review.md requires BOTH
// per-family consent AND the global ENABLE_SERVER_TRANSCRIBE flag before a
// family's audio is forwarded to the transcription vendor. This endpoint
// flips only the per-family bit; the global flag is a Railway env var.
router.put('/transcription-consent', requireAuth, async (req, res) => {
  try {
    const { consent } = req.body || {};
    if (typeof consent !== 'boolean') {
      return res.status(400).json({ error: 'Body must be { consent: true|false }' });
    }
    const { rows } = await db.query(
      'update families set transcription_consent = $1 where id = $2 returning transcription_consent',
      [consent, req.familyId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Family not found' });
    res.json({ consent: !!rows[0].transcription_consent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// No /apikey routes: AI runs on the server's own ANTHROPIC_API_KEY, so there is
// no per-family key to store, fetch, or ship to a browser.

module.exports = router;
