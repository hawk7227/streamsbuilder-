import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { textToSpeech, listVoices } from "@/lib/voice/tts";

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    text?: string;
    voiceId?: string;
    provider?: "elevenlabs" | "openai" | "auto";
    speed?: number;
    stability?: number;
    similarity?: number;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.text?.trim()) return NextResponse.json({ error: "text is required" }, { status: 400 });
  if (body.text.length > 5000) return NextResponse.json({ error: "Text too long. Max 5000 chars." }, { status: 400 });

  try {
    const result = await textToSpeech(body.text, {
      voiceId:    body.voiceId,
      provider:   body.provider ?? "auto",
      speed:      body.speed,
      stability:  body.stability,
      similarity: body.similarity,
    });

    const base64 = result.audio.toString("base64");
    return NextResponse.json({
      ok: true,
      provider: result.provider,
      mimeType: result.mimeType,
      audio: `data:${result.mimeType};base64,${base64}`,
      size: result.audio.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "TTS failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const voices = await listVoices();
  return NextResponse.json({ data: voices });
}
