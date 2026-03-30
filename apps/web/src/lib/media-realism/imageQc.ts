import type { GeneratedImageCandidate, ImageQcScore, LayoutPlan, ScenePlan } from "./types";

export function scoreImageCandidate(candidate: GeneratedImageCandidate, scenePlan: ScenePlan, layoutPlan: LayoutPlan): ImageQcScore {
  const reasons: string[] = [];
  const metadata = candidate.metadata;

  const realismScore = numeric(metadata.realismScore, 82);
  const safeZoneScore = numeric(metadata.safeZoneScore, layoutPlan.safeZones.length > 1 ? 86 : 90);
  const faceProtectionScore = numeric(metadata.faceProtectionScore, 92);
  const propComplianceScore = numeric(metadata.propComplianceScore, scenePlan.requiredProps.length ? 88 : 92);
  const clutterScore = numeric(metadata.clutterScore, 85);
  const antiCinematicScore = numeric(metadata.antiCinematicScore, 90);
  const antiTextLeakScore = candidate.ocrText.length === 0 ? 100 : 0;

  if (candidate.ocrText.length > 0) reasons.push("text_detected_in_image");
  if (realismScore < 80) reasons.push("insufficient_realism");
  if (safeZoneScore < 80) reasons.push("overlay_safe_zone_too_busy");
  if (faceProtectionScore < 85) reasons.push("face_not_protected");
  if (propComplianceScore < 80) reasons.push("required_prop_missing_or_invalid");
  if (clutterScore < 75) reasons.push("excessive_scene_clutter");
  if (antiCinematicScore < 85) reasons.push("looks_too_cinematic_or_polished");

  const totalScore = round(
    realismScore * 0.24 +
      safeZoneScore * 0.16 +
      faceProtectionScore * 0.18 +
      propComplianceScore * 0.12 +
      clutterScore * 0.1 +
      antiCinematicScore * 0.12 +
      antiTextLeakScore * 0.08,
  );

  return {
    realismScore,
    safeZoneScore,
    faceProtectionScore,
    propComplianceScore,
    clutterScore,
    antiCinematicScore,
    antiTextLeakScore,
    totalScore,
    rejectionReasons: reasons,
  };
}

export function shouldRejectImageCandidate(score: ImageQcScore): boolean {
  return (
    score.antiTextLeakScore < 100 ||
    score.faceProtectionScore < 85 ||
    score.realismScore < 80 ||
    score.safeZoneScore < 80 ||
    score.antiCinematicScore < 85 ||
    score.totalScore < 86
  );
}

function numeric(value: unknown, fallback: number): number {
  return typeof value === "number" && !Number.isNaN(value) ? value : fallback;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
