// api/src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

app.use('/api/families',   require('./routes/families'));
app.use('/api/students',   require('./routes/students'));
app.use('/api/sessions',   require('./routes/sessions'));
app.use('/api/recordings', require('./routes/recordings'));
app.use('/api/generate',   require('./routes/generate'));

app.get('/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`API running on :${PORT}`));
