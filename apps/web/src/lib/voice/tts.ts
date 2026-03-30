/**
 * tts.ts — Text-to-Speech (ElevenLabs + OpenAI fallback)
 * Supports: voice listing, streaming audio, voice selection, stop signal.
 */

export interface Voice {
  id:          string;
  name:        string;
  previewUrl?: string;
  category?:   string;
}

export interface TtsOptions {
  voiceId?:    string;
  model?:      string;
  stability?:  number;      // 0-1
  similarity?: number;      // 0-1
  style?:      number;      // 0-1
  speed?:      number;      // 0.7-1.2
}

// ── ElevenLabs voice list ─────────────────────────────────────────────────

export async function listVoices(): Promise<Voice[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { voices: Array<{ voice_id: string; name: string; preview_url?: string; category?: string }> };
    return data.voices.map(v => ({
      id:         v.voice_id,
      name:       v.name,
      previewUrl: v.preview_url,
      category:   v.category,
    }));
  } catch { return []; }
}

// ── ElevenLabs TTS ────────────────────────────────────────────────────────

export async function textToSpeechElevenLabs(
  text: string,
  options?: TtsOptions
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

  const voiceId = options?.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? "jqcCZkN6Knx8BJ5TBdYR";
  const model   = options?.model   ?? "eleven_turbo_v2_5";

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: {
        stability:        options?.stability  ?? 0.5,
        similarity_boost: options?.similarity ?? 0.75,
        style:            options?.style      ?? 0.0,
        speed:            options?.speed      ?? 1.0,
      },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${err}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// ── OpenAI TTS fallback ───────────────────────────────────────────────────

export async function textToSpeechOpenAI(
  text: string,
  options?: { voice?: string; speed?: number }
): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model:  "tts-1-hd",
      input:  text.slice(0, 4096),
      voice:  options?.voice ?? "alloy",
      speed:  options?.speed ?? 1.0,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`OpenAI TTS failed (${res.status}): ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Auto-routing TTS ──────────────────────────────────────────────────────

export async function textToSpeech(
  text: string,
  options?: TtsOptions & { provider?: "elevenlabs" | "openai" | "auto" }
): Promise<{ audio: Buffer; provider: string; mimeType: string }> {
  const provider = options?.provider ?? "auto";
  const hasEL    = !!process.env.ELEVENLABS_API_KEY;

  if (provider === "elevenlabs" || (provider === "auto" && hasEL)) {
    try {
      const audio = await textToSpeechElevenLabs(text, options);
      return { audio, provider: "elevenlabs", mimeType: "audio/mpeg" };
    } catch (e) {
      if (provider === "elevenlabs") throw e;
      // fallthrough to OpenAI
    }
  }

  const audio = await textToSpeechOpenAI(text, { voice: "alloy", speed: options?.speed });
  return { audio, provider: "openai", mimeType: "audio/mpeg" };
}
