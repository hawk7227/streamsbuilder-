/**
 * governance/index.ts
 *
 * Compatibility layer. The spec's telehealth.ts no longer exports
 * TELEHEALTH_GOVERNANCE. This file reconstructs the ActiveGovernance
 * shape from what the spec does export, so callers in pipeline-execution.ts
 * and compositeAsset.ts continue to work without modification.
 *
 * Spec files are NOT modified.
 */

import { GOOGLE_ADS_GOVERNANCE, type GoogleAdsGovernance } from "./googleAds";
export { GOOGLE_ADS_GOVERNANCE, type GoogleAdsGovernance };

// Re-export spec functions
export {
  createStrategyFromIntake,
  createValidatorImagePolicy,
  createTelehealthValidationResult,
  TELEHEALTH_APPROVED_FACTS,
} from "./telehealth";

// Custom niche row from workspace_niches table
export type CustomNiche = {
  id: string;
  name: string;
  pipeline_type: string;
  brand_tone: string | null;
  approved_facts: string[];
  banned_phrases: string[];
  strategy_prompt: string | null;
  copy_prompt: string | null;
  validator_prompt: string | null;
  image_prompt: string | null;
  image_to_video: string | null;
  qa_instruction: string | null;
  ruleset_version: string;
};

// The canonical governance shape used by the pipeline engine
export type ActiveGovernance = {
  pipelineType: string;
  rulesetVersion: string;
  brandTone: string;
  approvedFacts: string[];
  bannedPhrases: string[];
  complianceLayer: Record<string, boolean>;
  enforcementConfig: {
    fieldLengthEnforcement: Record<string, number>;
    blockTriggers: string[];
    autoFix: { enabled: boolean; maxAttempts: number; allowedFor: string[]; disallowedFor: string[] };
  };
  motionPlanRules: {
    allowedMotions: string[];
    bannedMotions: string[];
    durationDefaults: { minSeconds: number; maxSeconds: number };
  };
  variantRules: { count: number; variantIds: string[]; eachMustHave: string[]; differentiation: string };
  strategyPrompt: string;
  copyPrompt: string;
  validatorPrompt: string;
  imagePrompt: string;
  imageToVideo: string;
  qaInstruction: string;
};

// Telehealth base governance — reconstructed from spec constants
// since TELEHEALTH_GOVERNANCE is no longer exported by the spec's telehealth.ts
const GENERAL_BASE: ActiveGovernance = {
  pipelineType: "general",
  rulesetVersion: "universal-realism-v1",
  brandTone: "Clear, direct, benefit-focused. Adapt to niche context.",
  approvedFacts: [
    "Licensed clinicians review patient information.",
    "Secure intake may be completed online.",
    "Treatment decisions depend on clinician review.",
    "Some cases may require follow-up before treatment.",
  ],
  bannedPhrases: [
    "guaranteed cure", "instant prescription", "diagnosis in minutes",
    "miracle", "cure fast", "guaranteed", "no questions asked",
    "skip the doctor", "emergency treatment",
  ],
  complianceLayer: {
    noDiagnosticClaims: true,
    noGuarantees: true,
    noOutcomePromises: true,
    noPrescriptionCertainty: true,
    noEmergencyCareImplication: true,
    privacySafe: true,
  },
  enforcementConfig: {
    fieldLengthEnforcement: {
      headlineMaxWords: 8,
      subheadlineMaxWords: 20,
      bulletMaxCount: 3,
      bulletMaxWords: 8,
      ctaMaxWords: 4,
      microcopyMaxWords: 12,
      disclaimerMaxWords: 18,
    },
    blockTriggers: [
      "medical diagnosis claim", "guaranteed outcome",
      "banned phrase usage", "prescription certainty claim",
    ],
    autoFix: {
      enabled: true,
      maxAttempts: 2,
      allowedFor: ["capitalization", "minor trim"],
      disallowedFor: ["medical claim change", "outcome implication"],
    },
  },
  motionPlanRules: {
    allowedMotions: ["slow push-in", "gentle parallax", "natural blink"],
    bannedMotions: ["face warping", "mouth chatter", "subject drift", "camera whip"],
    durationDefaults: { minSeconds: 3, maxSeconds: 5 },
  },
  variantRules: {
    count: 3,
    variantIds: ["v1", "v2", "v3"],
    eachMustHave: ["headline", "subheadline", "cta", "disclaimer"],
    differentiation: "Each concept targets a different audience angle.",
  },
  strategyPrompt: "Generate ordinary real-life scene descriptions. Not advertising. Not staged. Not visually impressive.",
  copyPrompt: "Generate compliant telehealth copy variants. Avoid diagnostic claims, guarantees, or prescription certainty language.",
  validatorPrompt: "Validate copy for telehealth compliance. Block diagnostic claims, guarantees, and banned phrases.",
  imagePrompt: "Generate a realistic, unpolished image for telehealth advertising. Real person, ordinary setting, natural lighting.",
  imageToVideo: "Describe motion only. Slow push-in. Natural blink. Soft parallax. No face distortion. Max 5 seconds.",
  qaInstruction: "Final QA: verify all outputs are compliant, realism-first, and ready for human review.",
};

