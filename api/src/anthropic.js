// api/src/anthropic.js
// The single place that knows the Anthropic credential. It is the SERVER's own
// key (Railway variable ANTHROPIC_API_KEY) — never a per-family value, and it
// never leaves this process: the browser calls /api/generate, not Anthropic.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

function hasApiKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Throws errors carrying { status } so routes can pass them straight through.
async function callAnthropic(body) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw Object.assign(
      new Error('AI is unavailable — the server has no Anthropic API key configured.'),
      { status: 503 }
    );
  }

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw Object.assign(new Error(`Could not reach Anthropic API: ${err.message}`), { status: 502 });
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    throw Object.assign(new Error('Anthropic API returned an unparseable response'), { status: 502 });
  }

  return { status: upstream.status, data };
}

module.exports = { callAnthropic, hasApiKey };
