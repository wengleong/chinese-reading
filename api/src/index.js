// api/src/index.js
require('dotenv').config();
const path = require('path');
const express = require('express');

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

app.listen(PORT, () => console.log(`Server running on :${PORT}`));
