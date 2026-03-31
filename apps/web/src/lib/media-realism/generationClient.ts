import { ASPECT_RATIO_TO_SIZE, getVideoMotionPolicy } from "./realismPolicy";
import { generationConfig } from "./generationConfig";
import type { AspectRatio, GeneratedImageCandidate, VideoCandidate } from "./types";

const OPENAI_API_URL = "https://api.openai.com/v1/images/generations";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function generateImageCandidatesFromProvider(params: {
  prompt: string;
  aspectRatio: AspectRatio;
  attempts: number;
}): Promise<GeneratedImageCandidate[]> {
  const apiKey = requiredEnv("OPENAI_API_KEY");
  const size = ASPECT_RATIO_TO_SIZE[params.aspectRatio];
  const model = generationConfig.image.model;
  const quality = generationConfig.image.quality;

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: params.prompt,
      size,
      quality,
      n: params.attempts,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Image generation failed (${response.status}) model=${model}: ${errText}`);
  }

  const payload = (await response.json()) as { data?: Array<{ url?: string; b64_json?: string }> };
  return (payload.data ?? []).map((item, index) => ({
    id: `img-${Date.now()}-${index}`,
    url: item.url ?? `data:image/png;base64,${item.b64_json}`,
    promptUsed: params.prompt,
    attempt: index + 1,
    ocrText: [],
    metadata: {},
  }));
}

/**
 * generateVideoCandidatesFromProvider
 *
 * Real I2V implementation — delegates to lib/ai/index.ts which routes
 * to KlingProvider (image2video) or RunwayProvider (i2v) based on
 * AI_PROVIDER_I2V env var. Default: kling.
 *
 * Polls each submission to completion before returning.
 * Use pipeline-execution.ts handleVideo() for the full QC pipeline.
 * This function is the direct provider adapter for callers that need
 * VideoCandidate[] synchronously (e.g. one-off generation requests).
 */
export async function generateVideoCandidatesFromProvider(params: {
  sourceImageUrl: string;
  attempts: number;
}): Promise<VideoCandidate[]> {
  const { generateRealVideoCandidate } = await import("./videoProvider");
  const results = await Promise.allSettled(
    Array.from({ length: params.attempts }, (_, i) =>
      generateRealVideoCandidate(params.sourceImageUrl, i + 1)
    )
  );
  const successful = results
    .filter((r): r is PromiseFulfilledResult<VideoCandidate> => r.status === "fulfilled")
    .map(r => r.value);
  if (successful.length === 0) {
    throw new Error("All I2V candidate submissions failed — check KLING_API_KEY and KLING_ASSESS_API_KEY");
  }
  return successful;
}
