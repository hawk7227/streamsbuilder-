import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { transcribeAudio } from "@/lib/voice/stt";

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("audio") as File | null;
  if (!file) return NextResponse.json({ error: "No audio file provided" }, { status: 400 });

  const MAX_AUDIO = 25 * 1024 * 1024; // 25MB Whisper limit
  if (file.size > MAX_AUDIO) {
    return NextResponse.json({ error: "Audio file too large. Max 25MB." }, { status: 413 });
  }

  const language    = formData.get("language")    as string | null;
  const prompt      = formData.get("prompt")      as string | null;
  const timestamped = formData.get("timestamped") === "true";

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await transcribeAudio(buffer, file.name, {
      language:    language ?? undefined,
      prompt:      prompt ?? undefined,
      timestamped,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
