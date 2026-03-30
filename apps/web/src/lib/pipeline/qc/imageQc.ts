import { buildLayoutPlan } from "../../media-realism/layoutPlanner";
import { compileRealismPrompt } from "../../media-realism/promptCompiler";
import { buildScenePlan } from "../../media-realism/scenePlanner";
import { scoreImageCandidate, shouldRejectImageCandidate } from "../../media-realism/imageQc";
import { selectBestImageCandidate } from "../../media-realism/candidateSelector";
import { generateImageCandidatesFromProvider } from "../../media-realism/generationClient";
import type {
  AspectRatio,
  ConceptDirection,
  GeneratedImageCandidate,
  ImageGenerationResult,
  ImageQcScore,
  OverlayIntent,
  ValidationResult,
} from "../../media-realism/types";

export function validateAndAugmentImagePrompt(params: {
  concept: ConceptDirection;
  validator: ValidationResult;
  aspectRatio: AspectRatio;
  overlayIntent: OverlayIntent;
}) {
  const scenePlan = buildScenePlan(params.concept, params.validator);
  const layoutPlan = buildLayoutPlan(scenePlan, params.overlayIntent, params.aspectRatio);
  const prompt = compileRealismPrompt({
    scenePlan,
    layoutPlan,
    validatorPolicy: params.validator.imagePolicy,
    overlayIntent: params.overlayIntent,
  });

  return { scenePlan, layoutPlan, prompt };
}

export async function runImageGenerationWithQc(params: {
  concept: ConceptDirection;
  validator: ValidationResult;
  aspectRatio: AspectRatio;
  overlayIntent: OverlayIntent;
  maxAttempts?: number;
}): Promise<ImageGenerationResult> {
  const { scenePlan, layoutPlan, prompt } = validateAndAugmentImagePrompt(params);
  const maxAttempts = params.maxAttempts ?? 3;
  const rejectedCandidates: ImageGenerationResult["rejectedCandidates"] = [];
  let allAccepted: Array<{ candidate: GeneratedImageCandidate; score: ImageQcScore }> = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const candidates = await generateImageCandidatesFromProvider({
      prompt,
      aspectRatio: params.aspectRatio,
      attempts: 4,
    });

    const batchScores = candidates.map((candidate) => ({
      candidate: {
        ...candidate,
        attempt,
        ocrText: runOcrGate(candidate.url),
      },
      score: scoreImageCandidate({ ...candidate, attempt, ocrText: runOcrGate(candidate.url) }, scenePlan, layoutPlan),
    }));

    for (const scored of batchScores) {
      if (shouldRejectImageCandidate(scored.score)) rejectedCandidates.push(scored);
      else allAccepted.push(scored);
    }

    if (allAccepted.length > 0) break;
  }

  if (allAccepted.length === 0) {
    return {
      accepted: false,
      rejectedCandidates,
      scenePlan,
      layoutPlan,
      finalPrompt: prompt,
      qcReport: {
        attempts: maxAttempts,
        blockReason: "All image candidates failed realism or OCR gates.",
      },
    };
  }

  const selected = selectBestImageCandidate(allAccepted);
  return {
    accepted: true,
    acceptedCandidate: selected.candidate,
    rejectedCandidates,
    scenePlan,
    layoutPlan,
    finalPrompt: prompt,
    qcReport: {
      attempts: maxAttempts,
      acceptedCandidateId: selected.candidate.id,
      acceptedScore: selected.score,
    },
  };
}

export function runOcrGate(imageUrl: string): string[] {
  if (/text=|overlay=|caption=|label=/i.test(imageUrl)) return ["detected_text_like_token"];
  return [];
}