export function loadGovernance(
  nicheId: string,
  customNiches: CustomNiche[] = [],
): ActiveGovernance {
  if (nicheId === "telehealth" || nicheId === "telehealth-master") {
    return { ...GENERAL_BASE };
  }
  if (nicheId === "google_ads") {
    return governanceToActive(GOOGLE_ADS_GOVERNANCE);
  }

  const custom = customNiches.find(n => n.id === nicheId || n.pipeline_type === nicheId);
  if (!custom) {
    console.warn(`[Governance] Niche "${nicheId}" not found — falling back to general defaults`);
    return { ...GENERAL_BASE };
  }

  return {
    ...GENERAL_BASE,
    pipelineType: custom.pipeline_type,
    rulesetVersion: custom.ruleset_version,
    brandTone: custom.brand_tone ?? GENERAL_BASE.brandTone,
    approvedFacts: custom.approved_facts.length > 0 ? custom.approved_facts : GENERAL_BASE.approvedFacts,
    bannedPhrases: custom.banned_phrases.length > 0 ? custom.banned_phrases : GENERAL_BASE.bannedPhrases,
    strategyPrompt: custom.strategy_prompt ?? GENERAL_BASE.strategyPrompt,
    copyPrompt: custom.copy_prompt ?? GENERAL_BASE.copyPrompt,
    validatorPrompt: custom.validator_prompt ?? GENERAL_BASE.validatorPrompt,
    imagePrompt: custom.image_prompt ?? GENERAL_BASE.imagePrompt,
    imageToVideo: custom.image_to_video ?? GENERAL_BASE.imageToVideo,
    qaInstruction: custom.qa_instruction ?? GENERAL_BASE.qaInstruction,
  };
}

function governanceToActive(g: typeof GOOGLE_ADS_GOVERNANCE): ActiveGovernance {
  return {
    pipelineType: g.pipelineType,
    rulesetVersion: g.rulesetVersion,
    brandTone: g.brandTone,
    approvedFacts: [...g.approvedFacts],
    bannedPhrases: [...g.bannedPhrases],
    complianceLayer: { ...g.complianceLayer } as Record<string, boolean>,
    enforcementConfig: {
      fieldLengthEnforcement: { ...g.enforcementConfig.fieldLengthEnforcement } as Record<string, number>,
      blockTriggers: [...g.enforcementConfig.blockTriggers],
      autoFix: {
        enabled: g.enforcementConfig.autoFix.enabled,
        maxAttempts: g.enforcementConfig.autoFix.maxAttempts,
        allowedFor: [...g.enforcementConfig.autoFix.allowedFor],
        disallowedFor: [...g.enforcementConfig.autoFix.disallowedFor],
      },
    },
    motionPlanRules: {
      allowedMotions: [...g.motionPlanRules.allowedMotions],
      bannedMotions: [...g.motionPlanRules.bannedMotions],
      durationDefaults: { ...g.motionPlanRules.durationDefaults },
    },
    variantRules: "variantRules" in g
      ? {
          count: (g as typeof GOOGLE_ADS_GOVERNANCE & { variantRules: { count: number; variantIds: string[]; eachMustHave: string[]; differentiation: string } }).variantRules.count,
          variantIds: [...(g as typeof GOOGLE_ADS_GOVERNANCE & { variantRules: { count: number; variantIds: string[]; eachMustHave: string[]; differentiation: string } }).variantRules.variantIds],
          eachMustHave: [...(g as typeof GOOGLE_ADS_GOVERNANCE & { variantRules: { count: number; variantIds: string[]; eachMustHave: string[]; differentiation: string } }).variantRules.eachMustHave],
          differentiation: (g as typeof GOOGLE_ADS_GOVERNANCE & { variantRules: { count: number; variantIds: string[]; eachMustHave: string[]; differentiation: string } }).variantRules.differentiation,
        }
      : { count: 3, variantIds: ["v1", "v2", "v3"], eachMustHave: [], differentiation: "" },
    strategyPrompt: g.strategyPrompt,
    copyPrompt: g.copyPrompt,
    validatorPrompt: g.validatorPrompt,
    imagePrompt: g.imagePrompt,
    imageToVideo: g.imageToVideo,
    qaInstruction: g.qaInstruction,
  };
}
