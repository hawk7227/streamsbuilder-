import type { AspectRatio, LayoutPlan, OverlayIntent, SafeZone, ScenePlan } from "./types";

export function buildLayoutPlan(scenePlan: ScenePlan, overlayIntent: OverlayIntent, aspectRatio: AspectRatio): LayoutPlan {
  const safeZones = chooseSafeZones(overlayIntent.textDensityHint);
  const subjectAnchor = safeZones.includes("left_middle") || safeZones.includes("top_left") ? "right_third" : "left_third";
  const faceZone = subjectAnchor === "right_third" ? "upper_right" : "upper_left";
  const backgroundDensity = subjectAnchor === "right_third" ? "low_left_high_right" : "low_right_high_left";

  return {
    aspectRatio,
    subjectAnchor,
    safeZones,
    protectedZones: ["face", "hands", ...scenePlan.requiredProps.map((p) => mapPropToProtectedZone(p))].filter(Boolean) as LayoutPlan["protectedZones"],
    faceZone,
    backgroundDensity,
    compositionRules: [
      "subject must remain away from primary overlay-safe zones",
      "face must be fully visible and unobstructed",
      "hands must remain anatomically believable",
      "overlay-safe areas must remain lower-detail than the subject side",
    ],
    overlaySafeMap: {
      top_left: "reserved for title or label",
      top_right: "reserved for icon or utility",
      left_middle: "reserved for supporting copy",
      right_middle: "reserved for supporting copy",
      lower_left: "reserved for CTA or status",
      lower_right: "reserved for CTA or status",
    },
  };
}

function chooseSafeZones(textDensity: OverlayIntent["textDensityHint"]): SafeZone[] {
  switch (textDensity) {
    case "high":
      return ["top_left", "left_middle", "lower_left"];
    case "medium":
      return ["top_left", "left_middle"];
    case "low":
    default:
      return ["top_left"];
  }
}

function mapPropToProtectedZone(prop: string) {
  if (prop === "phone") return "phone";
  if (prop === "screen") return "screen";
  if (prop === "medication") return "medication";
  return null;
}
