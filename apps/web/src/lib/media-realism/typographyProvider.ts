/**
 * typographyProvider.ts
 *
 * Real typography compositor wiring. This file is NOT part of the spec —
 * it connects the spec's handleTypography stub to the existing
 * composeAssetWithTypography (Satori + Sharp) compositor and Supabase Storage.
 *
 * The spec's handleTypography in pipeline-execution.ts returns a URL
 * placeholder. This adapter performs the real composite and returns a
 * permanent Supabase Storage URL instead.
 */

import { composeAssetWithTypography } from "../pipeline/typography/compositeAsset";
import { uploadImageToSupabase } from "../supabase/storage";
import type { CopyGenerationOutput, IntakeBrief } from "./types";

export async function compositeAndUpload(
  imageUrl: string,
  copy: CopyGenerationOutput,
  intake: IntakeBrief,
): Promise<string> {
  const primary = copy.variants[0];

  const governance = {
    pipelineType: "telehealth" as const,
    rulesetVersion: "universal-realism-v1",
    strategyPrompt: "",
    copyPrompt: "",
    validatorPrompt: "",
    imagePrompt: "",
    imageToVideo: "",
    brandVoiceDocument: {
      personality: [] as string[],
      notPersonality: [] as string[],
      approvedVocabulary: [] as string[],
      forbiddenVocabulary: [] as string[],
      toneScoringRubric: { warmth: "", clarity: "", credibility: "", frictionless: "" },
    },
    imageGenerationRules: {
      mandatoryNegativeElements: [] as string[],
      mandatoryPositiveAnchors: [] as string[],
      generationAttempts: 1 as number,
      handlingRule: "hands-not-visible-preferred" as const,
      platformCompositionRule: {} as Record<string, string>,
      ocrCheckRequired: true as boolean,
    },
    typographyLayer: {
      textMustNotBeInImage: true as boolean,
      overlayFields: ["headline", "cta", "disclaimer"] as string[],
    },
    qaInstruction: "",
    templatePrompt: "",
  };

  const intakeBrief = {
    targetPlatform: intake.targetPlatform,
    funnelStage: intake.funnelStage,
    proofTypeAllowed: intake.proofTypeAllowed,
    audienceSegment: intake.audienceSegment,
    campaignObjective: intake.campaignObjective,
    brandVoiceStatement: intake.brandVoiceStatement,
    approvedFacts: intake.approvedFacts,
    governanceNicheId: "telehealth",
  };

  // Map spec's CopyVariant (with conceptId) to compositor's CopyVariant (with id)
  const copyVariant = {
    id: primary.conceptId,
    headline: primary.headline,
    subheadline: primary.subheadline,
    bullets: primary.bullets,
    cta: primary.cta,
    microcopy: "",
    disclaimer: primary.disclaimer,
  };

  const result = await composeAssetWithTypography({
    rawImageUrl: imageUrl,
    copyVariant,
    governance: governance as unknown as Parameters<typeof composeAssetWithTypography>[0]["governance"],
    intakeBrief: intakeBrief as Parameters<typeof composeAssetWithTypography>[0]["intakeBrief"],
  });

  return uploadImageToSupabase(
    `data:image/jpeg;base64,${result.compositeBuffer.toString("base64")}`,
    "pipeline-composites",
  );
}
