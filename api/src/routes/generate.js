// api/src/routes/generate.js
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// POST /api/generate — proxy to Anthropic using the family's stored API key
router.post('/', async (req, res) => {
  const { rows } = await db.query(
    'select anthropic_key from families where id = $1',
    [req.familyId]
  );
  const apiKey = rows[0]?.anthropic_key;
  if (!apiKey) return res.status(400).json({ error: 'No API key configured. Add one in Settings.' });

  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });
  } catch (err) {
    return res.status(502).json({ error: `Could not reach Anthropic API: ${err.message}` });
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    return res.status(502).json({ error: 'Anthropic API returned unparseable response' });
  }
  res.status(upstream.status).json(data);
});

module.exports = router;
