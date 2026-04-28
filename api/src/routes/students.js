// api/src/routes/students.js
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/students
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    'select * from students where family_id = $1 order by created_at',
    [req.familyId]
  );
  res.json(rows);
});

// POST /api/students
router.post('/', async (req, res) => {
  const { id, name, level, color, createdAt } = req.body;
  const { rows } = await db.query(
    `insert into students (id, family_id, name, level, color, created_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (id) do update set name=$3, level=$4, color=$5
     returning *`,
    [id, req.familyId, name, level, color, new Date(createdAt)]
  );
  res.json(rows[0]);
});

// DELETE /api/students/:id
router.delete('/:id', async (req, res) => {
  await db.query(
    'delete from students where id = $1 and family_id = $2',
    [req.params.id, req.familyId]
  );
  res.json({ ok: true });
});

module.exports = router;
