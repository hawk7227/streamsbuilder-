/**
 * stt.ts — Speech-to-Text via OpenAI Whisper
 * Accepts audio buffer, returns transcript text.
 */

export interface TranscriptResult {
  text:     string;
  language?: string;
  duration?: number;
  segments?: Array<{ start: number; end: number; text: string }>;
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string,
  options?: {
    language?:    string;  // ISO 639-1 code e.g. "en"
    prompt?:      string;  // context hint for better accuracy
    timestamped?: boolean; // return word-level timestamps
  }
): Promise<TranscriptResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const form = new FormData();
  form.append("model", "whisper-1");
  const safeBuffer = Buffer.from(audioBuffer) as Buffer;
  const audioArray = new Uint8Array(safeBuffer);
  const audioBlob = new Blob([audioArray]);
  form.append("file", audioBlob, filename);
  form.append("response_format", options?.timestamped ? "verbose_json" : "json");
  if (options?.language) form.append("language", options.language);
  if (options?.prompt)   form.append("prompt", options.prompt);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper failed (${res.status}): ${err}`);
  }

  const data = await res.json() as {
    text: string;
    language?: string;
    duration?: number;
    segments?: Array<{ start: number; end: number; text: string }>;
  };

  return {
    text:     data.text,
    language: data.language,
    duration: data.duration,
    segments: data.segments,
  };
}
