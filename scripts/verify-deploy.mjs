#!/usr/bin/env node
// Post-deploy smoke check against the live app.
//
// Playwright runs against `npx serve .`, which serves the whole repo — so it
// cannot catch an asset that was never COPYed into the Docker image. The server
// answers any unknown path with index.html, so a missing asset is a 200 full of
// HTML: it looks healthy and the picture silently never appears.
//
// Usage: node scripts/verify-deploy.mjs [baseUrl]

const BASE = process.argv[2] || 'https://app-production-6a0d.up.railway.app';

let failures = 0;
const ok = (msg) => console.log(`  ok    ${msg}`);
const bad = (msg) => { failures++; console.log(`  FAIL  ${msg}`); };

async function getJson(path) {
  const res = await fetch(BASE + path);
  const type = res.headers.get('content-type') || '';
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!type.includes('json')) throw new Error(`served ${type} — SPA fallback, asset not in the image?`);
  return res.json();
}

async function checkAsset(path, expectType) {
  const res = await fetch(BASE + path);
  const type = res.headers.get('content-type') || '';
  const len = Number(res.headers.get('content-length') || 0);
  if (!res.ok) return bad(`${path} — HTTP ${res.status}`);
  if (!type.includes(expectType)) return bad(`${path} — content-type ${type}, expected ${expectType} (SPA fallback?)`);
  if (len > 0 && len < 5000) return bad(`${path} — only ${len} bytes, too small to be real`);
  ok(`${path} (${type}, ${len ? Math.round(len / 1024) + 'KB' : 'chunked'})`);
}

console.log(`Verifying ${BASE}\n`);

// 1. Health and AI availability
try {
  const health = await getJson('/health');
  health.ok ? ok('/health ok') : bad('/health not ok');
  health.anthropicKey
    ? ok('ANTHROPIC_API_KEY configured — AI scoring available')
    : bad('ANTHROPIC_API_KEY missing — all AI scoring will 503');
} catch (e) { bad(`/health — ${e.message}`); }

// 2. Service worker version, so a stale PWA cache is visible
try {
  const sw = await (await fetch(`${BASE}/sw.js`)).text();
  const v = sw.match(/CACHE_VERSION = "(v\d+)"/)?.[1];
  v ? ok(`service worker ${v}`) : bad('could not read CACHE_VERSION from sw.js');
} catch (e) { bad(`/sw.js — ${e.message}`); }

// 3. Story library, and every picture/video story's image
try {
  const stories = await getJson('/stories/index.json');
  ok(`stories/index.json — ${stories.length} stories, ${stories.filter(s => s.lang === 'en').length} English`);
  for (const s of stories.filter(s => s.type === 'picture')) {
    await checkAsset(`/stories/images/${s.id}.jpg`, 'image/');
  }
} catch (e) { bad(`stories/index.json — ${e.message}`); }

// 4. Composition papers and their picture strips
try {
  const papers = await getJson('/compositions/index.json');
  ok(`compositions/index.json — ${papers.length} papers`);
  for (const p of papers) {
    const paper = await getJson(`/compositions/${p.id}.json`);
    await checkAsset(`/compositions/images/${paper.image}`, 'image/');
  }
} catch (e) { bad(`compositions/index.json — ${e.message}`); }

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
