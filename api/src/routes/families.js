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

// PUT /api/families/apikey — save Anthropic API key
router.put('/apikey', requireAuth, async (req, res) => {
  const { key } = req.body;
  await db.query(
    'update families set anthropic_key = $1 where id = $2',
    [key ?? null, req.familyId]
  );
  res.json({ ok: true });
});

// GET /api/families/apikey — get API key (for pulling into localStorage on login)
router.get('/apikey', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    'select anthropic_key from families where id = $1',
    [req.familyId]
  );
  res.json({ key: rows[0]?.anthropic_key ?? null });
});

module.exports = router;
