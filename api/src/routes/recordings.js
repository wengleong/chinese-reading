// api/src/routes/recordings.js
const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// multer: store upload in memory (audio files are small)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
});

// POST /api/recordings — upload audio blob
// Multipart fields: audio (file), studentId, sessionId, durationMs
router.post('/', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file' });

  const { studentId, sessionId, durationMs } = req.body;

  // Verify student belongs to this family
  const { rows: studentRows } = await db.query(
    'select id from students where id = $1 and family_id = $2',
    [studentId, req.familyId]
  );
  if (!studentRows.length) return res.status(403).json({ error: 'Forbidden' });

  const { rows } = await db.query(
    `insert into recordings
       (session_id, student_id, family_id, audio_data, mime_type, duration_ms)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [sessionId ?? null, studentId, req.familyId,
     req.file.buffer, req.file.mimetype, durationMs ? parseInt(durationMs) : null]
  );
  res.json({ id: rows[0].id });
});

// GET /api/recordings — list metadata (no audio data)
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `select id, session_id, student_id, mime_type, duration_ms, created_at
     from recordings
     where family_id = $1
     order by created_at desc`,
    [req.familyId]
  );
  res.json(rows);
});

// GET /api/recordings/:id — stream audio
router.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    'select audio_data, mime_type from recordings where id = $1 and family_id = $2',
    [req.params.id, req.familyId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });

  const { audio_data, mime_type } = rows[0];
  res.set('Content-Type', mime_type);
  res.set('Cache-Control', 'private, max-age=3600');
  res.send(audio_data);
});

module.exports = router;
