import type { ImagePolicyValidationInput, ValidationResult } from "../types";

const REQUIRED_MARKERS = [
  "real human face with slight natural asymmetry",
  "visible natural skin texture and pores",
  "candid non-model expression",
  "uneven natural lighting",
  "slightly imperfect composition",
  "not retouched",
  "not beauty photography",
  "not studio portrait",
];

const FORBIDDEN_MARKERS = [
  "beauty portrait",
  "studio portrait",
  "fashion photography",
  "editorial",
  "glamour",
  "flawless skin",
  "smooth skin",
  "retouched skin",
  "cgi",
  "render",
  "illustration",
  "3d render",
];

export function validateImagePromptPolicy(input: ImagePolicyValidationInput): ValidationResult {
  const issues: ValidationResult["issues"] = [];
  const finalPrompt = input.finalPrompt.toLowerCase();

  for (const forbidden of FORBIDDEN_MARKERS) {
    if (finalPrompt.includes(forbidden)) {
      issues.push({ code: "forbidden_image_marker", severity: "error", message: `Forbidden image style marker present: ${forbidden}` });
    }
  }

  for (const required of REQUIRED_MARKERS) {
    if (!finalPrompt.includes(required.toLowerCase())) {
      issues.push({ code: "missing_image_marker", severity: "warning", message: `Missing realism anchor: ${required}` });
    }
  }

  if (input.referencesUsed > 3) {
    issues.push({ code: "too_many_references", severity: "error", message: "More than 3 image references were supplied." });
  }

  return { ok: issues.every((issue) => issue.severity !== "error"), issues };
}
