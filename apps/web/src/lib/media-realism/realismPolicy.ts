import type { AspectRatio, RealismMode, SafeZone, TargetPlatform, VideoMotionPolicy } from "./types";

export const REALISM_RULESET_VERSION = "universal-realism-v1";

export const FORBIDDEN_IMAGE_TERMS = [
  "cinematic",
  "dramatic lighting",
  "movie still",
  "film still",
  "editorial",
  "fashion photography",
  "beauty campaign",
  "luxury",
  "premium look",
  "masterpiece",
  "8k",
  "hyper-detailed",
  "award-winning",
  "glossy",
  "studio lighting",
  "shallow depth of field",
  "bokeh",
  "airbrushed skin",
  "perfect skin",
  "text overlay",
  "ui overlay",
  "floating panel",
  "mockup",
  "render",
  "cgi",
];

export const REQUIRED_REALISM_ANCHORS = [
  "visible pores",
  "natural skin texture",
  "realistic hands",
  "realistic hair strands",
  "flat natural lighting",
  "ordinary camera look",
  "not staged",
  "no text inside image",
];

export const REALISM_MODE_OPENERS: Record<RealismMode, string> = {
  human_lifestyle_real: "Create a real, ordinary, unpolished lifestyle photograph.",
  clinical_real: "Create a realistic documentary-style clinical photograph.",
  workspace_real: "Create a real, ordinary workplace photograph.",
  product_in_use_real: "Create a real, believable product-in-use photograph.",
  home_real: "Create a real, everyday home photograph.",
};

export const ASPECT_RATIO_TO_SIZE: Record<AspectRatio, "1024x1024" | "1024x1536" | "1536x1024"> = {
  "1:1": "1024x1024",
  "4:5": "1024x1536",
  "9:16": "1024x1536",
  "16:9": "1536x1024",
};

export const SAFE_ZONE_TEXT: Record<SafeZone, string> = {
  top_left: "top-left overlay-safe zone must remain simple and uncluttered",
  top_right: "top-right overlay-safe zone must remain simple and uncluttered",
  left_middle: "left-middle overlay-safe zone must remain clean and low-detail",
  right_middle: "right-middle overlay-safe zone must remain clean and low-detail",
  lower_left: "lower-left overlay-safe zone must remain clear and readable",
  lower_right: "lower-right overlay-safe zone must remain clear and readable",
};

export function getDefaultAspectRatio(platform: TargetPlatform): AspectRatio {
  switch (platform) {
    case "google":
    case "organic":
      return "16:9";
    case "instagram":
      return "4:5";
    case "tiktok":
      return "9:16";
    case "meta":
    default:
      return "1:1";
  }
}

export function getVideoMotionPolicy(): VideoMotionPolicy {
  return {
    maxDurationSeconds: 5,
    allowPushIn: true,
    allowParallax: true,
    allowBlink: true,
    allowMouthMotion: false,
    allowHandMotion: false,
    allowSubjectReposition: false,
    forbiddenMotion: [
      "face warping",
      "mouth chatter",
      "subject drift",
      "large hand motion",
      "camera whip",
      "rubber skin",
      "background layer float",
    ],
  };
}
