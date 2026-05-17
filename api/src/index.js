// api/src/index.js
require('dotenv').config();
const path = require('path');
const fs   = require('fs');
const express = require('express');
const db = require('./db');

async function runMigrations() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const { rows } = await db.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
    if (rows.length) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await db.query(sql);
    await db.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    console.log(`Migration applied: ${file}`);
  }
}

const app = express();
const PORT = process.env.PORT || 3001;

// Serve frontend static files (when deployed with root Dockerfile)
const publicDir = path.join(__dirname, '../../public');
app.use(express.static(publicDir));

app.use(express.json({ limit: '10mb' })); // grade-batch sends up to 40 base64 PNG images

app.use('/api/families',   require('./routes/families'));
app.use('/api/students',   require('./routes/students'));
app.use('/api/sessions',   require('./routes/sessions'));
app.use('/api/recordings', require('./routes/recordings'));
app.use('/api/generate',   require('./routes/generate'));
app.use('/api/tingxie',    require('./routes/tingxie'));

app.get('/health', (_, res) => res.json({ ok: true }));

// Fallback: serve index.html for any non-API route (PWA / deep links)
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

runMigrations()
  .then(() => app.listen(PORT, () => console.log(`Server running on :${PORT}`)))
  .catch(err => { console.error('Migration failed:', err); process.exit(1); });
