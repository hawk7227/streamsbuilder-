import type { ConceptDirection, IntakeBrief, OverlayIntent, StrategyOutput, ValidationResult, ValidatorImagePolicy } from "../../media-realism/types";
import { REALISM_RULESET_VERSION } from "../../media-realism/realismPolicy";

export const TELEHEALTH_APPROVED_FACTS = [
  "Licensed clinicians review patient information.",
  "Secure intake may be completed online.",
  "Treatment decisions depend on clinician review.",
  "Some cases may require follow-up before treatment.",
];

export function createStrategyFromIntake(intake: IntakeBrief): StrategyOutput {
  const baseOverlayIntent = buildOverlayIntent();
  const concepts: ConceptDirection[] = [
    {
      id: "concept-1",
      angle: "private digital care",
      hook: intake.sceneContext ?? intake.campaignObjective ?? "ordinary moment",
      subjectType: "patient",
      action: "sitting at home using a smartphone calmly",
      environment: "real living room with ordinary household detail",
      realismMode: "home_real",
      desiredMood: "calm, reassured, ordinary",
      overlayIntent: baseOverlayIntent,
    },
    {
      id: "concept-2",
      angle: "clinician review",
      hook: intake.audienceSegment ?? "real person in ordinary situation",
      subjectType: "doctor",
      action: "reviewing a case on a computer in a clinic office",
      environment: "believable clinic office",
      realismMode: "clinical_real",
      desiredMood: "focused, professional, natural",
      overlayIntent: baseOverlayIntent,
    },
    {
      id: "concept-3",
      angle: "follow-up communication",
      hook: "ordinary moment — real person, real place",
      subjectType: "patient",
      action: "speaking on a phone at home",
      environment: "ordinary living room with believable detail",
      realismMode: "human_lifestyle_real",
      desiredMood: "comfortable, human, real",
      overlayIntent: baseOverlayIntent,
    },
  ];

  return {
    runId: crypto.randomUUID(),
    strategySummary: "ordinary real-life moment — not staged, not advertising",
    conceptDirections: concepts,
    rulesetVersion: REALISM_RULESET_VERSION,
  };
}

export function createValidatorImagePolicy(): ValidatorImagePolicy {
  return {
    allowedVisualClaims: ["human presence", "device use", "clinician review", "home setting", "clinic setting"],
    forbiddenVisualClaims: ["guaranteed outcome", "diagnosis certainty", "cure claim", "instant treatment guarantee"],
    forbiddenProps: ["gibberish text panels", "floating ui cards inside image"],
    forbiddenScenes: ["surgical procedure", "medical emergency", "diagnostic device claim visual"],
    noTextInImage: true,
  };
}

export function createTelehealthValidationResult(): ValidationResult {
  return {
    status: "pass",
    issues: [],
    imagePolicy: createValidatorImagePolicy(),
  };
}

function buildOverlayIntent(): OverlayIntent {
  return {
    headline: "",
    cta: "",
    disclaimer: "Clinician review required.",
    textDensityHint: "medium",
    titleLengthClass: "medium",
    ctaLengthClass: "short",
  };
}
