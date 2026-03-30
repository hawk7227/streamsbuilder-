/**
 * POST /api/ideas/video
 * Returns 3–6 AI-generated video prompt ideas via GPT-4o.
 * Ideas are text only — never sent directly to video models.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { context?: string; template?: string; mode?: "t2v" | "i2v" };
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });

  const isI2V = body.mode === "i2v";

  const systemPrompt = `You generate realistic video prompt ideas for advertising content.
Rules:
- Each idea must describe real, ordinary motion — no cinematic, no dramatic, no stylized
- ${isI2V ? "Motion descriptions only: describe what moves and how subtly (for image-to-video)" : "Full scene descriptions with natural motion"}
- No slow-motion, no epic camera moves, no dramatic lighting changes
- Return ONLY a JSON array of 5 strings — no markdown, no preamble`;

  const userPrompt = `Generate 5 distinct video prompt ideas.
Mode: ${isI2V ? "Image-to-video (describe subtle motion only)" : "Text-to-video (describe the full scene and motion)"}
${body.context ? `Context: ${body.context}` : ""}
${body.template ? `Template style: ${body.template}` : ""}

Each idea must be specific and describe natural, real-world motion.
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
