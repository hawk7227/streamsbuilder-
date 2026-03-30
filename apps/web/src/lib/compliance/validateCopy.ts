/**
 * validateCopy.ts
 *
 * Config-driven copy validator.
 * Policy is passed per run — no niche assumed.
 */

import type { CopyGenerationOutput, ValidationIssue, ValidationResult } from "../media-realism/types";
import type { CompliancePolicy } from "./compliancePolicy";
import { toValidatorImagePolicy } from "./compliancePolicy";

export function validateCopyWithPolicy(
  copy: CopyGenerationOutput,
  policy: CompliancePolicy,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  for (const variant of copy.variants) {
    const headlineWords = variant.headline.trim().split(/\s+/).filter(Boolean).length;
    const ctaWords = variant.cta.trim().split(/\s+/).filter(Boolean).length;
    const subheadlineWords = variant.subheadline.trim().split(/\s+/).filter(Boolean).length;

    if (headlineWords > policy.maxHeadlineWords) {
      issues.push({ code: "headline_too_long", message: `Headline too long (${headlineWords} words) for ${variant.conceptId}`, severity: "softFail" });
    }
    if (ctaWords > policy.maxCtaWords) {
      issues.push({ code: "cta_too_long", message: `CTA too long (${ctaWords} words) for ${variant.conceptId}`, severity: "softFail" });
    }
    if (subheadlineWords > policy.maxSubheadlineWords) {
      issues.push({ code: "subheadline_too_long", message: `Subheadline too long for ${variant.conceptId}`, severity: "softFail" });
    }

    const combined = [variant.headline, variant.subheadline, variant.bullets.join(" "), variant.cta, variant.disclaimer].join(" ").toLowerCase();

    for (const phrase of policy.blockedPhrases) {
      if (combined.includes(phrase.toLowerCase())) {
        issues.push({ code: "blocked_phrase", message: `Blocked phrase "${phrase}" found in ${variant.conceptId}`, severity: "block" });
      }
    }
  }

  const hasBlock = issues.some(i => i.severity === "block");
  const hasSoftFail = issues.some(i => i.severity === "softFail");

  return {
    status: hasBlock ? "block" : hasSoftFail ? "softFail" : "pass",
    issues,
    imagePolicy: toValidatorImagePolicy(policy),
  };
}
