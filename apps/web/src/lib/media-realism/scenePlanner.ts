import type { ConceptDirection, ScenePlan, ValidationResult } from "./types";

export function buildScenePlan(concept: ConceptDirection, validator: ValidationResult): ScenePlan {
  return {
    conceptId: concept.id,
    conceptType: concept.angle,
    subjectType: concept.subjectType,
    subjectCount: 1,
    action: concept.action,
    environment: concept.environment,
    mood: concept.desiredMood,
    realismMode: concept.realismMode,
    shotType: "medium",
    orientation: "landscape",
    requiredProps: inferRequiredProps(concept.action),
    forbiddenProps: validator.imagePolicy.forbiddenProps,
    forbiddenScenes: validator.imagePolicy.forbiddenScenes,
    noTextInImage: true,
  };
}

function inferRequiredProps(action: string): string[] {
  const lower = action.toLowerCase();
  const props = new Set<string>();
  if (lower.includes("phone") || lower.includes("smartphone")) props.add("phone");
  if (lower.includes("computer") || lower.includes("screen") || lower.includes("monitor")) props.add("screen");
  if (lower.includes("medication") || lower.includes("prescription") || lower.includes("refill")) props.add("medication");
  return Array.from(props);
}
