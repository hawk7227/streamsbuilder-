// Google Ads Telehealth Governance — rulesetVersion: google-ads-telehealth-v1
// Stricter field limits than organic content — Google Ads policy compliant

export const GOOGLE_ADS_GOVERNANCE = {
  pipelineType: "google_ads" as const,
  rulesetVersion: "google-ads-telehealth-v1",

  brandTone: "Direct, clear, benefit-led. No superlatives. No punctuation in headlines.",

  approvedFacts: [
    "Online intake available.",
    "Licensed provider review.",
    "Private digital experience.",
    "Next steps after review.",
    "Treatment when clinically appropriate.",
  ] as string[],

  bannedPhrases: [
    "guaranteed cure",
    "instant prescription",
    "diagnosis in minutes",
    "best doctor",
    "miracle",
    "cure fast",
    "guaranteed",
    "no questions asked",
    "skip the doctor",
    "emergency treatment",
  ] as string[],

  complianceLayer: {
    noDiagnosticClaims: true,
    noGuarantees: true,
    noOutcomePromises: true,
    noPrescriptionCertainty: true,
    noEmergencyCareImplication: true,
    noSuperlatives: true,          // Google Ads: no "best", "cheapest", "#1"
    noPunctuationInHeadlines: true, // Google Ads policy
    privacySafe: true,
  },

  enforcementConfig: {
    fieldLengthEnforcement: {
      headlineMaxChars: 30,      // Google Ads headline limit
      descriptionMaxChars: 90,   // Google Ads description limit
      headlineMaxWords: 5,       // Derived from 30-char limit
      bulletMaxCount: 0,         // No bullets in Google Ads
      ctaMaxWords: 2,
      microcopyMaxWords: 0,
      disclaimerMaxWords: 0,
    },
    blockTriggers: [
      "superlative claim",
      "medical diagnosis claim",
      "guaranteed outcome",
      "banned phrase usage",
      "headline exceeds 30 chars",
      "description exceeds 90 chars",
    ] as string[],
    autoFix: {
      enabled: true,
      maxAttempts: 2,
      allowedFor: ["capitalization", "punctuation removal from headlines", "minor trim"],
      disallowedFor: ["medical claim change", "outcome implication"],
    },
  },

  variantRules: {
    count: 3,
    variantIds: ["v1", "v2", "v3"],
    eachMustHave: ["headline1", "headline2", "headline3", "description1", "description2"],
    differentiation: "Each variant targets a different search intent: awareness, consideration, decision.",
  },

  motionPlanRules: {
    // Google Ads responsive display — static image preferred
    allowedMotions: ["none", "subtle fade"] as string[],
    bannedMotions: ["all video motion"] as string[],
    durationDefaults: { minSeconds: 0, maxSeconds: 0 },
  },

  strategyPrompt: `You are a senior Google Ads specialist for telehealth.

Build a search intent strategy for 3 ad variants.
No superlatives, no punctuation in headlines, no guaranteed outcomes.
Headlines ≤30 chars. Descriptions ≤90 chars.

Return ONLY valid JSON. No markdown, no preamble.`,

  copyPrompt: `You are a Google Ads copywriter for telehealth.

Write 3 compliant ad copy variants.

Hard limits:
- Each headline: ≤30 characters (not words)
- Each description: ≤90 characters
- 3 headlines + 2 descriptions per variant
- No punctuation at end of headlines (Google policy)
- No superlatives: no "best", "cheapest", "#1", "guaranteed"

Return ONLY valid JSON. No markdown, no preamble.`,

  validatorPrompt: `You are a Google Ads policy compliance validator for telehealth.

Check each field against Google Ads policy AND telehealth compliance rules.

Block if:
- Any headline exceeds 30 characters
- Any description exceeds 90 characters
- Any superlative detected
- Any punctuation at end of a headline
- Any medical claim, guarantee, or banned phrase

Return ONLY valid JSON. No markdown, no preamble.`,

  imagePrompt: `Generate a Google Display Ad image prompt.
Static image preferred. Clean, minimal healthcare setting.
No text overlays. No pills/syringes. Professional and calm.
Return as plain string.`,

  imageToVideo: "",
  qaInstruction: `Verify all Google Ads field limits and telehealth compliance. Return ONLY valid JSON.`,
} as const;

export type GoogleAdsGovernance = typeof GOOGLE_ADS_GOVERNANCE;
