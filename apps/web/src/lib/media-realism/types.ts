export type TargetPlatform = "meta" | "google" | "tiktok" | "instagram" | "organic";
export type AspectRatio = "1:1" | "4:5" | "9:16" | "16:9";
export type Orientation = "landscape" | "portrait" | "square";
export type RealismMode =
  | "human_lifestyle_real"
  | "clinical_real"
  | "workspace_real"
  | "product_in_use_real"
  | "home_real";
export type SubjectType = "person" | "patient" | "doctor" | "provider" | "caregiver" | "product";
export type ShotType = "medium" | "medium-wide" | "wide";
export type SubjectAnchor = "left_third" | "right_third" | "center_left" | "center_right";
export type SafeZone = "top_left" | "top_right" | "left_middle" | "right_middle" | "lower_left" | "lower_right";
export type ProtectedZone = "face" | "hands" | "phone" | "medication" | "screen" | "torso" | "head";

export interface IntakeBrief {
  targetPlatform: TargetPlatform;
  // Scene-first fields — preferred over ad-framing fields below
  sceneContext?: string;           // "ordinary person at home using a phone — not staged"
  // Legacy ad fields — kept for backward compat, do not inject marketing tone
  funnelStage?: "awareness" | "consideration" | "conversion";
  proofTypeAllowed?: "process-based" | "social-proof" | "outcome-based";
  audienceSegment?: string;
  campaignObjective?: string;
  brandVoiceStatement?: string;
  approvedFacts?: string[];
  niche?: string;
}

export interface StrategyOutput {
  runId: string;
  strategySummary: string;
  conceptDirections: ConceptDirection[];
  rulesetVersion: string;
}

export interface ConceptDirection {
  id: string;
  angle: string;
  hook: string;
  subjectType: SubjectType;
  action: string;
  environment: string;
  realismMode: RealismMode;
  desiredMood: string;
  overlayIntent: OverlayIntent;
}

export interface CopyVariant {
  conceptId: string;
  headline: string;
  subheadline: string;
  bullets: string[];
  cta: string;
  disclaimer: string;
}

export interface CopyGenerationOutput {
  variants: CopyVariant[];
}

export interface ValidationIssue {
  code: string;
  message: string;
  severity: "softFail" | "block";
}

export interface ValidationResult {
  status: "pass" | "softFail" | "block";
  issues: ValidationIssue[];
  imagePolicy: ValidatorImagePolicy;
}

export interface ValidatorImagePolicy {
  allowedVisualClaims: string[];
  forbiddenVisualClaims: string[];
  forbiddenProps: string[];
  forbiddenScenes: string[];
  noTextInImage: true;
}

export interface OverlayIntent {
  headline: string;
  cta: string;
  disclaimer?: string;
  textDensityHint: "low" | "medium" | "high";
  titleLengthClass: "short" | "medium" | "long";
  ctaLengthClass: "short" | "medium" | "long";
}

export interface ScenePlan {
  conceptId: string;
  conceptType: string;
  subjectType: SubjectType;
  subjectCount: 1 | 2;
  action: string;
  environment: string;
  mood: string;
  realismMode: RealismMode;
  shotType: ShotType;
  orientation: Orientation;
  requiredProps: string[];
  forbiddenProps: string[];
  forbiddenScenes: string[];
  noTextInImage: true;
}

export interface LayoutPlan {
  aspectRatio: AspectRatio;
  subjectAnchor: SubjectAnchor;
  safeZones: SafeZone[];
  protectedZones: ProtectedZone[];
  faceZone: "upper_left" | "upper_right" | "center_left" | "center_right";
  backgroundDensity: "low_on_overlay_side" | "low_left_high_right" | "low_right_high_left";
  compositionRules: string[];
  overlaySafeMap: Record<SafeZone, string>;
}

export interface PromptBuildInput {
  scenePlan: ScenePlan;
  layoutPlan: LayoutPlan;
  validatorPolicy: ValidatorImagePolicy;
  overlayIntent: OverlayIntent;
}

export interface GeneratedImageCandidate {
  id: string;
  url: string;
  promptUsed: string;
  attempt: number;
  ocrText: string[];
  metadata: Record<string, string | number | boolean | undefined>;
}

export interface ImageQcScore {
  realismScore: number;
  safeZoneScore: number;
  faceProtectionScore: number;
  propComplianceScore: number;
  clutterScore: number;
  antiCinematicScore: number;
  antiTextLeakScore: number;
  totalScore: number;
  rejectionReasons: string[];
}

export interface ImageGenerationResult {
  accepted: boolean;
  acceptedCandidate?: GeneratedImageCandidate;
  rejectedCandidates: Array<{
    candidate: GeneratedImageCandidate;
    score: ImageQcScore;
  }>;
  scenePlan: ScenePlan;
  layoutPlan: LayoutPlan;
  finalPrompt: string;
  qcReport: {
    attempts: number;
    acceptedCandidateId?: string;
    acceptedScore?: ImageQcScore;
    blockReason?: string;
  };
}

export interface VideoMotionPolicy {
  maxDurationSeconds: number;
  allowPushIn: boolean;
  allowParallax: boolean;
  allowBlink: boolean;
  allowMouthMotion: boolean;
  allowHandMotion: boolean;
  allowSubjectReposition: boolean;
  forbiddenMotion: string[];
}

export interface VideoCandidate {
  id: string;
  url: string;
  sourceImageUrl: string;
  promptUsed: string;
  attempt: number;
}

export interface VideoQcScore {
  realismScore: number;
  identityStabilityScore: number;
  motionNaturalnessScore: number;
  antiRubberFaceScore: number;
  antiFloatScore: number;
  totalScore: number;
  rejectionReasons: string[];
}

export interface VideoGenerationResult {
  accepted: boolean;
  acceptedCandidate?: VideoCandidate;
  rejectedCandidates: Array<{
    candidate: VideoCandidate;
    score: VideoQcScore;
  }>;
  motionPolicy: VideoMotionPolicy;
  qcReport: {
    attempts: number;
    acceptedCandidateId?: string;
    acceptedScore?: VideoQcScore;
    blockReason?: string;
  };
}

export interface AssetLibraryRecord {
  runId: string;
  rulesetVersion: string;
  status: "readyForHumanReview";
  intake: IntakeBrief;
  strategy: StrategyOutput;
  copy: CopyGenerationOutput;
  validator: ValidationResult;
  image: ImageGenerationResult;
  compositeAssetUrl: string;
  video?: VideoGenerationResult;
}
