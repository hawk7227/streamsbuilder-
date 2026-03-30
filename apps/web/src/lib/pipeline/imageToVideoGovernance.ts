export type PipelineNiche = "telehealth" | "ecommerce";
export type AutomationMode =
  | "manual_mode"
  | "hybrid_mode"
  | "full_ai_ideas"
  | "full_ai_ideas_with_rules"
  | "full_auto_production";

export type OutputMode =
  | "static_image"
  | "video"
  | "image_to_video"
  | "image_and_video"
  | "full_campaign_pack";

export type SceneType =
  | "portrait"
  | "product"
  | "lifestyle"
  | "ui"
  | "comparison"
  | "unknown";

export type RiskLevel = "low" | "medium" | "high";

export type MotionAction =
  | "fade_in_background"
  | "slow_push_camera"
  | "subject_emphasis"
  | "cta_focus"
  | "static_hold"
  | "parallax_shift"
  | "macro_reveal"
  | "headline_focus"
  | "product_focus";

export interface PerceptionSubject {
  type: "human" | "object" | "device" | "text" | "logo";
  category?: string;
  face?: boolean;
  pose?: "frontal" | "profile" | "unknown";
  emotion?: "neutral" | "calm" | "smile" | "serious" | "unknown";
}

export interface PerceptionLayer {
  sceneType: SceneType;
  subjects: PerceptionSubject[];
  composition: {
    focalPoint: "left" | "center" | "right" | "unknown";
    depth: "flat" | "shallow" | "deep";
    negativeSpace: "left" | "right" | "top" | "bottom" | "none";
  };
  lighting: {
    type: "studio" | "natural" | "mixed" | "unknown";
    direction: "front" | "side" | "back" | "unknown";
    contrast: "low" | "medium" | "high";
  };
  regions: {
    productPresent: boolean;
    textPresent: boolean;
    ctaZonePresent: boolean;
    logoPresent: boolean;
    devicePresent: boolean;
    facePresent: boolean;
    handsPresent: boolean;
  };
  riskProfile: {
    faceDistortionRisk: RiskLevel;
    artifactRisk: RiskLevel;
    objectIntegrityRisk: RiskLevel;
    motionRisk: RiskLevel;
  };
}

export interface IntentLayer {
  goal: "conversion" | "engagement" | "education";
  format: "ad" | "social" | "landing" | "explainer";
  platform: "meta" | "tiktok" | "web" | "general";
  audience: "cold" | "warm" | "retargeting";
}

export interface StrategyLayer {
  hookType: "pattern_interrupt" | "curiosity" | "benefit" | "clarity" | "trust";
  pacing: "fast" | "moderate" | "slow";
  motionStyle: "cinematic" | "kinetic" | "minimal";
  visualHierarchy: string[];
  attentionCurve: Array<{ t: number; intensity: number }>;
}

export interface ConstraintLayer {
  face: {
    mustPreserveIdentity: boolean;
    maxWarp: number;
    noMorphing: boolean;
  };
  product: {
    mustMaintainShape: boolean;
    noScalingDistortion: boolean;
  };
  text: {
    noGeneration: boolean;
    preserveOriginal: boolean;
  };
  motion: {
    maxSpeed: number;
    maxCameraShift: number;
    avoidJitter: boolean;
  };
}

export interface CameraSystem {
  shotType: "close_up" | "medium" | "wide";
  movement: "dolly_in" | "dolly_out" | "pan" | "parallax" | "static";
  lens: "35mm" | "50mm" | "85mm";
  stabilization: "locked" | "stabilized" | "handheld_sim";
  depthEffect: "none" | "parallax" | "layered";
}

export interface TimelineLayered {
  camera: Array<{ t: number; action: string }>;
  subject: Array<{ t: number; action: string }>;
  overlays: Array<{ t: number; action: string }>;
}

export interface ValidationLayer {
  passes: string[];
  warnings: string[];
  autoFixes: string[];
}

export interface FeedbackLayer {
  performanceScore: number | null;
  userApproval: boolean | null;
  issues: string[];
  improvements: string[];
}

export interface MotionPlanV2 {
  shouldUseImageToVideo: boolean;
  reason: string;
  perception: PerceptionLayer;
  intent: IntentLayer;
  strategy: StrategyLayer;
  constraints: ConstraintLayer;
  cameraSystem: CameraSystem;
  timeline: TimelineLayered;
  validation: ValidationLayer;
  feedback: FeedbackLayer;
  modeBehavior: {
    activeMode: AutomationMode;
    behavior: string;
  };
  governanceApplied: {
    niche: PipelineNiche;
    outputMode: OutputMode;
    governanceExcerpt: string;
  };
}

function detectSceneType(input: string): SceneType {
  const s = input.toLowerCase();
  if (/comparison|versus|vs\./.test(s)) return "comparison";
  if (/ui|dashboard|screen|interface/.test(s)) return "ui";
  if (/product|bottle|package|box|jar|supplement/.test(s)) return "product";
  if (/portrait|face|woman|man|person|doctor|patient/.test(s)) return "portrait";
  if (/bedroom|kitchen|living room|routine|lifestyle|home/.test(s)) return "lifestyle";
  return "unknown";
}

