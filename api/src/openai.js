// api/src/openai.js
// The single place that knows the OpenAI credential. Feature-flagged: this
// module refuses to run unless ENABLE_SERVER_TRANSCRIBE is truthy AND
// OPENAI_API_KEY is set, so the data flow to OpenAI cannot activate by
// accident on a deploy that has the code but is not yet cleared for it.
// Audio is forwarded in-memory only; never persisted server-side.

const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';

function transcribeEnabled() {
  return process.env.ENABLE_SERVER_TRANSCRIBE === 'true' && Boolean(process.env.OPENAI_API_KEY);
}

// Whisper wants ISO-639-1 ('zh', 'en'). The client passes the same tag the
// Web Speech API uses ('zh-CN', 'en-SG') — trim to the short form.
function normaliseLang(lang) {
  if (typeof lang !== 'string') return undefined;
  const short = lang.split('-')[0].toLowerCase();
  return short || undefined;
}

// Throws errors carrying { status } so the route can pass them straight through.
async function transcribeAudio({ buffer, mimeType, lang }) {
  if (!transcribeEnabled()) {
    throw Object.assign(
      new Error('Server transcription is not enabled on this deploy.'),
      { status: 503 }
    );
  }

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType || 'audio/webm' }), 'take.webm');
  form.append('model', 'whisper-1');
  form.append('response_format', 'json');
  const short = normaliseLang(lang);
  if (short) form.append('language', short);

  let upstream;
  try {
    upstream = await fetch(OPENAI_TRANSCRIBE_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
  } catch (err) {
    throw Object.assign(new Error(`Could not reach OpenAI: ${err.message}`), { status: 502 });
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    throw Object.assign(new Error('OpenAI returned an unparseable response'), { status: 502 });
  }

  if (!upstream.ok) {
    throw Object.assign(
      new Error(data?.error?.message || `OpenAI returned status ${upstream.status}`),
      { status: 502 }
    );
  }

  return typeof data.text === 'string' ? data.text : '';
}

module.exports = { transcribeAudio, transcribeEnabled };
