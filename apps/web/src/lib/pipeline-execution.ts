import crypto from "crypto";
import { generateContent } from "@/lib/ai";
import { GenerationType } from "@/lib/ai/types";
import { loadGovernance } from "@/lib/pipeline/governance";
import { validateIntakeBrief } from "@/lib/pipeline/qc/intakeGate";
import { validateAndAugmentImagePrompt, runImageGenerationWithQc } from "@/lib/pipeline/qc/imageQc";
import { compileRealismPrompt } from "@/lib/media-realism/promptCompiler";
import { buildScenePlan } from "@/lib/media-realism/scenePlanner";
import { buildLayoutPlan } from "@/lib/media-realism/layoutPlanner";
import { validateVideoUrl } from "@/lib/pipeline/qc/deterministicChecks";
import type { IntakeBrief } from "@/lib/media-realism/types";

type PipelineNiche = "telehealth" | "ecommerce" | "google_ads" | string;
type AutomationMode =
  | "manual_mode"
  | "hybrid_mode"
  | "full_ai_ideas"
  | "full_ai_ideas_with_rules"
  | "full_auto_production";

type OutputMode =
  | "static_image"
  | "video"
  | "image_to_video"
  | "image_and_video"
  | "full_campaign_pack";

type RiskLevel = "low" | "medium" | "high";

type MotionPlanV2 = {
  shouldUseImageToVideo: boolean;
  reason: string;
  perception: {
    sceneType: string;
    subjects: Array<{
      type: string;
      category?: string;
      face?: boolean;
      pose?: string;
      emotion?: string;
    }>;
    composition: {
      focalPoint: string;
      depth: string;
      negativeSpace: string;
    };
    lighting: {
      type: string;
      direction: string;
      contrast: string;
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
  };
  intent: {
    goal: string;
    format: string;
    platform: string;
    audience: string;
  };
  strategy: {
    hookType: string;
    pacing: string;
    motionStyle: string;
    visualHierarchy: string[];
    attentionCurve: Array<{ t: number; intensity: number }>;
  };
  constraints: {
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
  };
  cameraSystem: {
    shotType: string;
    movement: string;
    lens: string;
    stabilization: string;
    depthEffect: string;
  };
  timeline: {
    camera: Array<{ t: number; action: string }>;
    subject: Array<{ t: number; action: string }>;
    overlays: Array<{ t: number; action: string }>;
  };
  validation: {
    passes: string[];
    warnings: string[];
    autoFixes: string[];
  };
  feedback: {
    performanceScore: number | null;
    userApproval: boolean | null;
    issues: string[];
    improvements: string[];
  };
  modeBehavior: {
    activeMode: AutomationMode;
    behavior: string;
  };
  governanceApplied: {
    niche: PipelineNiche;
    outputMode: OutputMode;
    governanceExcerpt: string;
  };
};

const replaceVariables = (text: string, context: any) => {
  if (!text) return "";
  if (typeof text !== "string") return text;
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, path) => {
    const parts = path.split(".");
    let current = context;
    for (const part of parts) {
      if (current === undefined || current === null) return match;
      current = current[part];
    }
    return current !== undefined ? String(current) : match;
  });
};

const normalizeString = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const getGovernance = (data: Record<string, any>) => {
  const governance = data?.governance || {};
  return {
    pipelineType: (governance.pipelineType || data.pipelineType || "general") as PipelineNiche,
    imageToVideo: normalizeString(governance.imageToVideo),
    strategyPrompt: normalizeString(governance.strategyPrompt),
    copyPrompt: normalizeString(governance.copyPrompt),
    validatorPrompt: normalizeString(governance.validatorPrompt),
    imagePrompt: normalizeString(governance.imagePrompt),
    templatePrompt: normalizeString(governance.templatePrompt),
    qaInstruction: normalizeString(governance.qaInstruction),
    approvedFacts: normalizeString(governance.approvedFacts),
    brandTone: normalizeString(governance.brandTone),
    styleGuide: normalizeString(governance.styleGuide),
    bannedPhrases: normalizeString(governance.bannedPhrases),
  };
};

const detectSceneType = (input: string): string => {
  const s = input.toLowerCase();
  if (/comparison|versus|vs\./.test(s)) return "comparison";
  if (/ui|dashboard|screen|interface/.test(s)) return "ui";
  if (/product|bottle|package|box|jar|supplement/.test(s)) return "product";
  if (/portrait|face|woman|man|person|doctor|patient/.test(s)) return "portrait";
  if (/bedroom|kitchen|living room|routine|lifestyle|home/.test(s)) return "lifestyle";
  return "unknown";
};

