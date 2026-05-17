// api/src/routes/tingxie.js
'use strict';

const express = require('express');
const multer  = require('multer');
const QRCode  = require('qrcode');
const { pinyin } = require('pinyin-pro');
const db      = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ---- Phone upload sessions (DB-backed, survives restarts/deployments) ----
// Sessions are created by authenticated desktop, uploaded to by phone (token-only auth).
// Periodically clean up sessions older than 15 minutes.
setInterval(async () => {
  try {
    await db.query(`DELETE FROM phone_upload_sessions WHERE created_at < NOW() - INTERVAL '15 minutes'`);
  } catch (_) {}
}, 60_000);

// Create a session — returns token + QR code SVG
router.post('/upload-session', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `INSERT INTO phone_upload_sessions (family_id) VALUES ($1) RETURNING token`,
      [req.familyId]
    );
    const token = rows[0].token;
    const appOrigin = `${req.protocol}://${req.get('host')}`;
    const uploadUrl = `${appOrigin}/phone-upload.html?token=${token}`;
    const qrSvg = await QRCode.toString(uploadUrl, { type: 'svg', margin: 1 });
    res.json({ token, qrSvg, uploadUrl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Phone submits one or more images — no JWT required, token is the credential
router.post('/upload-session/:token', upload.array('files', 10), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT token, created_at FROM phone_upload_sessions WHERE token = $1 AND done = false`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found or expired' });
    const incoming = (req.files || []).map(f => ({
      data: f.buffer.toString('base64'),
      mimeType: f.mimetype.startsWith('image/') ? f.mimetype : 'image/jpeg',
    }));
    if (!incoming.length) return res.status(400).json({ error: 'No files received' });
    await db.query(
      `UPDATE phone_upload_sessions SET files = $1::jsonb, done = true WHERE token = $2`,
      [JSON.stringify(incoming), req.params.token]
    );
    res.json({ ok: true, received: incoming.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Desktop polls until done
router.get('/upload-session/:token', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT family_id, files, done FROM phone_upload_sessions WHERE token = $1`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found or expired' });
    const session = rows[0];
    if (session.family_id !== req.familyId) return res.status(403).json({ error: 'Forbidden' });
    if (!session.done) return res.json({ status: 'pending' });
    // Delete after reading so the session is consumed
    await db.query(`DELETE FROM phone_upload_sessions WHERE token = $1`, [req.params.token]);
    res.json({ status: 'ready', files: session.files });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.use(requireAuth);

// ---- Helpers ----

async function assertExamOwner(examId, familyId) {
  const { rows } = await db.query(
    'SELECT id FROM tingxie_exams WHERE id = $1 AND family_id = $2',
    [examId, familyId]
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
}

async function assertStudentOwner(studentId, familyId) {
  const { rows } = await db.query(
    'SELECT id FROM students WHERE id = $1 AND family_id = $2',
    [studentId, familyId]
  );
  if (!rows.length) throw Object.assign(new Error('Student not found'), { status: 403 });
}

async function callClaude(familyId, body) {
  const { rows } = await db.query('SELECT anthropic_key FROM families WHERE id = $1', [familyId]);
  const apiKey = rows[0]?.anthropic_key;
  if (!apiKey) throw Object.assign(new Error('No API key configured'), { status: 400 });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.error?.message || 'Anthropic API error'), { status: 502 });
  }
  return res.json();
}

// Build schedule in Singapore time (UTC+8)
function todaySG() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Singapore' });
}

