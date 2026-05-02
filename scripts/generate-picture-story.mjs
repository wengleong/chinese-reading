#!/usr/bin/env node
// Generate a complete PSLE picture oral story: JSON content + illustration.
// Uses Gemini 2.5 Flash for story/questions and Imagen 4 for the image.
//
// Usage (single story):
//   GOOGLE_API_KEY=<key> node scripts/generate-picture-story.mjs \
//     --id p4-pic-kebei  \
//     --level P4         \
//     --title "课室壁报" \
//     --topic "Students decorating a classroom display board" \
//     --tags "picture,education"
//
// Usage (batch from JSON spec file):
//   GOOGLE_API_KEY=<key> node scripts/generate-picture-story.mjs --batch scripts/story-specs.json
//
// Flags:
//   --no-image   Skip image generation (story JSON only)
//   --no-story   Skip story JSON generation (image only)
//   --force      Overwrite existing files
//
// Spec file format (array of objects with same fields as single-story flags minus "--"):
//   [{ "id": "p4-pic-kebei", "level": "P4", "title": "课室壁报", "topic": "...", "tags": "picture,education" }]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const STORIES_DIR = join(ROOT, 'stories');
const IMAGES_DIR = join(STORIES_DIR, 'images');
const INDEX_PATH = join(STORIES_DIR, 'index.json');

const API_KEY = process.env.GOOGLE_API_KEY;
if (!API_KEY) { console.error('Set GOOGLE_API_KEY env variable'); process.exit(1); }

mkdirSync(IMAGES_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return undefined;
  return args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
};
const hasFlag = (name) => args.includes(`--${name}`);

const batchFile  = flag('batch');
const generateImage = !hasFlag('no-image');
const generateStory = !hasFlag('no-story');
const force         = hasFlag('force');

// ---------------------------------------------------------------------------
// Image style prefix (same as generate-story-images.mjs)
// ---------------------------------------------------------------------------
const IMG_STYLE = [
  'Black and white pen-and-ink line art illustration,',
  'Singapore primary school oral examination picture description exercise,',
  'multiple people in the scene doing different activities simultaneously,',
  'clean simple cartoon lines, no color fill, no shading,',
  'no text, no labels, no captions, no title, no border,',
  'plain white background, illustration only,',
  'educational comic style similar to Singapore MOE Chinese language textbook.',
].join(' ');

// ---------------------------------------------------------------------------
// Gemini: generate story JSON
// ---------------------------------------------------------------------------
async function generateStoryJSON(spec) {
  const { id, level, title, topic, tags } = spec;
  const num = parseInt(level.replace('P', ''), 10);
  const isLower = num <= 2;
  const isUpper = num >= 5;

  const questionGuidance = isLower
    ? 'Simple, concrete questions about what is happening in the scene, personal experience, and basic feelings. Vocabulary appropriate for P1-P2.'
    : isUpper
    ? 'Mix of descriptive, analytical, and open-ended questions including at least one societal/values question relevant to Singapore context. Appropriate for P5-P6.'
    : 'Mix of observational and personal-reflection questions. Appropriate for P3-P4.';

  const prompt = `You are a Singapore primary school Chinese language curriculum designer.

Generate a PSLE picture oral examination story in JSON format.

Requirements:
- id: "${id}"
- type: "picture"
- title: "${title}" (in Chinese)
- level: "${level}"
- estMinutes: 3 or 4 (use 4 for P5-P6)
- tags: array from "${tags}" (split by comma, keep as array of strings)
- scene: 1–2 sentences in Chinese describing the overall picture scene
- sceneParts: array of 6 objects with "emoji" and "label" (Chinese label) — key visual elements in the scene
- keyElements: array of 10 Chinese vocabulary words relevant to the scene
- questions: array of ${isLower ? 5 : 6} questions in Chinese. ${questionGuidance}
  Questions should go from easier (observation) to harder (opinion/values).
  All questions must be answerable by looking at the picture or from personal experience.

Topic/scene description: ${topic}

Respond with ONLY valid JSON, no markdown, no explanation.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err.replace(API_KEY, '[REDACTED]')}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No content in Gemini response');

  // Strip markdown fences if present
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(cleaned);
}

// ---------------------------------------------------------------------------
// Imagen: generate illustration
// ---------------------------------------------------------------------------
async function generateIllustration(id, topic) {
  const prompt = `${IMG_STYLE} ${topic}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${API_KEY}`;
  const body = {
    instances: [{ prompt }],
    parameters: { sampleCount: 1, aspectRatio: '4:3', outputMimeType: 'image/jpeg' },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Imagen API error ${res.status}: ${err.replace(API_KEY, '[REDACTED]')}`);
  }

  const data = await res.json();
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('No image data in response');

  const buf = Buffer.from(b64, 'base64');
  const outPath = join(IMAGES_DIR, `${id}.jpg`);
  writeFileSync(outPath, buf);
  return { outPath, sizeKB: Math.round(buf.length / 1024) };
}