function buildPerception(input: string, niche: PipelineNiche): PerceptionLayer {
  const s = input.toLowerCase();
  const facePresent = /face|woman|man|person|doctor|patient/.test(s);
  const productPresent = /product|bottle|package|box|jar|supplement/.test(s);
  const devicePresent = /phone|smartphone|laptop|screen|tablet/.test(s);
  const textPresent = /headline|cta|text|copy|button|shop now|start your visit/.test(s);
  const handsPresent = /hand|holding|grip/.test(s);

  return {
    sceneType: detectSceneType(input),
    subjects: [
      ...(facePresent
        ? [{ type: "human" as const, category: niche === "telehealth" ? "patient_or_provider" : "model", face: true, pose: "frontal" as const, emotion: "neutral" as const }]
        : []),
      ...(productPresent
        ? [{ type: "object" as const, category: "product" }]
        : []),
      ...(devicePresent
        ? [{ type: "device" as const, category: "phone_or_screen" }]
        : []),
    ],
    composition: {
      focalPoint: /left/.test(s) ? "left" : /right/.test(s) ? "right" : "center",
      depth: /deep|depth|background blur|50mm|85mm/.test(s) ? "deep" : /flat/.test(s) ? "flat" : "shallow",
      negativeSpace: /left space/.test(s)
        ? "left"
        : /right space/.test(s)
        ? "right"
        : textPresent
        ? "left"
        : "none",
    },
    lighting: {
      type: /studio/.test(s) ? "studio" : /natural/.test(s) ? "natural" : "mixed",
      direction: /side light|side-lit/.test(s) ? "side" : /backlit/.test(s) ? "back" : "front",
      contrast: /soft/.test(s) ? "low" : /high contrast/.test(s) ? "high" : "medium",
    },
    regions: {
      productPresent,
      textPresent,
      ctaZonePresent: /cta|button|shop now|start your visit/.test(s),
      logoPresent: /logo/.test(s),
      devicePresent,
      facePresent,
      handsPresent,
    },
    riskProfile: {
      faceDistortionRisk: facePresent ? "medium" : "low",
      artifactRisk: /crowded|cluttered|busy/.test(s) ? "high" : "medium",
      objectIntegrityRisk: productPresent || devicePresent ? "medium" : "low",
      motionRisk: /cluttered|busy|multiple people/.test(s) ? "high" : facePresent ? "medium" : "low",
    },
  };
}

function buildIntent(niche: PipelineNiche, outputMode: OutputMode): IntentLayer {
  return {
    goal: "conversion",
    format: outputMode === "full_campaign_pack" ? "explainer" : "ad",
    platform: outputMode === "video" || outputMode === "image_to_video" ? "meta" : "general",
    audience: niche === "telehealth" ? "warm" : "cold",
  };
}

function buildStrategy(
  niche: PipelineNiche,
  perception: PerceptionLayer,
  intent: IntentLayer
): StrategyLayer {
  const trustFirst = niche === "telehealth";
  return {
    hookType: trustFirst ? "trust" : perception.regions.productPresent ? "benefit" : "clarity",
    pacing: trustFirst ? "slow" : intent.audience === "cold" ? "moderate" : "fast",
    motionStyle: trustFirst ? "minimal" : perception.regions.productPresent ? "cinematic" : "minimal",
    visualHierarchy: trustFirst
      ? ["primary_subject", "supporting_context", "cta"]
      : perception.regions.productPresent
      ? ["product", "supporting_context", "cta"]
      : ["primary_subject", "cta"],
    attentionCurve: trustFirst
      ? [
          { t: 0, intensity: 0.6 },
          { t: 1, intensity: 0.75 },
          { t: 2, intensity: 0.8 },
        ]
      : [
          { t: 0, intensity: 0.85 },
          { t: 1, intensity: 0.8 },
          { t: 2, intensity: 0.9 },
        ],
  };
}

function buildConstraints(niche: PipelineNiche): ConstraintLayer {
  return {
    face: {
      mustPreserveIdentity: true,
      maxWarp: niche === "telehealth" ? 0.01 : 0.02,
      noMorphing: true,
    },
    product: {
      mustMaintainShape: true,
      noScalingDistortion: true,
    },
    text: {
      noGeneration: true,
      preserveOriginal: true,
    },
    motion: {
      maxSpeed: niche === "telehealth" ? 0.45 : 0.7,
      maxCameraShift: niche === "telehealth" ? 10 : 18,
      avoidJitter: true,
    },
  };
}

function buildCameraSystem(niche: PipelineNiche, perception: PerceptionLayer): CameraSystem {
  if (niche === "telehealth") {
    return {
      shotType: "medium",
      movement: "dolly_in",
      lens: "50mm",
      stabilization: "locked",
      depthEffect: perception.composition.depth === "deep" ? "parallax" : "none",
    };
  }

  if (perception.regions.productPresent) {
    return {
      shotType: "close_up",
      movement: "dolly_in",
      lens: "85mm",
      stabilization: "stabilized",
      depthEffect: "layered",
    };
  }

  return {
    shotType: "medium",
    movement: "parallax",
    lens: "50mm",
    stabilization: "stabilized",
    depthEffect: "parallax",
  };
}

