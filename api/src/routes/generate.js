// api/src/routes/generate.js
const express = require('express');
const { requireAuth } = require('../auth');
const { callAnthropic } = require('../anthropic');

const router = express.Router();
router.use(requireAuth);

// POST /api/generate — proxy to Anthropic using the server's own API key.
// Auth is still required: this must not become an open relay to Anthropic.
router.post('/', async (req, res) => {
  try {
    const { status, data } = await callAnthropic(req.body);
    res.status(status).json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
