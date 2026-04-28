// api/src/routes/sessions.js
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/sessions — all sessions for this family
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `select s.* from progress_sessions s
     where s.family_id = $1
     order by s.completed_at desc nulls last`,
    [req.familyId]
  );
  res.json(rows);
});

// POST /api/sessions — upsert a session
router.post('/', async (req, res) => {
  const { id, studentId, storyId, storyTitle, date, score, passed,
          pointsEarned, transcript, completedAt } = req.body;
  await db.query(
    `insert into progress_sessions
       (id, student_id, family_id, story_id, story_title, date, score,
        passed, points_earned, transcript, completed_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (id) do nothing`,
    [id, studentId, req.familyId, storyId, storyTitle, date, score,
     passed, pointsEarned ?? 0, transcript ?? '', completedAt ?? null]
  );
  res.json({ ok: true });
});

module.exports = router;
