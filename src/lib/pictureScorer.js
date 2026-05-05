// AI-based scoring and question selection for picture oral stories.
// Returns null if not logged in (no scoring without AI).

import { isLoggedIn, generateViaApi } from './api.js';

const GENERIC_QUESTIONS = [
  '你觉得图片里发生了什么事？',
  '图片里的人物心情怎样？',
  '你从这幅图片学到了什么？',
];

function extractFirstJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseModelJsonBlock(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const cleaned = rawText.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const candidate = extractFirstJsonObject(cleaned) || cleaned;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function extractTextFromModelResponse(data) {
  const blocks = data?.content;
  if (!Array.isArray(blocks)) return '';
  return blocks
    .filter(b => b?.type === 'text' && typeof b?.text === 'string')
    .map(b => b.text)
    .join('\n')
    .trim();
}

function toBoundedScore(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Select 3 questions from story.questions most relevant to the student's description.
// Falls back to first 3 (or generic) if AI call fails or story has no questions.
export async function selectQuestions({ story, descriptionTranscript }) {
  const questions = story.questions || [];
  if (questions.length === 0) return GENERIC_QUESTIONS;
  if (questions.length <= 3) return questions.slice(0, 3);

  if (!isLoggedIn()) return questions.slice(0, 3);

  const prompt = `A Singapore primary school student described a picture scene.
Student's description: "${descriptionTranscript}"

Pre-written follow-up questions (indexed 0 to ${questions.length - 1}):
${questions.map((q, i) => `${i}: ${q}`).join('\n')}

Choose exactly 3 questions most relevant to what the student said.
Return JSON only (no code fences): {"selected": [index, index, index]}`;

  try {
    const data = await generateViaApi({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      messages: [{ role: 'user', content: prompt }],
    });
    const result = parseModelJsonBlock(extractTextFromModelResponse(data));
    if (!result) throw new Error('bad response');
    const indices = result.selected;
    if (!Array.isArray(indices) || indices.length !== 3) throw new Error('bad response');
    const selected = indices.map(i => questions[i]).filter(Boolean);
    if (selected.length !== 3) throw new Error('bad indices');
    return selected;
  } catch {
    return questions.slice(0, 3);
  }
}

// Score all picture oral responses together.
// transcripts[0] = scene description, transcripts[1-3] = question answers.
// durations[0-3] = per-phase recording duration in ms.
export async function scorePicture({ story, transcripts, durations }) {
  if (!isLoggedIn()) return null;
  if (!transcripts?.length) return null;

  const keyElements = story.keyElements || [];
  const allText = transcripts.join(' ');
  const mentioned = keyElements.filter(el => allText.includes(el));
  const coveragePct = keyElements.length > 0
    ? Math.round(mentioned.length / keyElements.length * 100)
    : 50;

  const totalSecs = Math.round((durations || []).reduce((s, d) => s + d, 0) / 1000);

  const prompt = `A Singapore primary school student (${story.level}) completed a picture oral exercise.
Picture scene: "${story.scene}"
Expected key elements: ${keyElements.join('、')}
Key element coverage (local): ${coveragePct}/100

Student's responses:
[Scene description]: ${transcripts[0] || '(none)'}
[Question 1 answer]: ${transcripts[1] || '(none)'}
[Question 2 answer]: ${transcripts[2] || '(none)'}
[Question 3 answer]: ${transcripts[3] || '(none)'}
Total speaking time: ${totalSecs} seconds

You are an encouraging Chinese language teacher. Evaluate all responses together.
Return JSON only (no code fences):
{
  "content_score": <0-100, key element coverage in description + answer relevance>,
  "language_score": <0-100, vocabulary richness, sentence variety, grammar>,
  "expression_score": <0-100, fluency and confidence informed by speaking time>,
  "feedback": "<1-2 sentences of encouraging feedback in English>"
}`;

  try {
    const data = await generateViaApi({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    });
    const result = parseModelJsonBlock(extractTextFromModelResponse(data));
    if (!result) throw new Error('bad response');
    const contentScore = toBoundedScore(result.content_score, coveragePct);
    const languageScore = toBoundedScore(result.language_score, 50);
    const expressionScore = toBoundedScore(result.expression_score, 50);
    const overall = Math.round(contentScore * 0.4 + languageScore * 0.4 + expressionScore * 0.2);
    return {
      contentScore,
      languageScore,
      expressionScore,
      overall,
      passed: overall >= 60,
      feedback: result.feedback || '',
    };
  } catch {
    return null;
  }
}
