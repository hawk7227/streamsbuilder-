/**
 * POST /api/ideas/image
 * Returns 3–6 AI-generated image prompt ideas via GPT-4o.
 * Ideas are text only — never sent directly to image models.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { context?: string; template?: string; niche?: string };
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });

  const systemPrompt = `You generate realistic image prompt ideas for advertising content.
Rules:
- Each idea must describe a real, ordinary, believable scene
- No cinematic language, no beauty/luxury language, no abstract concepts
- Subjects must be real people in real environments doing real things
- Return ONLY a JSON array of 5 strings — no markdown, no preamble`;

  const userPrompt = `Generate 5 distinct image prompt ideas.
${body.context ? `Context: ${body.context}` : ""}
${body.template ? `Template style: ${body.template}` : ""}
${body.niche ? `Niche: ${body.niche}` : ""}

Each idea must be a specific, vivid scene description (1–2 sentences).
Vary the setting, subject, and mood across the 5 ideas.
Return ONLY a JSON array: ["idea 1", "idea 2", "idea 3", "idea 4", "idea 5"]`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.85,
        max_tokens: 600,
      }),
    });
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content ?? "[]";
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const ideas = JSON.parse(cleaned) as string[];
    return NextResponse.json({ ideas: ideas.slice(0, 6) });
  } catch (e) {
    return NextResponse.json({ error: `Ideas generation failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
