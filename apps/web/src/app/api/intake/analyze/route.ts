import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { url?: string; content?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { url, content } = body;
  if (!url && !content) return NextResponse.json({ error: "url or content required" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });

  const toAnalyze = content ?? `URL: ${url}`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: `Analyze this content and extract brand/marketing signals. Return JSON only:
{
  "brandName": "",
  "brandTone": "",
  "targetAudience": "",
  "keyMessages": [],
  "colorPalette": {},
  "layoutPattern": "",
  "toneOfVoice": "",
  "duplicateLayoutSuggestion": "",
  "summary": ""
}

Content:
${toAnalyze.slice(0, 8000)}`,
      }],
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: `OpenAI failed: ${res.status}` }, { status: 500 });
  }

  const data = await res.json() as { choices: [{ message: { content: string } }] };
  const raw = data.choices[0]?.message?.content ?? "{}";
  let analysis: Record<string, unknown> = {};
  try { analysis = JSON.parse(raw); } catch { analysis = { summary: raw }; }

  return NextResponse.json({ ok: true, url, analysis, summary: analysis.summary ?? "" });
}