function buildSchedule(examDateStr) {
  const todayStr = todaySG();
  const today = new Date(todayStr + 'T00:00:00');
  const exam  = new Date(examDateStr + 'T00:00:00');
  const diffDays = Math.round((exam - today) / 86400000);

  if (diffDays <= 0) return [];
  if (diffDays === 1) return [{ date: todayStr, mode: 'practice' }];

  const schedule = [];
  for (let i = 0; i < diffDays - 1; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    schedule.push({ date: d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Singapore' }), mode: 'practice' });
  }
  const dayBefore = new Date(exam);
  dayBefore.setDate(dayBefore.getDate() - 1);
  schedule.push({ date: dayBefore.toLocaleDateString('sv-SE', { timeZone: 'Asia/Singapore' }), mode: 'mock' });
  return schedule;
}

// ---- Exam routes ----

router.get('/exams', async (req, res) => {
  try {
    const { studentId } = req.query;
    if (!studentId) return res.status(400).json({ error: 'studentId required' });
    await assertStudentOwner(studentId, req.familyId);
    const { rows } = await db.query(
      'SELECT * FROM tingxie_exams WHERE family_id = $1 AND student_id = $2 ORDER BY exam_date ASC',
      [req.familyId, studentId]
    );
    res.json(rows);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.post('/exams', async (req, res) => {
  try {
    const { studentId, title, examDate, words } = req.body;
    if (!studentId || !title || !examDate || !Array.isArray(words))
      return res.status(400).json({ error: 'Missing required fields' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate))
      return res.status(400).json({ error: 'examDate must be YYYY-MM-DD format' });
    await assertStudentOwner(studentId, req.familyId);
    const schedule = buildSchedule(examDate);
    const { rows } = await db.query(
      `INSERT INTO tingxie_exams (family_id, student_id, title, exam_date, words, schedule)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.familyId, studentId, title, examDate, JSON.stringify(words), JSON.stringify(schedule)]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.patch('/exams/:id', async (req, res) => {
  try {
    await assertExamOwner(req.params.id, req.familyId);
    const { title, examDate, words } = req.body;
    if (examDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(examDate))
      return res.status(400).json({ error: 'examDate must be YYYY-MM-DD format' });
    const updates = [], vals = [];
    let idx = 1;
    if (title     !== undefined) { updates.push(`title = $${idx++}`);     vals.push(title); }
    if (examDate  !== undefined) {
      updates.push(`exam_date = $${idx++}`); vals.push(examDate);
      updates.push(`schedule = $${idx++}`);  vals.push(JSON.stringify(buildSchedule(examDate)));
    }
    if (words !== undefined) { updates.push(`words = $${idx++}`); vals.push(JSON.stringify(words)); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE tingxie_exams SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Exam not found' });
    res.json(rows[0]);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.delete('/exams/:id', async (req, res) => {
  try {
    await assertExamOwner(req.params.id, req.familyId);
    await db.query('DELETE FROM tingxie_exams WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ---- Session routes ----

router.get('/sessions', async (req, res) => {
  try {
    const { examId } = req.query;
    if (!examId) return res.status(400).json({ error: 'examId required' });
    await assertExamOwner(examId, req.familyId);
    const { rows } = await db.query(
      'SELECT * FROM tingxie_sessions WHERE exam_id = $1 ORDER BY created_at ASC', [examId]
    );
    res.json(rows);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.post('/sessions', async (req, res) => {
  try {
    const { examId, studentId, date, mode, results, score } = req.body;
    if (!examId || !studentId || !date || !mode || !Array.isArray(results) || score === undefined)
      return res.status(400).json({ error: 'Missing required fields' });
    await assertExamOwner(examId, req.familyId);
    await assertStudentOwner(studentId, req.familyId);
    const passed = mode === 'mock' ? score >= 80 : true;
    const { rows } = await db.query(
      `INSERT INTO tingxie_sessions (exam_id, student_id, date, mode, results, score, passed)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [examId, studentId, date, mode, JSON.stringify(results), score, passed]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ---- Paper extraction ----
// Accepts multiple files; returns { exams: [...] } — AI splits by title/date.

async function fileToImageContents(file) {
  if (file.mimetype === 'application/pdf') {
    const { pdf } = await import('pdf-to-img');
    const pages = [];
    for await (const page of await pdf(file.buffer, { scale: 2 })) {
      if (pages.length >= 5) break;
      pages.push(page);
    }
    return pages.map(buf => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: buf.toString('base64') },
    }));
  }
  const mt = file.mimetype.startsWith('image/') ? file.mimetype : 'image/jpeg';
  return [{ type: 'image', source: { type: 'base64', media_type: mt, data: file.buffer.toString('base64') } }];
}

function addPinyin(exams) {
  return exams.map(exam => ({
    ...exam,
    words: (exam.words || []).map(w => ({
      ...w,
      pinyin: pinyin(w.hanzi, { toneType: 'symbol', separator: ' ' }),
    })),
  }));
}

router.post('/extract', upload.fields([{ name: 'files', maxCount: 10 }, { name: 'file', maxCount: 1 }]), async (req, res) => {
  try {
    const files = [...(req.files?.files || []), ...(req.files?.file || [])];
    if (!files.length) return res.status(400).json({ error: 'No files uploaded' });

    const imageContents = (await Promise.all(files.map(fileToImageContents))).flat();

    const claudeRes = await callClaude(req.familyId, {
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          ...imageContents,
          { type: 'text', text: `You are extracting Chinese dictation (听写/默写) word lists from one or more exam papers.
The images may contain one exam paper or several — split them by title or exam date.

Return ONLY valid JSON (array of exam objects):
[{ "title": "exam title", "examDate": "YYYY-MM-DD or null", "words": [{ "hanzi": "词语", "type": "tingxie" }], "warning": "optional" }]

Rules:
- type is "tingxie" for 听写, "moxie" for 默写 (infer from section headers)
- Max 30 words per exam; if more set warning: "truncated"
- If different titles or dates are visible, create separate exam objects
- If no Chinese words found anywhere: [{ "error": "extraction_failed", "message": "..." }]` },
        ],
      }],
    });

    let exams;
    try {
      const text = claudeRes.content?.[0]?.text || '';
      exams = JSON.parse((text.match(/\[[\s\S]*\]/) || ['[]'])[0]);
    } catch {
      return res.status(422).json({ error: 'extraction_failed', message: 'Could not parse AI response' });
    }

    if (!Array.isArray(exams) || !exams.length)
      return res.status(422).json({ error: 'extraction_failed', message: 'No exams found' });
    if (exams[0]?.error === 'extraction_failed') return res.status(422).json(exams[0]);

    res.json({ exams: addPinyin(exams) });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ---- Grading ----

router.post('/grade', async (req, res) => {
  try {
    const { studentId, hanzi, imageB64 } = req.body;
    if (!studentId || !hanzi || !imageB64) return res.status(400).json({ error: 'Missing fields' });
    // Verify student belongs to this family (prevents cross-family leakage)
    await assertStudentOwner(studentId, req.familyId);

    // Fetch up to 2 confirmed-correct past drawings (few-shot context)
    const { rows } = await db.query(
      `SELECT results FROM tingxie_sessions WHERE student_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [studentId]
    );
    const fewShot = [];
    outer: for (const row of rows) {
      for (const r of (row.results || [])) {
        if (r.hanzi === hanzi && r.correct && r.imageB64) {
          fewShot.push(r.imageB64);
          if (fewShot.length >= 2) break outer;
        }
      }
    }

    const fewShotContent = fewShot.flatMap((b64, i) => [
      { type: 'text', text: `Example ${i + 1} of how this student correctly writes "${hanzi}":` },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
    ]);

    const claudeRes = await callClaude(req.familyId, {
      model: 'claude-opus-4-6',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          ...fewShotContent,
          { type: 'text', text: `The student is attempting to write "${hanzi}". Here is their attempt:` },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageB64 } },
          { type: 'text', text: `Is this a correct handwritten "${hanzi}"? Be lenient on style, strict on identity.
Return JSON: { "read": "what you see", "correct": true/false, "tip": "short tip if wrong, omit if correct" }` },
        ],
      }],
    });

    let result;
    try {
      const text = claudeRes.content?.[0]?.text || '';
      result = JSON.parse((text.match(/\{[\s\S]*\}/) || ['{}'])[0]);
    } catch {
      return res.status(422).json({ error: 'Could not parse grading response' });
    }
    res.json(result);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.post('/grade-batch', async (req, res) => {
  try {
    const { studentId, items } = req.body;
    if (!studentId || !Array.isArray(items) || !items.length)
      return res.status(400).json({ error: 'studentId and items[] required' });
    if (items.length > 40)
      return res.status(400).json({ error: 'Too many items — max 40 per batch' });
    await assertStudentOwner(studentId, req.familyId);

    const content = items.flatMap((item, i) => [
      { type: 'text', text: `Item ${i + 1}: Is this a correct handwritten "${item.hanzi}"?` },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: item.imageB64 } },
    ]);
    content.push({ type: 'text', text: `Return JSON array (one object per item, same order):
[{ "hanzi": "...", "read": "what you see", "correct": true/false }]
No tips. Strict character identity.` });

    const claudeRes = await callClaude(req.familyId, {
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content }],
    });

    let results;
    try {
      const text = claudeRes.content?.[0]?.text || '';
      results = JSON.parse((text.match(/\[[\s\S]*\]/) || ['[]'])[0]);
    } catch {
      return res.status(422).json({ error: 'Could not parse batch response' });
    }
    res.json(results);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

module.exports = router;