function buildTimeline(niche: PipelineNiche, perception: PerceptionLayer): TimelineLayered {
  if (niche === "telehealth") {
    return {
      camera: [
        { t: 0, action: "dolly_in_start" },
        { t: 2.8, action: "dolly_in_end" },
      ],
      subject: [
        { t: 0.8, action: "micro_expression" },
        { t: 1.4, action: perception.regions.devicePresent ? "phone_adjustment" : "gaze_shift" },
      ],
      overlays: [
        { t: 1.8, action: "headline_focus" },
        { t: 2.2, action: "cta_focus" },
      ],
    };
  }

  return {
    camera: [
      { t: 0, action: perception.regions.productPresent ? "macro_reveal_start" : "dolly_in_start" },
      { t: 2.6, action: perception.regions.productPresent ? "macro_reveal_end" : "dolly_in_end" },
    ],
    subject: [
      { t: 0.8, action: perception.regions.productPresent ? "product_focus" : "subject_emphasis" },
    ],
    overlays: [
      { t: 1.6, action: "headline_focus" },
      { t: 2.6, action: "cta_focus" },
    ],
  };
}

function buildValidation(
  perception: PerceptionLayer,
  constraints: ConstraintLayer
): ValidationLayer {
  const passes: string[] = ["composition_preserved", "text_generation_blocked"];
  const warnings: string[] = [];
  const autoFixes: string[] = [];

  if (perception.riskProfile.faceDistortionRisk === "high") {
    warnings.push("high_face_distortion_risk");
    autoFixes.push("switch_to_static_camera");
    autoFixes.push("reduce_motion_intensity");
  }

  if (perception.riskProfile.motionRisk === "high") {
    warnings.push("high_motion_risk");
    autoFixes.push("reduce_camera_shift");
  }

  if (constraints.motion.avoidJitter) {
    passes.push("jitter_avoidance_enabled");
  }

  if (perception.regions.facePresent) {
    passes.push("face_integrity_checks_enabled");
  }

  if (perception.regions.productPresent || perception.regions.devicePresent) {
    passes.push("object_integrity_checks_enabled");
  }

  return { passes, warnings, autoFixes };
}

function buildModeBehavior(mode: AutomationMode) {
  switch (mode) {
    case "manual_mode":
      return "User approves every motion and camera decision.";
    case "hybrid_mode":
      return "AI proposes motion plan, pauses at key checkpoints.";
    case "full_ai_ideas":
      return "AI explores broader motion ideas with lighter constraints.";
    case "full_ai_ideas_with_rules":
      return "AI uses governed motion logic with hard safeguards.";
    case "full_auto_production":
      return "AI executes the full motion pipeline automatically with fallbacks.";
    default:
      return "Governed execution.";
  }
}

export function shouldApplyImageToVideo(
  perception: PerceptionLayer,
  niche: PipelineNiche
): { ok: boolean; reason: string } {
  if (perception.riskProfile.motionRisk === "high") {
    return { ok: false, reason: "Scene is too cluttered or unstable for safe motion." };
  }
  if (niche === "telehealth" && perception.regions.facePresent && perception.riskProfile.faceDistortionRisk === "high") {
    return { ok: false, reason: "Face risk too high for trust-preserving telehealth motion." };
  }
  if (perception.composition.negativeSpace === "none" && !perception.regions.productPresent) {
    return { ok: false, reason: "Weak composition or unclear overlay zone for motion-led output." };
  }
  return { ok: true, reason: "Image is suitable for governed image-to-video planning." };
}

export function buildImageToVideoMotionPlan(params: {
  imageInput: string;
  niche: PipelineNiche;
  outputMode: OutputMode;
  automationMode: AutomationMode;
  governanceText: string;
}): MotionPlanV2 {
  const perception = buildPerception(params.imageInput, params.niche);
  const intent = buildIntent(params.niche, params.outputMode);
  const strategy = buildStrategy(params.niche, perception, intent);
  const constraints = buildConstraints(params.niche);
  const cameraSystem = buildCameraSystem(params.niche, perception);
  const timeline = buildTimeline(params.niche, perception);
  const validation = buildValidation(perception, constraints);
  const usage = shouldApplyImageToVideo(perception, params.niche);

  return {
    shouldUseImageToVideo: usage.ok,
    reason: usage.reason,
    perception,
    intent,
    strategy,
    constraints,
    cameraSystem,
    timeline,
    validation,
    feedback: {
      performanceScore: null,
      userApproval: null,
      issues: [],
      improvements: [],
    },
    modeBehavior: {
      activeMode: params.automationMode,
      behavior: buildModeBehavior(params.automationMode),
    },
    governanceApplied: {
      niche: params.niche,
      outputMode: params.outputMode,
      governanceExcerpt: params.governanceText.slice(0, 800),
    },
  };
}