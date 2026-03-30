import { createStrategyFromIntake } from "./governance/telehealth";
import { validateIntakeBrief } from "./qc/intakeGate";
import { validateCopy } from "./qc/copyValidator";
import { runImageGenerationWithQc } from "./qc/imageQc";
import { getDefaultAspectRatio, getVideoMotionPolicy } from "../media-realism/realismPolicy";
import { generateVideoCandidatesFromProvider } from "../media-realism/generationClient";
import { scoreVideoCandidate, shouldRejectVideoCandidate } from "../media-realism/videoQc";
import { selectBestVideoCandidate } from "../media-realism/candidateSelector";
import type {
  AssetLibraryRecord,
  CopyGenerationOutput,
  IntakeBrief,
  StrategyOutput,
  ValidationResult,
  VideoGenerationResult,
} from "../media-realism/types";

export type PipelineStepName = "strategy" | "copy" | "validator" | "image" | "typography" | "video" | "library" | "qa";

export async function executeNode(step: PipelineStepName, payload: Record<string, unknown>) {
  switch (step) {
    case "strategy":
      return handleStrategy(payload as unknown as { intake: IntakeBrief });
    case "copy":
      return handleCopy(payload as unknown as { strategy: StrategyOutput });
    case "validator":
      return handleValidator(payload as unknown as { copy: CopyGenerationOutput });
    case "image":
      return handleImage(payload as unknown as { strategy: StrategyOutput; validator: ValidationResult; intake: IntakeBrief });
    case "typography":
      return handleTypography(payload as unknown as { imageUrl: string; copy: CopyGenerationOutput });
    case "video":
      return handleVideo(payload as unknown as { imageUrl: string });
    case "library":
      return handleLibrary(payload as unknown as { record: AssetLibraryRecord });
    case "qa":
      return handleQa(payload as unknown as { record: AssetLibraryRecord });
    default:
      throw new Error(`Unsupported step: ${step}`);
  }
}

export async function executePipeline(intake: IntakeBrief): Promise<AssetLibraryRecord> {
  const intakeGate = validateIntakeBrief(intake);
  if (!intakeGate.valid) throw new Error(`Intake gate failed: ${intakeGate.errors.join(", ")}`);

  const strategy = await handleStrategy({ intake });
  const copy = await handleCopy({ strategy });
  const validator = await handleValidator({ copy });
  if (validator.status !== "pass") throw new Error(`Validator gate failed: ${validator.issues.map((issue) => issue.message).join(" | ")}`);

  const image = await handleImage({ strategy, validator, intake });
  if (!image.accepted || !image.acceptedCandidate) throw new Error(image.qcReport.blockReason ?? "Image gate failed");

  const compositeAssetUrl = await handleTypography({ imageUrl: image.acceptedCandidate.url, copy });
  const video = await handleVideo({ imageUrl: image.acceptedCandidate.url });

  const record: AssetLibraryRecord = {
    runId: strategy.runId,
    rulesetVersion: strategy.rulesetVersion,
    status: "readyForHumanReview",
    intake,
    strategy,
    copy,
    validator,
    image,
    compositeAssetUrl,
    video,
  };

  await handleLibrary({ record });
  await handleQa({ record });
  return record;
}

async function handleStrategy({ intake }: { intake: IntakeBrief }) {
  return createStrategyFromIntake(intake);
}

async function handleCopy({ strategy }: { strategy: StrategyOutput }): Promise<CopyGenerationOutput> {
  return {
    variants: strategy.conceptDirections.map((concept) => ({
      conceptId: concept.id,
      headline: concept.overlayIntent.headline,
      subheadline: concept.hook.slice(0, 80),
      bullets: [concept.angle, concept.environment, concept.desiredMood],
      cta: concept.overlayIntent.cta,
      disclaimer: concept.overlayIntent.disclaimer ?? "",
    })),
  };
}

async function handleValidator({ copy }: { copy: CopyGenerationOutput }) {
  return validateCopy(copy);
}

async function handleImage({ strategy, validator, intake }: { strategy: StrategyOutput; validator: ValidationResult; intake: IntakeBrief }) {
  const concept = strategy.conceptDirections[0];
  return runImageGenerationWithQc({
    concept,
    validator,
    aspectRatio: getDefaultAspectRatio(intake.targetPlatform),
    overlayIntent: concept.overlayIntent,
  });
}

async function handleTypography({ imageUrl, copy }: { imageUrl: string; copy: CopyGenerationOutput }) {
  const primary = copy.variants[0];
  const encoded = new URLSearchParams({
    imageUrl,
    headline: primary.headline,
    cta: primary.cta,
    disclaimer: primary.disclaimer,
  }).toString();
  return `/api/pipeline/composite?${encoded}`;
}

async function handleVideo({ imageUrl }: { imageUrl: string }): Promise<VideoGenerationResult> {
  const policy = getVideoMotionPolicy();
  const candidates = await generateVideoCandidatesFromProvider({ sourceImageUrl: imageUrl, attempts: 3 });
  const rejectedCandidates: VideoGenerationResult["rejectedCandidates"] = [];
  const accepted: Array<{ candidate: (typeof candidates)[number]; score: ReturnType<typeof scoreVideoCandidate> }> = [];

  for (const candidate of candidates) {
    const score = scoreVideoCandidate(candidate, policy);
    if (shouldRejectVideoCandidate(score)) rejectedCandidates.push({ candidate, score });
    else accepted.push({ candidate, score });
  }

  if (accepted.length === 0) {
    return {
      accepted: false,
      rejectedCandidates,
      motionPolicy: policy,
      qcReport: { attempts: 3, blockReason: "All video candidates failed QC." },
    };
  }

  const selected = selectBestVideoCandidate(accepted);
  return {
    accepted: true,
    acceptedCandidate: selected.candidate,
    rejectedCandidates,
    motionPolicy: policy,
    qcReport: {
      attempts: 3,
      acceptedCandidateId: selected.candidate.id,
      acceptedScore: selected.score,
    },
  };
}

async function handleLibrary({ record }: { record: AssetLibraryRecord }) {
  return record;
}

async function handleQa({ record }: { record: AssetLibraryRecord }) {
  return {
    status: "readyForHumanReview",
    runId: record.runId,
  };
}
