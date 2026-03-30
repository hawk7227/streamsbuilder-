import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Provider knowledge base — injected into every prompt rewrite call
const PROVIDER_KNOWLEDGE_BASE = `
KLING T2V (kling_t2v): Max 50 words. Structure: Subject + Action + Environment + Camera + Mood.
  Always include: negative prompt (text overlays, distorted anatomy, fast motion, harsh lighting).
  Best for: subtle motion, face-forward premium scenes, telehealth/healthcare.

KLING I2V (kling_i2v): Max 40 words. Motion ONLY — never re-describe the image.
  Describe what moves and how. Avoid: lip sync, mouth movement, extreme morphing.
  Best for: adding gentle motion to a static brand image.

RUNWAY T2V (runway_t2v): Max 1000 chars. No separate negative prompts (embed as "avoid X").
  Structure: Scene → Subject → Action → Camera → Mood → Style.
  Best for: fast turnaround (30-90s), cinematic quality, stylised shots.

RUNWAY I2V (runway_i2v): Motion-only description. Focus on camera and subject movement.
  No re-description of existing image content.

COST ESTIMATES (standard mode):
  kling_t2v: $0.20 per 5s clip | kling_i2v: $0.20 per 5s clip
  runway_t2v: $0.20 per 5s clip | runway_i2v: $0.20 per 5s clip
  kling_image: $0.04 per image | dalle_image: $0.04 per image

TELEHEALTH MOTION RULES:
  Allowed: slow push-in, gentle pan, soft parallax, minor posture shift, natural blink, slight hand movement.
  Banned: fast zoom, whip pan, aggressive camera shake, face distortion, lip sync, mouth talking animation.
`.trim();

type PreviewPromptRequest = {
  rawPrompt: string;
  providerTarget: string;
  nicheId?: string;
  governanceContext?: string;
};

type PreviewPromptResponse = {
  originalIntent: string;
  rewrittenPrompt: string;
  negativePrompt: string;
  providerSelected: string;
  reasoning: string;
  warnings: string[];
  estimatedCost: number;
  mode: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Partial<PreviewPromptRequest>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { rawPrompt, providerTarget, governanceContext } = body;

  if (!rawPrompt || typeof rawPrompt !== "string") {
    return NextResponse.json({ error: "rawPrompt is required" }, { status: 400 });
  }
  if (!providerTarget || typeof providerTarget !== "string") {
    return NextResponse.json({ error: "providerTarget is required" }, { status: 400 });
  }

  const systemPrompt = `You are a professional AI prompt engineer specialising in video and image generation for regulated industries.

${PROVIDER_KNOWLEDGE_BASE}

${governanceContext ? `ACTIVE GOVERNANCE RULES:\n${governanceContext}\n` : ""}

Given a raw prompt intent and target provider, return ONLY a valid JSON object (no markdown, no backticks) with this exact shape:
{
  "originalIntent": "...",
  "rewrittenPrompt": "...",
  "negativePrompt": "...",
  "providerSelected": "...",
  "reasoning": "...",
  "warnings": [],
  "estimatedCost": 0.00,
  "mode": "standard"
}

Rules:
- rewrittenPrompt must follow provider word/char limits exactly
- negativePrompt: comma-separated, only for kling providers (empty string for runway)
- warnings: list any governance flags (e.g. banned motion detected, prompt too long)
- estimatedCost: numeric USD
- mode: always "standard" unless rawPrompt explicitly requests "pro"`;

  const userMessage = `Raw intent: "${rawPrompt}"\nTarget provider: ${providerTarget}`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OpenAI not configured" }, { status: 500 });

  const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.3,
      max_tokens: 800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!aiRes.ok) {
    const err = await aiRes.text();
    return NextResponse.json({ error: `OpenAI error: ${err}` }, { status: 502 });
  }

  const aiData = await aiRes.json() as { choices: { message: { content: string } }[] };
  const raw = aiData.choices?.[0]?.message?.content ?? "";

  let parsed: PreviewPromptResponse;
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(clean) as PreviewPromptResponse;
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response", raw }, { status: 500 });
  }

  return NextResponse.json({ data: parsed });
}
