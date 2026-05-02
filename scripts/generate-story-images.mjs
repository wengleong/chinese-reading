#!/usr/bin/env node
// Generate PSLE-style black-and-white illustrations for picture stories.
// Uses Google Gemini imagen-3.0-generate-002 (Imagen 3).
//
// Usage:
//   GOOGLE_API_KEY=<key> node scripts/generate-story-images.mjs
//   GOOGLE_API_KEY=<key> node scripts/generate-story-images.mjs p3-pic-gongyuan
//
// Images saved to: stories/images/<id>.jpg
// Run once; skips stories that already have an image file.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const IMAGES_DIR = join(ROOT, 'stories', 'images');

const API_KEY = process.env.GOOGLE_API_KEY;
if (!API_KEY) {
  console.error('Set GOOGLE_API_KEY env variable');
  process.exit(1);
}

mkdirSync(IMAGES_DIR, { recursive: true });

// Style prefix applied to every prompt
const STYLE = [
  'Black and white pen-and-ink line art illustration,',
  'Singapore primary school oral examination picture description exercise,',
  'multiple people in the scene doing different activities simultaneously,',
  'clean simple cartoon lines, no color fill, no shading,',
  'no text, no labels, no captions, no title, no border,',
  'plain white background, illustration only,',
  'educational comic style similar to Singapore MOE Chinese language textbook.',
].join(' ');

// Per-story scene prompts
const PROMPTS = {
  'p1-pic-jiaoshi': `${STYLE} A bright primary school classroom. A teacher at the blackboard writing Chinese characters, students sitting at desks reading textbooks, one student raising their hand to answer a question, another student writing in an exercise book, sunlight coming through windows, bookshelves and educational posters on walls.`,

  'p2-pic-caochang': `${STYLE} A school sports day on a running track. Students racing in a 100-metre sprint, classmates cheering from the sidelines, parents watching from the stands, a teacher with a stopwatch at the finish line, students wearing race bibs and school PE uniforms, a podium visible in the background.`,

  'p3-pic-gongyuan': `${STYLE} A sunny afternoon in a public park. An elderly man sitting on a bench near a pond with ducks, a young girl picking flowers and showing them to the old man, children running and playing near large trees, a family with a stroller walking along the path, sunshine filtering through the tree canopy.`,

  'p3-pic-tushuguan': `${STYLE} A quiet public library. Students and adults browsing tall bookshelves, a boy sitting at a reading table with an open book, a girl taking notes with a pencil, a librarian at the counter helping a visitor, children's book displays near the entrance, soft reading lamps over the tables.`,

  'p4-pic-caichang': `${STYLE} A busy morning wet market. A fishmonger displaying fresh fish on ice, a vegetable vendor arranging produce, a woman with a basket selecting vegetables, a man carrying bags of groceries, a shopkeeper making change, narrow market lanes with stalls on both sides, bustling activity.`,

  'p4-pic-yiyuan': `${STYLE} A hospital corridor and ward. A doctor checking a patient's chart at the bedside, a nurse administering medicine, family members seated beside a patient, a child holding flowers to give to the patient, healthcare workers in the corridor, a waiting area with concerned relatives outside.`,

  'p5-pic-ditie': `${STYLE} Inside a Singapore MRT train carriage. A school student standing to offer their seat to an elderly person with a walking stick, the elderly person gesturing gratitude, other passengers holding handrails, a woman with a sleeping toddler on her lap, priority seating signs visible, passengers with schoolbags and briefcases.`,

  'p5-pic-huanbao': `${STYLE} A neighbourhood recycling station. A father and daughter sorting cardboard boxes and plastic bottles into separate recycling bins, an elderly woman depositing newspapers, a boy carrying a bag of aluminium cans, colourful recycling bin labels, HDB blocks in the background, a notice board with recycling guidelines.`,

  'p5-pic-jiaotong': `${STYLE} A busy pedestrian crossing at a school junction. Students waiting at a red traffic light, a crossing guard with a stop sign, cars waiting for pedestrians, a cyclist stopping at the line, children in school uniforms crossing safely in a group, traffic light poles and road markings clearly visible.`,

  'p6-pic-yisaihui': `${STYLE} A school charity fundraising fair on the school field. Student stalls selling handmade crafts, food, and second-hand books, parents and students browsing the stalls, a student counting coins into a donation tin, a group photo near a banner, teachers supervising, balloons and cheerful decorations.`,

  'p6-pic-zhiyuan': `${STYLE} A community centre volunteer day. Young volunteers helping elderly residents with activities, a volunteer reading a newspaper to an old man, another helping an elderly woman with exercises, children playing games with seniors, a volunteer organiser with a clipboard, banner reading about the community event in the background.`,

  'p6-pic-keji': `${STYLE} A science and technology exhibition hall. Visitors gathered around a robot demonstration, a student trying a tablet interactive exhibit, an engineer explaining a solar panel model, a group watching a coding screen, display boards with science diagrams, families and school groups exploring different booths.`,
};

async function generateImage(storyId) {
  const outPath = join(IMAGES_DIR, `${storyId}.jpg`);
  if (existsSync(outPath)) {
    console.log(`⏭  ${storyId} — already exists, skipping`);
    return;
  }

  const prompt = PROMPTS[storyId];
  if (!prompt) {
    console.log(`⚠  ${storyId} — no prompt defined, skipping`);
    return;
  }

  console.log(`🎨 Generating ${storyId}…`);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${API_KEY}`;
  const body = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: '4:3',
      outputMimeType: 'image/jpeg',
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('No image data in response');

  writeFileSync(outPath, Buffer.from(b64, 'base64'));
  console.log(`✓  Saved ${storyId}.jpg (${(Buffer.from(b64, 'base64').length / 1024).toFixed(0)}KB)`);
}

// Main
const targetId = process.argv[2]; // optional: generate single story
const ids = targetId ? [targetId] : Object.keys(PROMPTS);

for (const id of ids) {
  try {
    await generateImage(id);
  } catch (err) {
    console.error(`✗  ${id}: ${err.message}`);
  }
  // Brief pause to avoid rate limiting
  if (ids.length > 1) await new Promise(r => setTimeout(r, 1000));
}

console.log('\nDone. Images saved to stories/images/');
