/**
 * generateCopy.ts
 *
 * AI-generated copy per concept.
 * Replaces handleCopy's mechanical field extraction.
 */

import type { ConceptDirection, CopyGenerationOutput, CopyVariant } from "../media-realism/types";

function safeParseJson<T>(text: string): T {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  return JSON.parse(stripped) as T;
}

export async function generateCopy(conceptDirections: ConceptDirection[]): Promise<CopyGenerationOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const variants = await Promise.all(
    conceptDirections.map(concept => generateVariant(concept, apiKey))
  );

  return { variants };
}

async function generateVariant(concept: ConceptDirection, apiKey: string): Promise<CopyVariant> {
  const prompt = `Write ad copy for this creative concept:

Angle: ${concept.angle}
Subject: ${concept.subjectType}
Action: ${concept.action}
Environment: ${concept.environment}
Mood: ${concept.desiredMood}
Starting headline: ${concept.overlayIntent.headline}
Starting CTA: ${concept.overlayIntent.cta}

Return ONLY valid JSON, no markdown fences:
{
  "headline": "max 8 words — direct, human",
  "subheadline": "max 12 words — adds context, not repetition",
  "bullets": ["benefit — concrete, max 8 words", "benefit — concrete, max 8 words", "benefit — concrete, max 8 words"],
  "cta": "max 4 words"
}

Rules:
- No fluff words (powerful, seamless, revolutionary, game-changing, unlock)
- Headline and subheadline must not repeat each other
- Bullets are benefits, not features
- Sounds like a real human wrote it`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Copy generation failed for ${concept.id} (${response.status}): ${err}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error(`Copy generation returned empty response for ${concept.id}`);

  let raw: { headline: string; subheadline: string; bullets: string[]; cta: string };
  try {
    raw = safeParseJson(content);
  } catch {
    // Fallback: use the starting values from creative generation
    return {
      conceptId: concept.id,
      headline: concept.overlayIntent.headline,
      subheadline: concept.desiredMood,
      bullets: [concept.action, concept.environment, concept.angle],
      cta: concept.overlayIntent.cta,
      disclaimer: concept.overlayIntent.disclaimer ?? "",
    };
  }

  return {
    conceptId: concept.id,
    headline: raw.headline ?? concept.overlayIntent.headline,
    subheadline: raw.subheadline ?? "",
    bullets: Array.isArray(raw.bullets) ? raw.bullets : [],
    cta: raw.cta ?? concept.overlayIntent.cta,
    disclaimer: concept.overlayIntent.disclaimer ?? "",
  };
}
