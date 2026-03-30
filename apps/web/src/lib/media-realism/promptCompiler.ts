import { FORBIDDEN_IMAGE_TERMS, REALISM_MODE_OPENERS, SAFE_ZONE_TEXT } from "./realismPolicy";
import type { PromptBuildInput } from "./types";

export function compileRealismPrompt(input: PromptBuildInput): string {
  const { scenePlan, layoutPlan, validatorPolicy } = input;
  const safeZoneLines = layoutPlan.safeZones.map((zone) => `- ${SAFE_ZONE_TEXT[zone]}`).join("\n");
  const forbiddenClaims = [...validatorPolicy.forbiddenVisualClaims, ...validatorPolicy.forbiddenProps, ...validatorPolicy.forbiddenScenes];

  return [
    REALISM_MODE_OPENERS[scenePlan.realismMode],
    "",
    "Scene:",
    `${scenePlan.subjectType} performing the following action: ${scenePlan.action}.`,
    `Environment: ${scenePlan.environment}.`,
    `Mood: ${scenePlan.mood}.`,
    "",
    "Composition:",
    `Use a ${scenePlan.shotType} shot in ${scenePlan.orientation} orientation.`,
    `Place the subject at ${layoutPlan.subjectAnchor}.`,
    `Face zone must remain in ${layoutPlan.faceZone}.`,
    ...layoutPlan.compositionRules.map((rule) => `- ${rule}`),
    "",
    "Overlay-safe zones:",
    safeZoneLines,
    "",
    "Human realism requirements:",
    "- visible pores",
    "- natural skin texture",
    "- natural facial asymmetry",
    "- realistic hands",
    "- realistic hair strands",
    "- realistic clothing folds",
    "- no beauty retouching",
    "- no smoothing",
    "",
    "Lighting:",
    "- flat natural lighting",
    "- soft minimal shadows",
    "- slightly imperfect exposure is acceptable",
    "- no studio lighting",
    "- no cinematic lighting",
    "",
    "Camera:",
    "- ordinary camera or phone-camera look",
    "- no dramatic depth blur",
    "- no glossy sharpness",
    "- no exaggerated cinematic lens behavior",
    "",
    "Prohibitions:",
    ...FORBIDDEN_IMAGE_TERMS.map((term) => `- ${term}`),
    ...forbiddenClaims.map((term) => `- ${term}`),
    "- no text inside image",
    "- no UI cards or labels inside image",
    "",
    "Final lock:",
    "If the image looks stylized, cinematic, polished, glossy, luxury, or obviously AI-generated, it is wrong. If it looks ordinary, plain, and believable, it is correct.",
  ].join("\n");
}
