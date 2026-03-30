/**
 * pipeline-orchestrator.ts
 *
 * Production orchestrator. Replaces all hardcoded creative logic:
 *
 * Step 1 — AI generates 3 distinct concepts from intake brief (no hardcoded angles)
 * Step 2 — AI generates copy per concept (no mechanical field extraction)
 * Step 3 — Config-driven validator (no telehealth-locked blocked phrases)
 * Step 4 — All 3 concepts generate images in parallel (not just concept-1)
 * Step 5 — Kling I2V on accepted image
 * Step 4.5 — Real compositor + Supabase upload
 *
 * Spec files (pipeline-execution.ts and all media-realism/*.ts) are NOT modified.
 */

import { validateIntakeBrief } from "./qc/intakeGate";
import { runImageGenerationWithQc } from "./qc/imageQc";
import { generateCreative } from "../creative/generateCreative";
import { generateCopy } from "../creative/generateCopy";
import { validateCopyWithPolicy } from "../compliance/validateCopy";
import { buildPolicy, UNIVERSAL_POLICY, HEALTHCARE_COMPLIANCE } from "../compliance/compliancePolicy";
import { getDefaultAspectRatio, getVideoMotionPolicy } from "../media-realism/realismPolicy";
import { scoreVideoCandidate, shouldRejectVideoCandidate } from "../media-realism/videoQc";
import { selectBestVideoCandidate } from "../media-realism/candidateSelector";
import { compositeAndUpload } from "../media-realism/typographyProvider";
import { generateRealVideoCandidate } from "../media-realism/videoProvider";
import type {
  AssetLibraryRecord,
  ImageGenerationResult,
  IntakeBrief,
  VideoGenerationResult,
} from "../media-realism/types";

export type { AssetLibraryRecord };

// Extended record that includes all 3 concept images
export interface ProductionRecord extends Omit<AssetLibraryRecord, "image"> {
  images: ImageGenerationResult[];          // all 3 concepts
  image: ImageGenerationResult;             // best accepted (for compatibility)
}

export async function runPipelineProduction(intake: IntakeBrief): Promise<ProductionRecord> {
  // ── Intake gate ──────────────────────────────────────────────────────────
  const gate = validateIntakeBrief(intake);
  if (!gate.valid) throw new Error(`Intake gate failed: ${gate.errors.join(", ")}`);

  // ── Step 1: AI-generated creative (no hardcoded concepts) ────────────────
  const strategy = await generateCreative(intake);

  // ── Step 2: AI-generated copy per concept ────────────────────────────────
  const copy = await generateCopy(strategy.conceptDirections);

  // ── Step 3: Config-driven validation ─────────────────────────────────────
  // Policy is built per run. Healthcare addon applied only when niche = telehealth.
  const complianceAddons = intake.niche === "telehealth" ? [HEALTHCARE_COMPLIANCE] : [];
  const policy = buildPolicy(UNIVERSAL_POLICY, ...complianceAddons);
  const validator = validateCopyWithPolicy(copy, policy);

  if (validator.status === "block") {
    throw new Error(`Validator blocked: ${validator.issues.map(i => i.message).join(" | ")}`);
  }

  // ── Step 4: All 3 concepts generate images in parallel ───────────────────
  const aspectRatio = getDefaultAspectRatio(intake.targetPlatform);

  // Update overlayIntents on conceptDirections from the AI-generated copy
  const enrichedDirections = strategy.conceptDirections.map((concept, i) => {
    const variant = copy.variants[i];
    return {
      ...concept,
      overlayIntent: {
        ...concept.overlayIntent,
        headline: variant?.headline ?? concept.overlayIntent.headline,
        cta: variant?.cta ?? concept.overlayIntent.cta,
      },
    };
  });

  const images = await Promise.all(
    enrichedDirections.map(concept =>
      runImageGenerationWithQc({
        concept,
        validator,
        aspectRatio,
        overlayIntent: concept.overlayIntent,
        maxAttempts: Number(process.env.IMAGE_MAX_ATTEMPTS ?? "3"),
      })
    )
  );

  // Select best accepted image across all concepts
  const acceptedImages = images.filter(img => img.accepted && img.acceptedCandidate);
  if (acceptedImages.length === 0) {
    const reasons = images.map(img => img.qcReport.blockReason ?? "unknown").join("; ");
    throw new Error(`All concept images failed QC: ${reasons}`);
  }

  // Best = highest QC total score
  const bestImage = acceptedImages.reduce((best, img) => {
    const bScore = best.qcReport.acceptedScore?.totalScore ?? 0;
    const iScore = img.qcReport.acceptedScore?.totalScore ?? 0;
    return iScore > bScore ? img : best;
  });

  // ── Step 4.5: Compositor ─────────────────────────────────────────────────
  const compositeAssetUrl = await compositeAndUpload(
    bestImage.acceptedCandidate!.url,
    copy,
    intake,
  );

  // ── Step 5: Real Kling I2V ───────────────────────────────────────────────
  const video = await runRealVideo(bestImage.acceptedCandidate!.url);

  // ── Build record ─────────────────────────────────────────────────────────
  const record: ProductionRecord = {
    runId: strategy.runId,
    rulesetVersion: strategy.rulesetVersion,
    status: "readyForHumanReview",
    intake,
    strategy: { ...strategy, conceptDirections: enrichedDirections },
    copy,
    validator,
    images,
    image: bestImage,
    compositeAssetUrl,
    video,
  };

  return record;
}

async function runRealVideo(imageUrl: string): Promise<VideoGenerationResult> {
  const policy = getVideoMotionPolicy();
  try {
    const candidate = await generateRealVideoCandidate(imageUrl, 1);
    const score = scoreVideoCandidate(candidate, policy);
    const rejected = shouldRejectVideoCandidate(score);
    return {
      accepted: !rejected,
      acceptedCandidate: rejected ? undefined : candidate,
      rejectedCandidates: rejected ? [{ candidate, score }] : [],
      motionPolicy: policy,
      qcReport: {
        attempts: 1,
        acceptedCandidateId: rejected ? undefined : candidate.id,
        acceptedScore: rejected ? undefined : score,
        blockReason: rejected ? "Video QC scored below threshold" : undefined,
      },
    };
  } catch (err) {
    return {
      accepted: false,
      rejectedCandidates: [],
      motionPolicy: policy,
      qcReport: { attempts: 1, blockReason: err instanceof Error ? err.message : "Video provider error" },
    };
  }
}

// Single-step execution for individual step testing
export { executeNode } from "./pipeline-execution";
