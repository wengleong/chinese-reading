// AI-based scoring for picture description stories.
// Returns null if not logged in (no scoring without AI).

import { isLoggedIn, generateViaApi } from './api.js';

export async function scorePicture({ story, transcript, durationMs }) {
  if (!isLoggedIn()) return null;
  if (!transcript) return null;

  const keyElements = story.keyElements || [];
  const mentioned = keyElements.filter(el => transcript.includes(el));
  const contentScore = keyElements.length > 0
    ? Math.round(mentioned.length / keyElements.length * 100)
    : 50;

  // Pace: reward at least 8 seconds of speaking
  const paceScore = durationMs >= 8000 ? 80 : Math.round((durationMs / 8000) * 80);

  const prompt = `A Singapore primary school student (${story.level}) was asked to describe a picture.
Picture scene: "${story.scene}"
Expected key elements: ${keyElements.join('、')}
Student's spoken response (transcribed): ${transcript}

You are an encouraging Chinese language teacher. Evaluate the response.
Return JSON only (no code fences):
{
  "language_score": <0-100, based on vocabulary richness, sentence variety, and grammar>,
  "feedback": "<1-2 sentences of encouraging feedback in English>"
}`;

  try {
    const data = await generateViaApi({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = data.content[0].text.trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const result = JSON.parse(raw);
    const languageScore = Math.max(0, Math.min(100, result.language_score ?? 50));
    const overall = Math.round(contentScore * 0.4 + languageScore * 0.4 + paceScore * 0.2);
    return {
      contentScore,
      languageScore,
      overall,
      passed: overall >= 60,
      feedback: result.feedback || '',
      mentionedCount: mentioned.length,
      totalElements: keyElements.length,
    };
  } catch {
    return null;
  }
}
