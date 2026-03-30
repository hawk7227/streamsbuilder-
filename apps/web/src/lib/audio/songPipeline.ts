/**
 * songPipeline.ts — Song generation pipeline
 * Providers: Suno API (primary), Udio API (secondary)
 * Vocal extraction: documented as external UVR dependency
 * Export: wav/mp3/stems
 */

export interface SongGenerationOptions {
  prompt:       string;
  style?:       string;    // e.g. "pop", "jazz", "hip-hop"
  title?:       string;
  instrumental?: boolean;
  duration?:    number;    // seconds
  provider?:    "suno" | "udio" | "auto";
}

export interface SongResult {
  audioUrl:     string;
  title:        string;
  duration?:    number;
  provider:     string;
  stems?:       { vocals?: string; instrumental?: string };
  format:       string;
  jobId?:       string;   // for async providers
  status:       "completed" | "pending" | "failed";
}

// ── Suno API ──────────────────────────────────────────────────────────────

async function generateWithSuno(options: SongGenerationOptions): Promise<SongResult> {
  const apiKey = process.env.SUNO_API_KEY;
  if (!apiKey) throw new Error("SUNO_API_KEY not set. Add it to your environment variables.");

  const res = await fetch("https://api.suno.ai/v0/audio/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt:           options.prompt,
      make_instrumental: options.instrumental ?? false,
      title:            options.title ?? options.prompt.slice(0, 40),
      tags:             options.style ?? "",
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Suno API failed (${res.status}): ${err}`);
  }

  const data = await res.json() as {
    id?: string;
    audio_url?: string;
    title?: string;
    duration?: number;
    status?: string;
  };

  return {
    audioUrl: data.audio_url ?? "",
    title:    data.title ?? options.title ?? "Generated Song",
    duration: data.duration,
    provider: "suno",
    format:   "mp3",
    jobId:    data.id,
    status:   (data.status === "complete" ? "completed" : data.audio_url ? "completed" : "pending"),
  };
}

// ── Udio API ──────────────────────────────────────────────────────────────

async function generateWithUdio(options: SongGenerationOptions): Promise<SongResult> {
  const apiKey = process.env.UDIO_API_KEY;
  if (!apiKey) throw new Error("UDIO_API_KEY not set. Add it to your environment variables.");

  const res = await fetch("https://www.udio.com/api/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt:  options.prompt,
      tags:    [options.style].filter(Boolean),
      title:   options.title,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Udio API failed (${res.status}): ${err}`);
  }

  const data = await res.json() as {
    id?: string;
    song_path?: string;
    title?: string;
    duration?: number;
  };

  return {
    audioUrl: data.song_path ?? "",
    title:    data.title ?? options.title ?? "Generated Song",
    duration: data.duration,
    provider: "udio",
    format:   "mp3",
    jobId:    data.id,
    status:   data.song_path ? "completed" : "pending",
  };
}

// ── Auto-routing ──────────────────────────────────────────────────────────

export async function generateSong(options: SongGenerationOptions): Promise<SongResult> {
  const provider = options.provider ?? "auto";
  const hasSuno  = !!process.env.SUNO_API_KEY;
  const hasUdio  = !!process.env.UDIO_API_KEY;

  if (!hasSuno && !hasUdio) {
    throw new Error(
      "No song generation provider configured. " +
      "Add SUNO_API_KEY or UDIO_API_KEY to your environment variables."
    );
  }

  if (provider === "suno" || (provider === "auto" && hasSuno)) {
    try { return await generateWithSuno(options); } catch (e) {
      if (provider === "suno") throw e;
    }
  }

  if (provider === "udio" || (provider === "auto" && hasUdio)) {
    return await generateWithUdio(options);
  }

  throw new Error("No available song provider");
}

// ── Vocal extraction note ─────────────────────────────────────────────────
// UVR (Ultimate Vocal Remover) requires a Python runtime with GPU support.
// Integration point: POST to an external UVR microservice at VOCAL_EXTRACTOR_URL
// Returns: { vocals: url, instrumental: url }

export async function extractVocals(
  audioUrl: string
): Promise<{ vocals: string; instrumental: string } | null> {
  const serviceUrl = process.env.VOCAL_EXTRACTOR_URL;
  if (!serviceUrl) return null; // Document requirement, don't fail

  try {
    const res = await fetch(`${serviceUrl}/separate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ audio_url: audioUrl }),
      signal:  AbortSignal.timeout(120000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { vocals?: string; instrumental?: string };
    if (!data.vocals || !data.instrumental) return null;
    return { vocals: data.vocals, instrumental: data.instrumental };
  } catch { return null; }
}
