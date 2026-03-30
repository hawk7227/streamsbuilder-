/**
 * types.ts — media-realism-video
 *
 * Type contracts for the T2V (text-to-video) scratch video system.
 * Separate from the I2V pipeline types in media-realism/types.ts.
 */

// ── Input ──────────────────────────────────────────────────────────────────

export type T2VAspectRatio = "16:9" | "9:16" | "1:1" | "4:5";
export type T2VQuality = "720p" | "1080p" | "4k";
export type T2VRealismMode =
  | "human_lifestyle"     // real person in a real environment
  | "product_in_use"      // product being used naturally
  | "environment_only"    // location/setting, no person
  | "workspace";          // office/studio real setting

export interface T2VInput {
  prompt: string;
  aspectRatio: T2VAspectRatio;
  duration: "5" | "10";
  quality: T2VQuality;
  realismMode: T2VRealismMode;
  workspaceId: string;
  generationId?: string;    // DB row id if already created
}

// ── Prompt pipeline ────────────────────────────────────────────────────────

export interface SanitizeResult {
  originalPrompt: string;
  sanitizedPrompt: string;
  strippedTerms: string[];
  warnings: string[];
}

export interface ExpandedPrompt {
  sanitized: SanitizeResult;
  finalPrompt: string;         // what gets sent to Kling
  negativePrompt: string;      // explicit negative to send with request
  injectedAnchors: string[];   // what was added for realism
}

// ── Candidate ──────────────────────────────────────────────────────────────

export interface T2VCandidate {
  id: string;              // internal candidate id
  externalId: string;      // Kling task_id
  attempt: number;         // which generation attempt (1-4)
  promptUsed: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  durationSeconds?: number;
}

// ── QC ─────────────────────────────────────────────────────────────────────

export interface FrameAnalysis {
  frameCount: number;
  facesDetected: boolean;
  faceFrames: number;           // how many frames contain a face
  consistencyScores: number[];  // per-frame consistency vs previous frame
}

export interface T2VQcScore {
  // Per spec: each 0-1
  faceStability: number;           // 1 = no drift, 0 = heavy drift
  motionNaturalness: number;       // 1 = natural, 0 = jitter/stutter
  artifactScore: number;           // 1 = clean, 0 = warp/artifacts
  temporalConsistency: number;     // 1 = consistent lighting/scene, 0 = flicker
  antiCinematicScore: number;      // 1 = ordinary, 0 = cinematic/stylized
  totalScore: number;              // weighted: must be >= PASS_THRESHOLD
  rejectionReasons: string[];
  passed: boolean;
}

export const T2V_QC_PASS_THRESHOLD = 0.9;

// ── Selection ──────────────────────────────────────────────────────────────

export interface T2VSelectionResult {
  accepted: boolean;
  acceptedCandidate?: T2VCandidate;
  acceptedScore?: T2VQcScore;
  rejectedCandidates: Array<{ candidate: T2VCandidate; score: T2VQcScore }>;
  blockReason?: string;
  attempts: number;
}

// ── Post-process ───────────────────────────────────────────────────────────

export interface PostProcessResult {
  inputUrl: string;
  outputUrl: string;
  processesApplied: string[];
  skipped: boolean;        // true if ffmpeg not available
  skipReason?: string;
}

// ── Final result ───────────────────────────────────────────────────────────

export interface T2VResult {
  accepted: boolean;
  videoUrl?: string;
  qcScore?: T2VQcScore;
  expandedPrompt: ExpandedPrompt;
  selectionResult: T2VSelectionResult;
  postProcess?: PostProcessResult;
  totalAttempts: number;
  blockReason?: string;
  generationId?: string;
}