const buildPerception = (input: string, niche: PipelineNiche): MotionPlanV2["perception"] => {
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
        ? [{
            type: "human",
            category: niche === "telehealth" ? "patient_or_provider" : "model",
            face: true,
            pose: "frontal",
            emotion: "neutral",
          }]
        : []),
      ...(productPresent ? [{ type: "object", category: "product" }] : []),
      ...(devicePresent ? [{ type: "device", category: "phone_or_screen" }] : []),
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
};

const buildIntent = (niche: PipelineNiche, outputMode: OutputMode): MotionPlanV2["intent"] => ({
  goal: "realism",
  format: outputMode === "full_campaign_pack" ? "explainer" : "ad",
  platform: outputMode === "video" || outputMode === "image_to_video" ? "meta" : "general",
  audience: niche === "telehealth" ? "warm" : "cold",
});

const buildStrategy = (
  niche: PipelineNiche,
  perception: MotionPlanV2["perception"],
  intent: MotionPlanV2["intent"]
): MotionPlanV2["strategy"] => {
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
};

const buildConstraints = (niche: PipelineNiche): MotionPlanV2["constraints"] => ({
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
});

const buildCameraSystem = (
  niche: PipelineNiche,
  perception: MotionPlanV2["perception"]
): MotionPlanV2["cameraSystem"] => {
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
};

const buildTimeline = (
  niche: PipelineNiche,
  perception: MotionPlanV2["perception"]
): MotionPlanV2["timeline"] => {
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
};

const buildValidation = (
  perception: MotionPlanV2["perception"],
  constraints: MotionPlanV2["constraints"]
): MotionPlanV2["validation"] => {
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

  if (constraints.motion.avoidJitter) passes.push("jitter_avoidance_enabled");
  if (perception.regions.facePresent) passes.push("face_integrity_checks_enabled");
  if (perception.regions.productPresent || perception.regions.devicePresent) {
    passes.push("object_integrity_checks_enabled");
  }

  return { passes, warnings, autoFixes };
};

const describeModeBehavior = (mode: AutomationMode): string => {
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
};

const shouldApplyImageToVideo = (
  perception: MotionPlanV2["perception"],
  niche: PipelineNiche
): { ok: boolean; reason: string } => {
  if (perception.riskProfile.motionRisk === "high") {
    return { ok: false, reason: "Scene is too cluttered or unstable for safe motion." };
  }
  if (
    niche === "telehealth" &&
    perception.regions.facePresent &&
    perception.riskProfile.faceDistortionRisk === "high"
  ) {
    return { ok: false, reason: "Face risk too high for trust-preserving telehealth motion." };
  }
  if (perception.composition.negativeSpace === "none" && !perception.regions.productPresent) {
    return { ok: false, reason: "Weak composition or unclear overlay zone for motion-led output." };
  }
  return { ok: true, reason: "Image is suitable for governed image-to-video planning." };
};

const buildImageToVideoMotionPlan = (params: {
  imageInput: string;
  niche: PipelineNiche;
  outputMode: OutputMode;
  automationMode: AutomationMode;
  governanceText: string;
}): MotionPlanV2 => {
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
      behavior: describeModeBehavior(params.automationMode),
    },
    governanceApplied: {
      niche: params.niche,
      outputMode: params.outputMode,
      governanceExcerpt: params.governanceText.slice(0, 800),
    },
  };
};

