import type { CopyGenerationOutput, ValidationIssue, ValidationResult } from "../../media-realism/types";
import { createValidatorImagePolicy } from "../governance/telehealth";

const BLOCKED_PATTERNS = [/\bcure\b/i, /\bguarantee\b/i, /\bdiagnose\b/i, /\binstant treatment\b/i];

export function validateCopy(copy: CopyGenerationOutput): ValidationResult {
  const issues: ValidationIssue[] = [];

  for (const variant of copy.variants) {
    if (variant.headline.trim().split(/\s+/).length > 8) {
      issues.push({ code: "headline_too_long", message: `Headline too long for ${variant.conceptId}`, severity: "softFail" });
    }
    if (variant.cta.trim().split(/\s+/).length > 4) {
      issues.push({ code: "cta_too_long", message: `CTA too long for ${variant.conceptId}`, severity: "softFail" });
    }

    const combined = [variant.headline, variant.subheadline, variant.bullets.join(" "), variant.cta, variant.disclaimer].join(" ");
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(combined)) {
        issues.push({ code: "blocked_claim", message: `Blocked phrase found in ${variant.conceptId}: ${pattern}`, severity: "block" });
      }
    }
  }

  const hasBlock = issues.some((issue) => issue.severity === "block");
  const hasSoftFail = issues.some((issue) => issue.severity === "softFail");

  return {
    status: hasBlock ? "block" : hasSoftFail ? "softFail" : "pass",
    issues,
    imagePolicy: createValidatorImagePolicy(),
  };
}
