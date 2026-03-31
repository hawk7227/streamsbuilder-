// ─── Repair System Types — Source of Truth ────────────────────────────────────
// Verbatim from the Enterprise Self-Repair System spec.
// Imports base types from verifier, extends where needed.

export type {
  VerificationLevel,
  VerificationFinalStatus,
  ProbeStatus,
  ProbeCategory,
  ProbeSeverity,
  ExpectedSideEffect,
  FeatureCoverage,
  FeatureRollup,
  FeatureVerificationResult,
  VerificationSummary,
  VerificationIncident,
} from "@/lib/verifier/types";

import type {
  ProbeCategory,
  ProbeSeverity,
  ProbeStatus,
  VerificationLevel,
  ExpectedSideEffect,
  FeatureVerificationResult,
  VerificationFinalStatus,
  VerificationSummary,
  VerificationIncident,
} from "@/lib/verifier/types";

export type RepairSeverity = "critical" | "high" | "medium" | "low";

export type Repairability =
  | "auto_repairable"
  | "approval_required"
  | "manual_only"
  | "unknown";

export type RepairExecutionMode =
  | "auto_apply"
  | "approval_required"
  | "manual_only"
  | "blocked";

export type RepairCategory =
  | "code_patch"
  | "ui_patch"
  | "config_fix"
  | "env_fix"
  | "dependency_fix"
  | "schema_fix"
  | "validation_fix"
  | "auth_fix"
  | "permission_fix"
  | "queue_fix"
  | "worker_fix"
  | "storage_fix"
  | "provider_fix"
  | "network_fix"
  | "fallback_enable"
  | "restart_service"
  | "migration_fix"
  | "observability_fix";

export type RepairTargetType =
  | "route"
  | "component"
  | "worker"
  | "queue"
  | "database"
  | "storage"
  | "provider"
  | "env"
  | "policy"
  | "build"
  | "schema"
  | "unknown";

export type RepairActionType =
  | "patch_file"
  | "create_file"
  | "delete_file"
  | "move_file"
  | "run_command"
  | "set_env"
  | "request_secret"
  | "request_human_approval"
  | "restart_process"
  | "rerun_verifier"
  | "rerun_test"
  | "open_incident"
  | "capture_preview"
  | "render_preview"
  | "collect_logs"
  | "collect_metrics"
  | "rollback";

export type RepairRisk = "low" | "medium" | "high" | "critical";

export type RepairStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "blocked"
  | "executing"
  | "succeeded"
  | "failed"
  | "partial"
  | "rolled_back";

export type RepairCauseType =
  | "missing_env"
  | "invalid_env"
  | "missing_secret"
  | "invalid_secret"
  | "package_missing"
  | "package_version_mismatch"
  | "module_import_failure"
  | "route_not_registered"
  | "route_handler_failure"
  | "auth_miswire"
  | "validation_miswire"
  | "permission_denied"
  | "db_schema_missing"
  | "db_migration_missing"
  | "db_query_failure"
  | "storage_bucket_missing"
  | "storage_permission_failure"
  | "queue_missing"
  | "queue_unreachable"
  | "worker_offline"
  | "worker_stuck"
  | "provider_unreachable"
  | "provider_model_access_denied"
  | "network_blocked"
  | "response_schema_mismatch"
  | "stream_start_failure"
  | "stream_completion_failure"
  | "side_effect_missing"
  | "ui_render_failure"
  | "ui_layout_failure"
  | "build_failure"
  | "test_failure"
  | "unknown";

// ── Extended evidence type — adds repair-specific evidence kinds ───────────────

export type RepairEvidenceType =
  | "http_response"
  | "import_check"
  | "env_check"
  | "db_query"
  | "storage_check"
  | "queue_check"
  | "worker_log"
  | "schema_validation"
  | "artifact_metadata"
  | "stream_event"
  | "permission_check"
  | "healthcheck"
  | "timing"
  | "preview_capture"
  | "command_output"
  | "diff_summary";

export interface ProbeEvidence {
  type: RepairEvidenceType;
  label: string;
  ok: boolean;
  data?: Record<string, unknown>;
}

// ── Extended ProbeResult — adds repair metadata ────────────────────────────────

