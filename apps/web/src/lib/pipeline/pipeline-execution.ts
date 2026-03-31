// @ts-nocheck
import { createStrategyFromIntake } from "./governance/telehealth";
import { validateIntakeBrief } from "./qc/intakeGate";
import { validateCopy } from "./qc/copyValidator";
import { runImageGenerationWithQc } from "./qc/imageQc";
import { getDefaultAspectRatio, getVideoMotionPolicy } from "../media-realism/realismPolicy";
import { scoreVideoCandidate, shouldRejectVideoCandidate } from "../media-realism/videoQc";
import { selectBestVideoCandidate } from "../media-realism/candidateSelector";
import { generateContent } from "../ai/index";
import { getSiteConfig } from "../config";
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

// ── Video polling ─────────────────────────────────────────────────────────
// Polls Kling or Runway until a task completes or times out.
// Returns the CDN video URL on success.

const POLL_INTERVAL_MS = 6_000;
const POLL_TIMEOUT_MS  = 240_000; // 4 min

function klingJwt(): string {
  const sk = process.env.KLING_API_KEY;
  const ak = process.env.KLING_ASSESS_API_KEY;
  if (!sk || !ak) throw new Error("KLING_API_KEY or KLING_ASSESS_API_KEY not set");
  // Build JWT manually to avoid jsonwebtoken import issues under @ts-nocheck
  const header  = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now     = Math.floor(Date.now() / 1000);
  const claims  = Buffer.from(JSON.stringify({ iss: ak, exp: now + 1800, nbf: now - 5 })).toString("base64url");
  const crypto  = require("crypto");
  const sig     = crypto.createHmac("sha256", sk).update(`${header}.${claims}`).digest("base64url");
  return `${header}.${claims}.${sig}`;
}

async function pollKlingI2V(taskId: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(
      `https://api-singapore.klingai.com/v1/videos/image2video/${taskId}`,
      { headers: { Authorization: `Bearer ${klingJwt()}` }, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) continue; // retry on transient errors
    const data = await res.json() as { data?: { task_status: string; task_result?: { videos?: Array<{ url: string }> } } };
    const task = data.data;
    if (!task) continue;
    if (task.task_status === "failed") throw new Error("Kling I2V task failed");
    if (task.task_status === "succeed") {
      const url = task.task_result?.videos?.[0]?.url;
      if (!url) throw new Error("Kling I2V: no video URL in result");
      return url;
    }
    // still pending/processing — keep polling
  }
  throw new Error("Kling I2V polling timed out after 4 minutes");
}

async function pollRunwayTask(taskId: string): Promise<string> {
  const apiKey  = process.env.RUNWAY_API_KEY;
  if (!apiKey) throw new Error("RUNWAY_API_KEY not set");
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(
      `https://api.runwayml.com/v1/tasks/${taskId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-Runway-Version": "2024-11-06",
        },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) continue;
    const data = await res.json() as { status?: string; output?: string[]; failure?: string };
    if (data.status === "FAILED") throw new Error(`Runway task failed: ${data.failure ?? "unknown"}`);
    if (data.status === "SUCCEEDED") {
      const url = data.output?.[0];
      if (!url) throw new Error("Runway: no output URL in result");
      return url;
    }
    // PENDING or RUNNING — keep polling
  }
  throw new Error("Runway polling timed out after 4 minutes");
}

async function handleVideo({ imageUrl }: { imageUrl: string }): Promise<VideoGenerationResult> {
  const policy   = getVideoMotionPolicy();
  const config   = getSiteConfig();
  const provider = (config.aiProviders?.i2v ?? "kling").toLowerCase();

  // Build motion prompt from policy
  const allowed: string[] = [];
  if (policy.allowPushIn)   allowed.push("slow gentle push-in");
  if (policy.allowParallax) allowed.push("soft background parallax");
  if (policy.allowBlink)    allowed.push("natural blink");
  const motionPrompt = [
    allowed.length ? allowed.join(", ") : "subtle natural motion only",
    `Forbidden: ${policy.forbiddenMotion.join(", ")}.`,
    `Max ${policy.maxDurationSeconds}s. Preserve identity. No face drift. No mouth motion.`,
  ].join(" ");

  const ATTEMPTS = 3;
  const rejectedCandidates: VideoGenerationResult["rejectedCandidates"] = [];
  const accepted: Array<{ candidate: VideoCandidate; score: ReturnType<typeof scoreVideoCandidate> }> = [];

  // Submit N candidates in parallel then poll each for completion
  const submissions = await Promise.allSettled(
    Array.from({ length: ATTEMPTS }, (_, i) =>
      generateContent("i2v", {
        prompt:      motionPrompt,
        imageUrl,
        aspectRatio: "16:9",
        duration:    String(policy.maxDurationSeconds),
      })
      .then(result => ({ attempt: i + 1, externalId: result.externalId, provider }))
    )
  );

  const submitted = submissions
    .filter((r): r is PromiseFulfilledResult<{ attempt: number; externalId: string | null | undefined; provider: string }> => r.status === "fulfilled")
    .map(r => r.value)
    .filter(v => !!v.externalId);

  if (submitted.length === 0) {
    return {
      accepted: false,
      rejectedCandidates: [],
      motionPolicy: policy,
      qcReport: { attempts: ATTEMPTS, blockReason: "All I2V submission requests failed — check provider credentials." },
    };
  }

  // Poll each submission to completion
  const polled = await Promise.allSettled(
    submitted.map(async sub => {
      const videoUrl = sub.provider === "runway"
        ? await pollRunwayTask(sub.externalId!)
        : await pollKlingI2V(sub.externalId!);
      const candidate: VideoCandidate = {
        id:             `vid-${sub.externalId}`,
        url:            videoUrl,
        sourceImageUrl: imageUrl,
        promptUsed:     motionPrompt,
        attempt:        sub.attempt,
      };
      return candidate;
    })
  );

  const completedCandidates = polled
    .filter((r): r is PromiseFulfilledResult<VideoCandidate> => r.status === "fulfilled")
    .map(r => r.value);

  if (completedCandidates.length === 0) {
    return {
      accepted: false,
      rejectedCandidates: [],
      motionPolicy: policy,
      qcReport: { attempts: ATTEMPTS, blockReason: "All I2V candidates timed out or failed during polling." },
    };
  }

  // QC score each completed candidate
  for (const candidate of completedCandidates) {
    const score = scoreVideoCandidate(candidate, policy);
    if (shouldRejectVideoCandidate(score)) rejectedCandidates.push({ candidate, score });
    else accepted.push({ candidate, score });
  }

  if (accepted.length === 0) {
    return {
      accepted: false,
      rejectedCandidates,
      motionPolicy: policy,
      qcReport: { attempts: ATTEMPTS, blockReason: "All completed candidates failed realism QC." },
    };
  }

  const selected = selectBestVideoCandidate(accepted);
  return {
    accepted: true,
    acceptedCandidate: selected.candidate,
    rejectedCandidates,
    motionPolicy: policy,
    qcReport: {
      attempts: ATTEMPTS,
      acceptedCandidateId: selected.candidate.id,
      acceptedScore:       selected.score,
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