// ---------------------------------------------------------------------------
// Update stories/index.json
// ---------------------------------------------------------------------------
function updateIndex(storyData) {
  const index = existsSync(INDEX_PATH)
    ? JSON.parse(readFileSync(INDEX_PATH, 'utf8'))
    : [];
  const existing = index.findIndex(e => e.id === storyData.id);
  const entry = {
    id: storyData.id,
    title: storyData.title,
    level: storyData.level,
    estMinutes: storyData.estMinutes,
    tags: storyData.tags,
  };
  if (existing >= 0) {
    index[existing] = entry;
  } else {
    index.push(entry);
    index.sort((a, b) => a.id.localeCompare(b.id));
  }
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Process one story spec
// ---------------------------------------------------------------------------
async function processSpec(spec) {
  const { id, topic } = spec;
  if (!id || !topic) throw new Error('Each spec needs at least "id" and "topic"');

  console.log(`\n--- ${id} ---`);

  // Story JSON
  const storyPath = join(STORIES_DIR, `${id}.json`);
  let storyData = null; // populated if generateStory runs; image step uses spec.topic directly

  if (generateStory) {
    if (existsSync(storyPath) && !force) {
      console.log(`  story  : already exists, skipping (use --force to overwrite)`);
      storyData = JSON.parse(readFileSync(storyPath, 'utf8'));
    } else {
      process.stdout.write('  story  : generating...');
      storyData = await generateStoryJSON(spec);
      // Ensure id/level/title from spec take precedence
      storyData.id = id;
      storyData.level = spec.level || storyData.level;
      storyData.title = spec.title || storyData.title;
      writeFileSync(storyPath, JSON.stringify(storyData, null, 2) + '\n');
      updateIndex(storyData);
      console.log(` done (${storyData.questions?.length ?? 0} questions)`);
    }
  }

  // Image
  if (generateImage) {
    const imgPath = join(IMAGES_DIR, `${id}.jpg`);
    if (existsSync(imgPath) && !force) {
      console.log(`  image  : already exists, skipping (use --force to overwrite)`);
    } else {
      process.stdout.write('  image  : generating...');
      const { sizeKB } = await generateIllustration(id, topic);
      console.log(` done (${sizeKB}KB)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
let specs;

if (batchFile) {
  if (!existsSync(batchFile)) {
    console.error(`Batch file not found: ${batchFile}`);
    process.exit(1);
  }
  try {
    specs = JSON.parse(readFileSync(batchFile, 'utf8'));
  } catch (err) {
    console.error(`Failed to parse batch file: ${err.message}`);
    process.exit(1);
  }
  console.log(`Batch mode: ${specs.length} stories from ${batchFile}`);
} else {
  // Single story from flags
  const id    = flag('id');
  const level = flag('level');
  const title = flag('title');
  const topic = flag('topic');
  const tags  = flag('tags') || 'picture';

  if (!id || !topic) {
    console.error('Usage: --id <id> --topic "<scene description>" [--level P3] [--title "<title>"] [--tags "picture,community"]');
    console.error('   or: --batch <specs.json>');
    process.exit(1);
  }
  specs = [{ id, level: level || 'P3', title: title || '', topic, tags }];
}

for (const spec of specs) {
  try {
    await processSpec(spec);
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
  }
  if (specs.length > 1) await new Promise(r => setTimeout(r, 1200));
}

console.log('\nDone.');