export interface RepairProbeResult {
  probeId: string;
  probeName: string;
  featureId: string;
  featureName: string;
  category: ProbeCategory;
  level: VerificationLevel;
  severity: ProbeSeverity;
  status: ProbeStatus;
  repairability?: Repairability;
  likelyRepairCategories?: RepairCategory[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  expected?: {
    httpStatus?: number | number[];
    schema?: string;
    sideEffect?: ExpectedSideEffect;
    maxLatencyMs?: number;
  };
  actual?: {
    httpStatus?: number;
    responseSnippet?: string;
    errorCode?: string;
    errorMessage?: string;
    sideEffectObserved?: boolean;
    latencyMs?: number;
  };
  evidence: ProbeEvidence[];
  notes?: string[];
}

// ── Extended VerificationRunResult — adds repair outputs ──────────────────────

export interface VerificationRunResult {
  runId: string;
  specVersion: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  environment: "local" | "preview" | "staging" | "production" | "test";
  overallStatus: VerificationFinalStatus;
  summary: VerificationSummary;
  features: FeatureVerificationResult[];
  incidents?: VerificationIncident[];
  rootCauseHypotheses?: RootCauseHypothesis[];
  repairProposals?: RepairProposal[];
}

// ── Root cause hypothesis ─────────────────────────────────────────────────────

export interface RootCauseHypothesis {
  id: string;
  featureId: string;
  featureName: string;
  probeId: string;
  probeName: string;
  confidence: number;
  severity: RepairSeverity;
  causeType: RepairCauseType;
  category: RepairCategory;
  repairability: Repairability;
  targetType: RepairTargetType;
  summary: string;
  supportingEvidence: string[];
  relatedFiles?: string[];
  relatedRoutes?: string[];
  relatedEnvVars?: string[];
  relatedCommands?: string[];
  evidenceFingerprint: string;
}

// ── Repair precondition ───────────────────────────────────────────────────────

export interface RepairPrecondition {
  id: string;
  description: string;
  required: boolean;
  satisfied: boolean;
  failureReason?: string;
}

// ── Repair guardrails ─────────────────────────────────────────────────────────

export interface RepairGuardrails {
  allowFileWrites: boolean;
  allowCommandExecution: boolean;
  allowServiceRestarts: boolean;
  allowEnvMutation: boolean;
  allowMigrationExecution: boolean;
  allowDestructiveChanges: boolean;
  allowDependencyInstallation: boolean;
  allowProductionChanges: boolean;
  requirePreviewForUiRepairs: boolean;
  requireTestsAfterCodePatch: boolean;
  requireReverifyAfterAnyRepair: boolean;
}

// ── Repair action ─────────────────────────────────────────────────────────────

export interface RepairAction {
  id: string;
  type: RepairActionType;
  title: string;
  description: string;
  risk: RepairRisk;
  requiresApproval: boolean;
  timeoutMs?: number;
  files?: string[];
  commands?: string[];
  envVars?: string[];
  metadata?: Record<string, unknown>;
}

// ── Repair validation plan ────────────────────────────────────────────────────

export interface RepairValidationPlan {
  rerunVerifier: boolean;
  verifyFeatureIds: string[];
  verifyProbeIds?: string[];
  runTypecheck: boolean;
  runLint: boolean;
  runTests: boolean;
  runBuild: boolean;
  capturePreviewBefore?: boolean;
  capturePreviewAfter?: boolean;
  compareBeforeAfterPreview?: boolean;
}

// ── Repair rollback plan ──────────────────────────────────────────────────────

export interface RepairRollbackPlan {
  supported: boolean;
  strategy:
    | "git_restore"
    | "revert_patch"
    | "restore_backup"
    | "restart_previous_release"
    | "manual_only"
    | "none";
  commands?: string[];
  notes?: string[];
}

// ── Repair proposal ───────────────────────────────────────────────────────────

export interface RepairProposal {
  id: string;
  featureId: string;
  featureName: string;
  probeIds: string[];
  title: string;
  summary: string;
  rootCause: string;
  severity: RepairSeverity;
  risk: RepairRisk;
  confidence: number;
  category: RepairCategory;
  repairability: Repairability;
  executionMode: RepairExecutionMode;
  targetType: RepairTargetType;
  safeToAutoApply: boolean;
  requiresApproval: boolean;
  blockedReason?: string;
  affectedFiles?: string[];
  affectedRoutes?: string[];
  affectedEnvVars?: string[];
  affectedServices?: string[];
  hypotheses: RootCauseHypothesis[];
  preconditions: RepairPrecondition[];
  actions: RepairAction[];
  validationPlan: RepairValidationPlan;
  rollbackPlan: RepairRollbackPlan;
  warnings?: string[];
  notes?: string[];
  tags?: string[];
}

// ── Repair execution record ───────────────────────────────────────────────────

export interface RepairExecutionRecord {
  proposalId: string;
  startedAt: string;
  finishedAt?: string;
  status: RepairStatus;
  actionsAttempted: number;
  actionsSucceeded: number;
  actionsFailed: number;
  failures?: string[];
  evidence?: ProbeEvidence[];
  beforeRunId?: string;
  afterRunId?: string;
}

// ── Repair loop config ────────────────────────────────────────────────────────

export interface RepairLoopConfig {
  maxRepairRoundsPerRun: number;
  maxRepairsPerFeature: number;
  maxActionsPerProposal: number;
  blockOnRepeatedFailureCount: number;
  minConfidenceToAutoApply: number;
  minConfidenceToShowPrimaryProposal: number;
  enableParallelProposalGeneration: boolean;
  enableAutoRollbackOnRegression: boolean;
  requireHumanApprovalInProduction: boolean;
  stopOnCriticalRegression: boolean;
}

// ── Repair loop state ─────────────────────────────────────────────────────────

export interface RepairLoopState {
  round: number;
  startedAt: string;
  attemptedProposalIds: string[];
  attemptedFeatureIds: string[];
  fingerprintsSeen: string[];
  executionRecords: RepairExecutionRecord[];
  blockedFeatures: string[];
}

// ── Repair plan result ────────────────────────────────────────────────────────

export interface RepairPlanResult {
  runId: string;
  hypotheses: RootCauseHypothesis[];
  proposals: RepairProposal[];
  summary: {
    totalHypotheses: number;
    totalProposals: number;
    autoApplicable: number;
    approvalRequired: number;
    manualOnly: number;
    blocked: number;
  };
}