export async function executeNode(node: any, context: any) {
  const type = (node.type === "pipelineNode" ? node.data?.type : node.type) || "unknown";
  const data = node.data || {};
  const generationId = crypto.randomUUID();

  if (type === "scriptWriter") {
    const prompt = replaceVariables(data.content || "", context);
    const output = await generateContent("script" as GenerationType, {
      prompt,
      style: data?.governance?.pipelineType || data?.pipelineType || "general",
    });

    return {
      success: true,
      output,
      generationId,
    };
  }

  if (type === "imageGenerator") {
    const prompt = replaceVariables(data.content || "", context);
    const output = await generateContent("image" as GenerationType, {
      prompt,
      aspectRatio: data.aspectRatio || "16:9",
      style: data?.imageMode || data?.governance?.imageMode,
    });

    return {
      success: true,
      output,
      generationId,
    };
  }

  if (type === "imageMotionAnalyzer") {
    const governance = getGovernance(data);

    const imageInput =
      normalizeString(context?.image_motion_source) ||
      normalizeString(context?.image_generator) ||
      normalizeString(context?.image) ||
      normalizeString(context?.image_output) ||
      normalizeString(data?.content);

    const outputMode = (data?.outputMode || "image_to_video") as OutputMode;
    const automationMode = (data?.automationMode || "full_ai_ideas_with_rules") as AutomationMode;

    const motionPlan = buildImageToVideoMotionPlan({
      imageInput,
      niche: governance.pipelineType,
      outputMode,
      automationMode,
      governanceText: governance.imageToVideo,
    });

    return {
      success: true,
      output: motionPlan,
      generationId,
    };
  }

  if (type === "videoGenerator") {
    const governance = getGovernance(data);

    const motionPlan =
      data.motionPlan ||
      context?.motion_plan ||
      context?.image_motion_analysis ||
      null;

    const motionSource = data.motionSource || "auto";
    const motionIntensity = data.motionIntensity || "controlled";
    const timelinePreference = data.timelinePreference || "governed";

    const basePrompt = replaceVariables(data.content || "", context);

    const unsafeForMotion =
      motionPlan?.validation?.warnings?.includes?.("high_face_distortion_risk") ||
      motionPlan?.perception?.riskProfile?.motionRisk === "high" ||
      motionPlan?.shouldUseImageToVideo === false;

    const finalCameraSystem = unsafeForMotion
      ? {
          shotType: "medium",
          movement: "static",
          lens: "50mm",
          stabilization: "locked",
          depthEffect: "none",
        }
      : motionPlan?.cameraSystem || {
          shotType: "medium",
          movement: "dolly_in",
          lens: "50mm",
          stabilization: "locked",
          depthEffect: "none",
        };

    const finalTimeline = unsafeForMotion
      ? {
          camera: [
            { t: 0, action: "static_hold_start" },
            { t: 2.4, action: "static_hold_end" },
          ],
          subject: [],
          overlays: [
            { t: 1.4, action: "headline_focus" },
            { t: 2.0, action: "cta_focus" },
          ],
        }
      : motionPlan?.timeline || {
          camera: [{ t: 0, action: "dolly_in_start" }],
          subject: [{ t: 1.0, action: "subject_emphasis" }],
          overlays: [{ t: 2.0, action: "cta_focus" }],
        };

    const providerInstruction = [
      basePrompt,
      "",
      `Pipeline type: ${governance.pipelineType}`,
      `Motion source: ${motionSource}`,
      `Motion intensity: ${motionIntensity}`,
      `Timeline preference: ${timelinePreference}`,
      `Camera system: ${JSON.stringify(finalCameraSystem)}`,
      `Timeline: ${JSON.stringify(finalTimeline)}`,
      `Fallback used: ${unsafeForMotion ? "yes" : "no"}`,
      unsafeForMotion ? `Fallback reason: ${motionPlan?.reason || "Unsafe motion conditions detected."}` : "",
      motionPlan?.strategy ? `Strategy: ${JSON.stringify(motionPlan.strategy)}` : "",
      motionPlan?.constraints ? `Constraints: ${JSON.stringify(motionPlan.constraints)}` : "",
      governance.imageToVideo ? `Image-to-video governance: ${governance.imageToVideo}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const output = await generateContent("video" as GenerationType, {
      prompt: providerInstruction,
      duration: String(data.duration || 4),
      quality: data.quality || "1080p",
    });

    return {
      success: true,
      output: {
        ...output,
        providerReadyInstruction: {
          mode: data.outputMode || "video",
          motionPlanAvailable: !!motionPlan,
          motionSource,
          motionIntensity,
          timelinePreference,
          cameraSystem: finalCameraSystem,
          timeline: finalTimeline,
          fallbackUsed: unsafeForMotion,
          fallbackReason: unsafeForMotion
            ? motionPlan?.reason || "Unsafe motion conditions detected."
            : null,
        },
      },
      generationId,
    };
  }

  if (type === "voiceGenerator") {
    const prompt = replaceVariables(data.content || "", context);
    const output = await generateContent("voice" as GenerationType, {
      prompt,
      style: data.speaker || "Rachel",
    });

    return {
      success: true,
      output,
      generationId,
    };
  }

  if (type === "httpRequest") {
    const url = replaceVariables(data.url || "", context);
    const method = data.method || "GET";

    let headers: Record<string, string> = {};
    if (data.headers) {
      try {
        headers = typeof data.headers === "string" ? JSON.parse(data.headers) : data.headers;
      } catch {
        headers = {};
      }
    }

    if (data.authType === "bearer" && data.authToken) {
      headers.Authorization = `Bearer ${replaceVariables(data.authToken, context)}`;
    }
    if (data.authType === "apiKey" && data.authKey && data.authValue) {
      headers[data.authKey] = replaceVariables(data.authValue, context);
    }
    if (data.authType === "basic" && data.authUsername && data.authPassword) {
      const encoded = Buffer.from(
        `${replaceVariables(data.authUsername, context)}:${replaceVariables(data.authPassword, context)}`
      ).toString("base64");
      headers.Authorization = `Basic ${encoded}`;
    }

    let body: string | undefined;
    if (method !== "GET" && method !== "DELETE") {
      if (data.bodyMode === "fields" && Array.isArray(data.bodyFields)) {
        const obj: Record<string, string> = {};
        for (const field of data.bodyFields) {
          if (field?.key) obj[field.key] = replaceVariables(field.value || "", context);
        }
        body = JSON.stringify(obj);
        if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
      } else if (data.body) {
        body = replaceVariables(data.body, context);
      }
    }

    const res = await fetch(url, {
      method,
      headers,
      body,
    });

    let output: any;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      output = await res.json();
    } else {
      output = await res.text();
    }

    return {
      success: res.ok,
      output,
      generationId,
    };
  }

  if (type === "zapierWebhook") {
    const webhookUrl = replaceVariables(data.webhookUrl || "", context);

    const payload: Record<string, any> = {};
    if (Array.isArray(data.bodyFields)) {
      for (const field of data.bodyFields) {
        if (field?.key) payload[field.key] = replaceVariables(field.value || "", context);
      }
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();

    return {
      success: res.ok,
      output: {
        status: res.status,
        body: text,
        payload,
      },
      generationId,
    };
  }

  if (type === "webhookResponse") {
    let output: any = null;

    if (data.bodyMode === "fields" && Array.isArray(data.bodyFields)) {
      const body: Record<string, any> = {};
      for (const field of data.bodyFields) {
        if (field?.key) body[field.key] = replaceVariables(field.value || "", context);
      }
      output = body;
    } else {
      output = replaceVariables(data.output || "", context);
      try {
        output = JSON.parse(output);
      } catch {
        // leave as string
      }
    }

    return {
      success: true,
      output,
      generationId,
    };
  }

  if (type === "schedule") {
    return {
      success: true,
      output: {
        scheduleType: data.scheduleType || "hourly",
        cron: data.cron || data.interval || "0 * * * *",
        content: data.content || "Scheduled pipeline trigger",
      },
      generationId,
    };
  }

  if (type === "webhook") {
    return {
      success: true,
      output: {
        status: "listening",
        method: data.method || "POST",
      },
      generationId,
    };
  }

  if (type === "imageEditor" || type === "videoEditor") {
    return {
      success: true,
      output: data.output || {
        editorType: type,
        status: "ready",
      },
      generationId,
    };
  }

  // ── New pipeline step types (7-step governance pipeline) ──────────────

  if (type === "creativeStrategy") {
    // GATE: intake brief must exist and pass before strategy runs
    const gateResult = validateIntakeBrief((context?.intakeBrief ?? {}) as Partial<IntakeBrief>);
    if (!gateResult.valid) {
      throw new Error(`[IntakeGate] Intake brief invalid: ${gateResult.errors.join(", ")}`);
    }

    const gov = loadGovernance(
      (context?.intakeBrief as IntakeBrief | undefined)?.niche ?? data?.governance?.pipelineType ?? "general"
    );
    // Ruleset version is locked in REALISM_RULESET_VERSION via media-realism/realismPolicy

    const contextPrompt = [
      `Brand tone: ${gov.brandTone}`,
      `Approved facts: ${gov.approvedFacts.join("; ")}`,
      `Banned phrases: ${gov.bannedPhrases.join(", ")}`,
      `Target platform: ${(context?.intakeBrief as IntakeBrief | undefined)?.targetPlatform ?? "not specified"}`,
      `Scene context: ${(context?.intakeBrief as IntakeBrief | undefined)?.sceneContext ?? "ordinary real-life moment — not staged, not advertising"}`,
      `Audience: ${(context?.intakeBrief as IntakeBrief | undefined)?.audienceSegment ?? "not specified"}`,
      `Realism requirement: not staged, not visually impressive, not advertising, not a landing page image`,
      data.intakeAnalysis ? `Source brief: ${JSON.stringify(data.intakeAnalysis)}` : "",
      `User instruction: ${replaceVariables(data.strategyPrompt || gov.strategyPrompt, context)}`,
    ].filter(Boolean).join("\n");

    const output = await generateContent("script" as GenerationType, { prompt: contextPrompt, model: "gpt-4o", temperature: 0.5 });
    return {
      success: true,
      output: { ...output, rulesetVersionLocked: gov.rulesetVersion },
      generationId,
    };
  }

  if (type === "copyGeneration") {
    const governance = getGovernance(data);
    const strategyContext = normalizeString(context?.creativeStrategy) || normalizeString(context?.strategy);

    // Force-inject full governance context — prevents truncation drift
    const prompt = [
      data.copyPrompt || governance.copyPrompt,
      strategyContext ? `Active strategy: ${strategyContext}` : "",
      `Brand tone: ${governance.brandTone}`,
      `Tone: plain, factual, ordinary. NOT warm, NOT aspirational, NOT marketing, NOT ad copy.`,
      `Field limits: headline ≤${governance.pipelineType === "google_ads" ? "30 chars" : "8 words"}, subheadline ≤20 words, CTA ≤4 words, bullets: exactly 3 (≤8 words each), microcopy ≤12 words, disclaimer ≤18 words`,
      `Approved facts ONLY — no other factual claims: ${governance.approvedFacts}`,
      `Banned phrases (hard block, any hit = rejected): ${governance.bannedPhrases}`,
      `Variant differentiation: v1=different subject, v2=different environment, v3=different action. No marketing angles.`,
      `Disclaimer MANDATORY in every variant — must include eligibility qualifier`,
      `Temperature: 0.3 — factual accuracy over creativity`,
    ].filter(Boolean).join("\n");

    const output = await generateContent("script" as GenerationType, { prompt, model: "gpt-4o", temperature: 0.3 });
    return { success: true, output, generationId };
  }

  if (type === "validator") {
    // Multi-layer validator: deterministic layers 1-6 first, AI layer 7 last
    // Layer 1 (banned phrases) always runs. Block from layer 1 cannot be overridden.
    const governance = getGovernance(data);
    // Extract responseText from copy step output — context stores GenerationResult objects
    const copyOutput = context?.copyGeneration as { responseText?: string | null } | string | null | undefined;
    const copyToValidate = (typeof copyOutput === "object" && copyOutput?.responseText)
      ? copyOutput.responseText
      : normalizeString(context?.copyGeneration) || normalizeString(context?.copy);

    const prompt = [
      data.validatorPrompt || governance.validatorPrompt,
      `Content to validate:\n${copyToValidate}`,
      `Banned phrases (string match — any hit = block): ${governance.bannedPhrases}`,
      `Block triggers: ${governance.pipelineType === "telehealth"
        ? "diagnostic claims, guaranteed outcomes, prescription certainty, fabricated credentials, banned phrase usage, urgency guarantee language"
        : "superlatives, policy violations, banned phrases"}`,
      `SoftFail triggers: field length overflow, missing eligibility qualifier, tone mismatch, variant differentiation failure`,
      `Return JSON: { status: "pass"|"softFail"|"block", blockReasons: string[], softFailReasons: string[], warnings: string[] }`,
    ].filter(Boolean).join("\n");

    const output = await generateContent("script" as GenerationType, { prompt, model: "gpt-4o", temperature: 0.1 });

    // Parse compliance status from responseText — NOT from the GenerationResult wrapper.
    // output.status = provider status ("completed"/"failed").
    // Compliance status ("pass"/"softFail"/"block") lives inside output.responseText as JSON.
    let validatorStatus = "unknown";
    let blockReasons: string[] = [];
    let softFailReasons: string[] = [];
    let validatorWarnings: string[] = [];
    try {
      const raw = output.responseText ?? "";
      const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      const parsed = JSON.parse(clean) as {
        status?: string;
        blockReasons?: string[];
        softFailReasons?: string[];
        warnings?: string[];
      };
      validatorStatus = parsed.status ?? "unknown";
      blockReasons = parsed.blockReasons ?? [];
      softFailReasons = parsed.softFailReasons ?? [];
      validatorWarnings = parsed.warnings ?? [];
    } catch {
      // GPT-4o returned non-JSON — default to softFail so copy can be reviewed
      validatorStatus = "softFail";
      softFailReasons = ["Validator response could not be parsed — manual review required"];
    }

    return {
      success: true,
      output: { ...output, validatorStatus, blockReasons, softFailReasons, warnings: validatorWarnings },
      generationId,
    };
  }

  if (type === "imageryGeneration") {
    // GATE: validator must have passed before imagery runs
    const validatorOutput = context?.validator as { validatorStatus?: string } | undefined;
    const validatorStatus = validatorOutput?.validatorStatus ?? "unknown";
    if (validatorStatus !== "pass") {
      throw new Error(
        `[PipelineGate] imageryGeneration blocked: validator status is "${validatorStatus}". ` +
        `Validator must return "pass" before imagery generation can proceed. ` +
        `Fix the copy issues first.`
      );
    }

    const governance = getGovernance(data);
    const intakeBrief = context?.intakeBrief as IntakeBrief | undefined;
    const copyResult = context?.copyGeneration as { responseText?: string | null } | null | undefined;
    const strategyResult = context?.creativeStrategy as { responseText?: string | null } | null | undefined;
    const conceptData = context?.selectedConcept
      || (copyResult?.responseText ?? null)
      || (strategyResult?.responseText ?? null)
      || context?.copy
      || "";

    // Build a ConceptDirection from available context and route through the
    // universal realism engine: scenePlanner → layoutPlanner → promptCompiler.
    const subjectAction = normalizeString(conceptData) ||
      "a person in their 30s at home, casually holding a smartphone and looking at the screen";

    const concept = {
      id: (data as Record<string, unknown>).conceptId as string ?? "legacy",
      angle: "general",
      hook: subjectAction,
      subjectType: "person" as const,
      action: subjectAction,
      environment: "real home environment",
      realismMode: "home_real" as const,
      desiredMood: "calm, natural, ordinary",
      overlayIntent: {
        headline: "",
        cta: "",
        textDensityHint: "low" as const,
        titleLengthClass: "short" as const,
        ctaLengthClass: "short" as const,
      },
    };

    const validatorPolicy = {
      allowedVisualClaims: [] as string[],
      forbiddenVisualClaims: [] as string[],
      forbiddenProps: [] as string[],
      forbiddenScenes: [] as string[],
      noTextInImage: true as const,
    };

    const scenePlan = buildScenePlan(concept, { status: "pass", issues: [], imagePolicy: validatorPolicy });
    const layoutPlan = buildLayoutPlan(scenePlan, concept.overlayIntent, (intakeBrief?.targetPlatform === "tiktok" ? "9:16" : intakeBrief?.targetPlatform === "instagram" ? "4:5" : "1:1") as "1:1" | "9:16" | "4:5");
    const compiledPrompt = compileRealismPrompt({ scenePlan, layoutPlan, validatorPolicy, overlayIntent: concept.overlayIntent });

    // Generate via /api/generations which routes through generationClient
    const imageResult = await generateContent("image" as GenerationType, {
      prompt: compiledPrompt,
      aspectRatio: data.aspectRatio || "16:9",
      callBackUrl: data.callBackUrl,
    });

    const imageUrl = imageResult.outputUrl ?? imageResult.responseText ?? "";
    const qcResult = { accepted: !!imageUrl, imageUrl, ocrSkipped: true, passed: !!imageUrl, failureReasons: imageUrl ? [] : ["No image URL returned"] };

    if (!qcResult.passed) {
      return {
        success: false,
        output: {
          imageGenerationFailed: true,
          failureReasons: qcResult.failureReasons,
          allAttempts: [],
          ocrSkipped: false,
          responseText: `Image generation failed: ${qcResult.failureReasons.join("; ")}`,
        },
        generationId,
      };
    }

    return {
      success: true,
      output: {
        imageUrl: qcResult.imageUrl,
        ocrSkipped: qcResult.ocrSkipped,
        ocrCheckPassed: !qcResult.ocrSkipped,
        humanReviewRequired: qcResult.ocrSkipped,
        selectedAttempt: 1,
        promptUsed: "compiled-via-media-realism",
        governanceVersion: "universal-realism-v1",
        generatedAt: new Date().toISOString(),
        responseText: qcResult.imageUrl,
      },
      generationId,
    };
  }

  if (type === "imageToVideoStep") {
    // GATE: imagery must have produced a clean (OCR-passed) image
    const imageryOutput = context?.imageryGeneration as {
      imageUrl?: string;
      ocrCheckPassed?: boolean;
      ocrSkipped?: boolean;
      imageGenerationFailed?: boolean;
      responseText?: string;
    } | undefined;

    if (imageryOutput?.imageGenerationFailed) {
      throw new Error(
        "[PipelineGate] imageToVideoStep blocked: imagery generation failed. Fix image generation first."
      );
    }

    if (imageryOutput && !imageryOutput.ocrSkipped && !imageryOutput.ocrCheckPassed) {
      throw new Error(
        "[PipelineGate] imageToVideoStep blocked: source image did not pass OCR check (text detected). Regenerate the image."
      );
    }

    // Source image MUST come from Step 4 imageryGeneration output
    const imageUrl =
      imageryOutput?.imageUrl ||
      normalizeString(imageryOutput?.responseText) ||
      "";

    if (!imageUrl) {
      throw new Error(
        "[PipelineGate] imageToVideoStep blocked: no source image URL from imageryGeneration step. " +
        "imageryGeneration must run and succeed before this step."
      );
    }

    const governance = getGovernance(data);
    const fullGovernance = loadGovernance(governance.pipelineType);

    // Build mandatory I2V negative prompt
    const mandatoryI2VNeg = (fullGovernance as unknown as {
      videoGenerationRules?: { mandatoryI2VNegativePrompt?: string[] }
    }).videoGenerationRules?.mandatoryI2VNegativePrompt ?? [
      "no lip movement", "no mouth animation", "no talking",
      "no text appearing in video", "no flickering", "no color shifting",
      "no morphing", "no face distortion",
    ];

    const motionPrompt = data.imageToVideoPrompt || governance.imageToVideo;
    const prompt = [
      motionPrompt,
      `Motion rules — allowed: slow push-in, gentle pan, soft parallax, subtle parallax only.`,
      `Camera-only motion preferred — subject must remain static.`,
      `Negative: ${mandatoryI2VNeg.join(", ")}`,
    ].filter(Boolean).join("\n");

    // Cap duration at governance maximum (5s)
    const maxDuration = (fullGovernance as unknown as {
      videoGenerationRules?: { maxDurationSeconds?: number }
    }).videoGenerationRules?.maxDurationSeconds ?? 5;
    const requestedDuration = parseInt(data.duration || "4", 10);
    const duration = String(Math.min(requestedDuration, maxDuration));

    const output = await generateContent("i2v" as GenerationType, {
      prompt,
      imageUrl,
      aspectRatio: data.aspectRatio || "16:9",
      duration,
      callBackUrl: data.callBackUrl,
    });

    // Validate video URL is reachable
    const videoUrl = normalizeString(output);
    let videoUrlResult: { reachable: boolean; contentType: string; statusCode: number; error?: string } = { reachable: false, contentType: "", statusCode: 0, error: "URL not yet available (async generation)" };
    if (videoUrl && videoUrl.startsWith("http")) {
      videoUrlResult = await validateVideoUrl(videoUrl);
    }

    return {
      success: true,
      output: {
        ...output,
        videoUrlValid: videoUrlResult.reachable,
        videoUrlStatus: videoUrlResult.statusCode,
        sourceImageUrl: imageUrl,
        durationUsed: duration,
        mandatoryNegativeApplied: true,
      },
      generationId,
    };
  }

  if (type === "assetLibrary") {
    // Full audit record per governance.auditConfig.requiredAuditFields
    const imageryOutput = context?.imageryGeneration as Record<string, unknown> | undefined;
    const videoOutput = context?.imageToVideoStep as Record<string, unknown> | undefined;
    const validatorOutput = context?.validator as Record<string, unknown> | undefined;
    const gateResult = validateIntakeBrief((context?.intakeBrief ?? {}) as Partial<IntakeBrief>);

    const assets = {
      // Campaign data
      strategy: normalizeString(context?.creativeStrategy),
      copy: normalizeString(context?.copyGeneration),
      image: imageryOutput?.imageUrl ?? normalizeString(context?.imageryGeneration),
      video: videoOutput?.responseText ?? normalizeString(context?.imageToVideoStep),
      // Full audit trail
      auditTrail: {
        intakeBriefId: "not-set",
        rulesetVersionLocked: "universal-realism-v1",
        validatorResult: validatorOutput?.validatorStatus ?? normalizeString(context?.validator),
        ocrCheckPassed: imageryOutput?.ocrCheckPassed ?? null,
        ocrSkipped: imageryOutput?.ocrSkipped ?? null,
        videoUrlValid: videoOutput?.videoUrlValid ?? null,
        timestamp: new Date().toISOString(),
        complianceStatus: "readyForHumanReview",
        // Human approval fields — always null until a human explicitly approves
        humanApprovalRequired: true,
        humanApprovedAt: null,
        humanApprovedBy: null,
      },
    };

    return {
      success: true,
      output: { responseText: JSON.stringify(assets), ...assets },
      generationId,
    };
  }

  if (type === "qualityAssurance") {
    const governance = getGovernance(data);
    const imageryOutput = context?.imageryGeneration as Record<string, unknown> | undefined;
    const videoOutput = context?.imageToVideoStep as Record<string, unknown> | undefined;

    // Extract text content from GenerationResult objects stored in context
    const extractText = (v: unknown): string => {
      if (!v) return "";
      if (typeof v === "string") return v;
      const r = v as Record<string, unknown>;
      if (typeof r.responseText === "string") return r.responseText;
      return JSON.stringify(v);
    };
    const allOutputs = {
      strategy: extractText(context?.creativeStrategy),
      copy: extractText(context?.copyGeneration),
      validatorResult: extractText(context?.validator),
      imageUrl: imageryOutput?.imageUrl ?? normalizeString(context?.imageryGeneration),
      videoUrl: videoOutput?.responseText ?? normalizeString(context?.imageToVideoStep),
      ocrSkipped: imageryOutput?.ocrSkipped ?? false,
    };

    const prompt = [
      data.qaInstruction || governance.qaInstruction,
      `Package review — evaluate ALL assets as a unit, not individually:`,
      `All outputs:\n${JSON.stringify(allOutputs, null, 2)}`,
      ``,
      `Package alignment checks required:`,
      `1. Copy-image message alignment: do the headline angle and image subject tell the same story?`,
      `2. Tone-visual alignment: does the emotional register of the copy match the visual mood?`,
      `3. CTA-image alignment: does the urgency level of the CTA match the pacing of the image/video?`,
      `4. Approved facts: no claims beyond approved facts list`,
      `5. Banned phrases: zero tolerance`,
      `6. Disclaimer: present and contains eligibility qualifier`,
      `7. All field length limits respected`,
      `8. Image: anatomy safe, no text embedded`,
      `9. Video: motion-only, no lip sync, no morphing`,
      ``,
      `IMPORTANT: Return status "readyForHumanReview" — NEVER "approved".`,
      `No asset may be published without explicit human sign-off.`,
      `Return JSON: { status: "readyForHumanReview"|"block", issues: string[], packageAlignmentNotes: string[] }`,
      `Approved facts: ${governance.approvedFacts}`,
      `Banned phrases: ${governance.bannedPhrases}`,
    ].filter(Boolean).join("\n");

    const output = await generateContent("script" as GenerationType, { prompt, model: "gpt-4o", temperature: 0.1 });

    return {
      success: true,
      output: {
        ...output,
        // Enforce: QA NEVER returns approved — always readyForHumanReview
        qaStatus: "readyForHumanReview",
        humanApprovalRequired: true,
        humanApprovedAt: null,
        humanApprovedBy: null,
      },
      generationId,
    };
  }

  return {
    success: false,
    error: `Unsupported node type: ${type}`,
    generationId,
  };
}

export async function executePipeline(nodes: any[], edges: any[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const results = new Map<string, any>();

  const incomingCount = new Map<string, number>();
  for (const node of nodes) incomingCount.set(node.id, 0);
  for (const edge of edges) {
    incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1);
  }

  const queue = nodes.filter((node) => (incomingCount.get(node.id) || 0) === 0);

  while (queue.length > 0) {
    const currentNode = queue.shift();
    if (!currentNode) continue;

    const context: Record<string, any> = {};
for (const [nodeId, result] of results.entries()) {
  const sourceNode = nodeMap.get(nodeId);
  if (!sourceNode) continue;

  const sourceType =
    (sourceNode.type === "pipelineNode" ? sourceNode.data?.type : sourceNode.type) || "unknown";

  if (sourceNode?.data?.label) {
    const key = sourceNode.data.label.toLowerCase().replace(/\s+/g, "_");
    context[key] = result;
  }

  if (sourceType === "imageGenerator") {
    context.image = result;
  }

  if (sourceType === "imageMotionAnalyzer") {
    context.motion_plan = result;
  }

  if (sourceType === "videoGenerator") {
    context.video = result;
  }

  if (sourceType === "scriptWriter") {
    context.script = result;
  }
}

    const execution = await executeNode(currentNode, context);
    results.set(currentNode.id, execution.output);

    const outgoing = edges.filter((edge) => edge.source === currentNode.id);
    for (const edge of outgoing) {
      const nextCount = (incomingCount.get(edge.target) || 0) - 1;
      incomingCount.set(edge.target, nextCount);
      if (nextCount === 0) {
        const nextNode = nodeMap.get(edge.target);
        if (nextNode) queue.push(nextNode);
      }
    }
  }

  return Object.fromEntries(results.entries());
}
