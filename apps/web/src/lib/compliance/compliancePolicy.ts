/**
 * compliancePolicy.ts
 *
 * Config-driven compliance policy. Passed per run.
 * No niche assumptions. No hardcoded blocked phrases.
 * The runner decides what is blocked based on campaign type.
 */

import type { ValidatorImagePolicy } from "../media-realism/types";

export interface CompliancePolicy {
  blockedPhrases: string[];
  maxHeadlineWords: number;
  maxCtaWords: number;
  maxSubheadlineWords: number;
  forbiddenVisualClaims: string[];
  forbiddenProps: string[];
  forbiddenScenes: string[];
  allowedVisualClaims: string[];
}

/** Universal baseline — no niche assumptions */
export const UNIVERSAL_POLICY: CompliancePolicy = {
  blockedPhrases: [],
  maxHeadlineWords: 12,
  maxCtaWords: 5,
  maxSubheadlineWords: 20,
  forbiddenVisualClaims: [],
  forbiddenProps: ["floating ui cards inside image", "gibberish text panels"],
  forbiddenScenes: [],
  allowedVisualClaims: ["human presence", "device use", "everyday setting"],
};

/** Healthcare / telehealth compliance add-on — applied only when niche requires it */
export const HEALTHCARE_COMPLIANCE: Partial<CompliancePolicy> = {
  blockedPhrases: ["guaranteed cure", "instant prescription", "diagnosis in minutes", "cure fast", "no questions asked"],
  forbiddenVisualClaims: ["guaranteed outcome", "diagnosis certainty", "cure claim", "instant treatment guarantee"],
  forbiddenScenes: ["surgical procedure", "medical emergency", "diagnostic device claim visual"],
};

/** E-commerce compliance add-on */
export const ECOMMERCE_COMPLIANCE: Partial<CompliancePolicy> = {
  blockedPhrases: ["guaranteed results", "miracle", "instant results"],
  forbiddenVisualClaims: ["before/after medical claim"],
  forbiddenScenes: [],
};

export function buildPolicy(base: CompliancePolicy = UNIVERSAL_POLICY, ...addons: Partial<CompliancePolicy>[]): CompliancePolicy {
  return addons.reduce<CompliancePolicy>((policy, addon) => ({
    blockedPhrases: [...policy.blockedPhrases, ...(addon.blockedPhrases ?? [])],
    maxHeadlineWords: addon.maxHeadlineWords ?? policy.maxHeadlineWords,
    maxCtaWords: addon.maxCtaWords ?? policy.maxCtaWords,
    maxSubheadlineWords: addon.maxSubheadlineWords ?? policy.maxSubheadlineWords,
    forbiddenVisualClaims: [...policy.forbiddenVisualClaims, ...(addon.forbiddenVisualClaims ?? [])],
    forbiddenProps: [...policy.forbiddenProps, ...(addon.forbiddenProps ?? [])],
    forbiddenScenes: [...policy.forbiddenScenes, ...(addon.forbiddenScenes ?? [])],
    allowedVisualClaims: [...policy.allowedVisualClaims, ...(addon.allowedVisualClaims ?? [])],
  }), base);
}

export function toValidatorImagePolicy(policy: CompliancePolicy): ValidatorImagePolicy {
  return {
    allowedVisualClaims: policy.allowedVisualClaims,
    forbiddenVisualClaims: policy.forbiddenVisualClaims,
    forbiddenProps: policy.forbiddenProps,
    forbiddenScenes: policy.forbiddenScenes,
    noTextInImage: true,
  };
}
