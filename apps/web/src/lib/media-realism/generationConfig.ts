/**
 * generationConfig.ts
 *
 * All provider settings driven by environment variables.
 * No hardcoded model, quality, or candidate count.
 */

export const generationConfig = {
  image: {
    model: process.env.IMAGE_MODEL ?? "dall-e-3",
    quality: (process.env.IMAGE_QUALITY ?? "standard") as "standard" | "hd",
    candidates: Number(process.env.IMAGE_CANDIDATES ?? "4"),
    maxAttempts: Number(process.env.IMAGE_MAX_ATTEMPTS ?? "3"),
  },
  video: {
    maxDurationSeconds: Number(process.env.VIDEO_MAX_SECONDS ?? "5"),
    provider: process.env.VIDEO_PROVIDER ?? "kling",
  },
} as const;
