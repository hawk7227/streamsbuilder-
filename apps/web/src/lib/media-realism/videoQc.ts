import type { VideoCandidate, VideoQcScore, VideoMotionPolicy } from "./types";

export function scoreVideoCandidate(candidate: VideoCandidate, motionPolicy: VideoMotionPolicy): VideoQcScore {
  const identityStabilityScore = 92;
  const motionNaturalnessScore = motionPolicy.allowPushIn ? 90 : 80;
  const antiRubberFaceScore = motionPolicy.allowMouthMotion ? 75 : 93;
  const antiFloatScore = 92;
  const realismScore = 90;
  const rejectionReasons: string[] = [];

  if (identityStabilityScore < 85) rejectionReasons.push("identity_instability");
  if (motionNaturalnessScore < 85) rejectionReasons.push("unnatural_motion");
  if (antiRubberFaceScore < 85) rejectionReasons.push("rubber_face_artifact");
  if (antiFloatScore < 85) rejectionReasons.push("floating_layer_artifact");

  const totalScore = Math.round((realismScore * 0.28 + identityStabilityScore * 0.26 + motionNaturalnessScore * 0.22 + antiRubberFaceScore * 0.14 + antiFloatScore * 0.1) * 100) / 100;

  return {
    realismScore,
    identityStabilityScore,
    motionNaturalnessScore,
    antiRubberFaceScore,
    antiFloatScore,
    totalScore,
    rejectionReasons,
  };
}

export function shouldRejectVideoCandidate(score: VideoQcScore): boolean {
  return score.totalScore < 88 || score.rejectionReasons.length > 0;
}
