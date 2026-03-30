import type { ValidationResult, VideoPolicyValidationInput } from "../types";

const REQUIRED_VIDEO_LOCKS = [
  "real-world motion only",
  "no face warping",
  "no mouth chatter",
  "no subject drift",
  "no rubber skin",
  "no artificial cinematic look",
];

export function validateVideoPromptPolicy(input: VideoPolicyValidationInput): ValidationResult {
  const issues: ValidationResult["issues"] = [];
  const finalPrompt = input.finalPrompt.toLowerCase();
  const negativePrompt = input.negativePrompt.toLowerCase();

  for (const required of REQUIRED_VIDEO_LOCKS) {
    if (!finalPrompt.includes(required.toLowerCase()) && !negativePrompt.includes(required.toLowerCase())) {
      issues.push({ code: "missing_video_lock", severity: "warning", message: `Missing video lock: ${required}` });
    }
  }

  if (/\b(cinematic|dramatic lighting|movie still|film look|editorial|fashion photography|glossy|luxury|polished)\b/i.test(finalPrompt)) {
    issues.push({ code: "forbidden_video_style", severity: "error", message: "Final video prompt still contains forbidden cinematic/style language." });
  }

  return { ok: issues.every((issue) => issue.severity !== "error"), issues };
}
