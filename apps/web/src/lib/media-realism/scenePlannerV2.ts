/**
 * scenePlannerV2.ts
 *
 * Drop-in replacement for scenePlanner.ts that fixes:
 * 1. orientation — derived from actual aspectRatio, not hardcoded "landscape"
 * 2. shotType — derived from platform context, not hardcoded "medium"
 *
 * Spec file scenePlanner.ts is NOT modified.
 * Import from here instead.
 */

import type { AspectRatio, ConceptDirection, ScenePlan, ShotType, ValidationResult } from "./types";

function deriveOrientation(aspectRatio: AspectRatio): ScenePlan["orientation"] {
  if (aspectRatio === "9:16" || aspectRatio === "4:5") return "portrait";
  if (aspectRatio === "16:9") return "landscape";
  return "square";
}

function deriveShotType(platform?: string): ShotType {
  if (platform === "tiktok" || platform === "instagram") return "medium-wide";
  return "medium";
}

function inferRequiredProps(action: string): string[] {
  const lower = action.toLowerCase();
  const props = new Set<string>();
  if (lower.includes("phone") || lower.includes("smartphone")) props.add("phone");
  if (lower.includes("computer") || lower.includes("screen") || lower.includes("monitor")) props.add("screen");
  if (lower.includes("medication") || lower.includes("prescription") || lower.includes("refill")) props.add("medication");
  return Array.from(props);
}

export function buildScenePlanV2(
  concept: ConceptDirection,
  validator: ValidationResult,
  aspectRatio: AspectRatio,
  platform?: string,
): ScenePlan {
  return {
    conceptId: concept.id,
    conceptType: concept.angle,
    subjectType: concept.subjectType,
    subjectCount: 1,
    action: concept.action,
    environment: concept.environment,
    mood: concept.desiredMood,
    realismMode: concept.realismMode,
    shotType: deriveShotType(platform),
    orientation: deriveOrientation(aspectRatio),
    requiredProps: inferRequiredProps(concept.action),
    forbiddenProps: validator.imagePolicy.forbiddenProps,
    forbiddenScenes: validator.imagePolicy.forbiddenScenes,
    noTextInImage: true,
  };
}
