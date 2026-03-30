/**
 * t2vQc.ts
 *
 * Per spec: QC scoring for T2V (scratch video) candidates.
 * Five dimensions: face stability, motion naturalness, artifact score,
 * temporal consistency, anti-cinematic score.
 * Reject if any dimension < 0.85 OR totalScore < T2V_QC_PASS_THRESHOLD.
 *
 * Detection functions are CV hooks — return baseline scores until
 * real frame analysis is wired. Contracts are stable.
 */

import type { FrameAnalysis, T2VQcScore } from "./types";
import { T2V_QC_PASS_THRESHOLD } from "./types";

// ── Weights — must sum to 1.0 ─────────────────────────────────────────────
// face stability weighted highest per spec (identity preservation is critical)

const WEIGHTS = {
  faceStability:      0.28,
  motionNaturalness:  0.22,
  artifactScore:      0.20,
  temporalConsistency:0.18,
  antiCinematicScore: 0.12,
} as const;

// Safety assertion — weights must sum to 1.0
const WEIGHT_SUM = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(WEIGHT_SUM - 1.0) > 0.001) {
  throw new Error(`T2V QC weight sum is ${WEIGHT_SUM}, must be 1.0`);
}

// Per-dimension rejection threshold (separate from totalScore threshold)
const DIM_THRESHOLD = 0.85;

// ── Detection hooks ────────────────────────────────────────────────────────
// Return 0-1 score. 1 = clean/passing. 0 = fail.
// Each is independently rejection-capable below DIM_THRESHOLD.

function detectFaceDrift(frames: FrameAnalysis): number {
  // Hook: facial landmark tracking across frames
  // No face in scene → not applicable → full score
  if (!frames.facesDetected) return 1.0;
  if (frames.faceFrames === 0) return 1.0;
  // Future: compute landmark delta across faceFrames
  return 1.0;
}

function detectFlicker(frames: FrameAnalysis): number {
  // Hook: per-frame luminance variance detection
  if (frames.consistencyScores.length === 0) return 1.0;
  const avg = frames.consistencyScores.reduce((a, b) => a + b, 0) / frames.consistencyScores.length;
  return Math.max(0, Math.min(1, avg));
}

function detectWarp(frames: FrameAnalysis): number {
  // Hook: optical flow background distortion detection
  // Future: compute flow field irregularity across frames
  return 1.0;
}

function detectTemporalConsistency(frames: FrameAnalysis): number {
  // Hook: scene-level consistency (lighting, color space, background stability)
  if (frames.consistencyScores.length < 2) return 1.0;
  // Use min score — worst frame drives temporal consistency score
  const min = frames.consistencyScores.reduce((a, b) => Math.min(a, b), 1);
  return Math.max(0, min);
}

function detectCinematicLook(_frames: FrameAnalysis): number {
  // Hook: style classifier (contrast curve, saturation, color grading fingerprint)
  // Future: ML classifier or histogram-based detector
  return 1.0;
}

// ── extractFrameAnalysis ───────────────────────────────────────────────────

/**
 * Placeholder frame extraction.
 * Production: download video → extract N frames → run CV → return analysis.
 * Returns neutral baseline so scoring hooks have valid input.
 */
export function extractFrameAnalysis(_videoUrl: string): FrameAnalysis {
  return {
    frameCount: 0,
    facesDetected: false,
    faceFrames: 0,
    consistencyScores: [],
  };
}

// ── scoreT2VCandidate ──────────────────────────────────────────────────────

export function scoreT2VCandidate(
  videoUrl: string,
  frameAnalysis?: FrameAnalysis,
): T2VQcScore {
  const frames = frameAnalysis ?? extractFrameAnalysis(videoUrl);

  const faceStability      = detectFaceDrift(frames);
  const motionNaturalness  = detectFlicker(frames);
  const artifactScore      = detectWarp(frames);
  const temporalConsistency= detectTemporalConsistency(frames);
  const antiCinematicScore = detectCinematicLook(frames);

  const rejectionReasons: string[] = [];
  if (faceStability       < DIM_THRESHOLD) rejectionReasons.push("face_drift");
  if (motionNaturalness   < DIM_THRESHOLD) rejectionReasons.push("motion_jitter");
  if (artifactScore       < DIM_THRESHOLD) rejectionReasons.push("background_warp");
  if (temporalConsistency < DIM_THRESHOLD) rejectionReasons.push("lighting_flicker");
  if (antiCinematicScore  < DIM_THRESHOLD) rejectionReasons.push("looks_cinematic_or_stylized");

  // Round to 2dp to avoid floating-point drift (e.g. 0.9000000001)
  const totalScore = Math.round(
    (faceStability      * WEIGHTS.faceStability      +
     motionNaturalness  * WEIGHTS.motionNaturalness  +
     artifactScore      * WEIGHTS.artifactScore      +
     temporalConsistency* WEIGHTS.temporalConsistency+
     antiCinematicScore * WEIGHTS.antiCinematicScore) * 100
  ) / 100;

  // Fail if ANY dimension is below threshold OR totalScore is below pass threshold
  const passed = rejectionReasons.length === 0 && totalScore >= T2V_QC_PASS_THRESHOLD;

  return {
    faceStability,
    motionNaturalness,
    artifactScore,
    temporalConsistency,
    antiCinematicScore,
    totalScore,
    rejectionReasons,
    passed,
  };
}

export function shouldRejectT2VCandidate(score: T2VQcScore): boolean {
  return !score.passed;
}
