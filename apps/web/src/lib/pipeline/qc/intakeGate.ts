import type { IntakeBrief } from "../../media-realism/types";

export interface IntakeGateResult {
  valid: boolean;
  errors: string[];
}

export function validateIntakeBrief(input: Partial<IntakeBrief>): IntakeGateResult {
  const errors: string[] = [];

  if (!input.targetPlatform) errors.push("targetPlatform is required");
  // sceneContext or campaignObjective must be present — one or the other
  const hasContext = (input.sceneContext && input.sceneContext.trim().length >= 10)
    || (input.campaignObjective && input.campaignObjective.trim().length >= 10);
  if (!hasContext) errors.push("sceneContext (or campaignObjective) must be at least 10 characters");

  // Ad-framing fields are now optional — do not block if missing
  // funnelStage, proofTypeAllowed, audienceSegment, brandVoiceStatement, approvedFacts
  // are kept for backward compat but no longer required

  return {
    valid: errors.length === 0,
    errors,
  };
}
