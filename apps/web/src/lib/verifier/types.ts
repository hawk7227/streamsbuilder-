// ─── Verifier Spec Types — Source of Truth ────────────────────────────────────
// All types verbatim from the verifier spec document.
// Do not modify without updating the spec.

export type VerificationLevel =
  | "route"
  | "guard"
  | "dependency"
  | "configuration"
  | "connectivity"
  | "permission"
  | "functional"
  | "integrity"
  | "end_to_end";

export type VerificationFinalStatus =
  | "pass"
  | "fail"
  | "partial"
  | "warning"
  | "skipped"
  | "not_applicable";

export type ProbeStatus =
  | "pass"
  | "fail"
  | "warning"
  | "skipped"
  | "not_applicable";

export type ProbeCategory =
  | "route_exists"
  | "auth_guard"
  | "validation_guard"
  | "package_installed"
  | "module_import"
  | "env_present"
  | "env_valid"
  | "service_reachable"
  | "credential_valid"
  | "permission_read"
  | "permission_write"
  | "permission_execute"
  | "db_schema_present"
  | "bucket_present"
  | "queue_present"
  | "worker_online"
  | "job_enqueue"
  | "job_process"
  | "artifact_created"
  | "artifact_readback"
  | "response_schema"
  | "stream_start"
  | "stream_complete"
  | "side_effect_confirmed"
  | "latency_budget"
  | "health_contract";

export type ProbeSeverity = "critical" | "high" | "medium" | "low";

export type EvidenceType =
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
  | "timing";

export type UiBadge =
  | "FULLY_VERIFIED"
  | "DEGRADED"
  | "FAILED"
  | "GUARD_ONLY"
  | "ROUTE_ONLY"
  | "CONFIG_MISSING"
  | "PERMISSION_DENIED"
  | "INTEGRITY_FAILED";

// ── Core verifier config ───────────────────────────────────────────────────────

export interface VerifierSpec {
  version: string;
  generatedAt: string;
  environment: "local" | "preview" | "staging" | "production" | "test";
  strictMode: boolean;
  failOpenFeatures?: string[];
  features: FeatureVerifierSpec[];
}

export interface FeatureVerifierSpec {
  id: string;
  name: string;
  description: string;
  owner?: string;
  tags?: string[];
  requiredLevels: VerificationLevel[];
  dependencies?: DependencyRequirement[];
  configuration?: ConfigurationRequirement[];
  permissions?: PermissionRequirement[];
  probes: ProbeDefinition[];
  passRules: FeaturePassRules;
  reporting: FeatureReportingConfig;
}

export interface DependencyRequirement {
  id: string;
  kind: "npm_package" | "node_module" | "binary" | "service" | "worker" | "table" | "bucket" | "queue";
  name: string;
  required: boolean;
  versionRange?: string;
  importPath?: string;
  healthEndpoint?: string;
}

export interface ConfigurationRequirement {
  id: string;
  kind: "env" | "secret" | "db_schema" | "bucket" | "queue" | "feature_flag" | "provider_setting";
  name: string;
  required: boolean;
  redacted?: boolean;
  validator?: "non_empty" | "url" | "json" | "integer" | "boolean" | "enum";
  allowedValues?: string[];
}

export interface PermissionRequirement {
  id: string;
  resource: string;
  action: "read" | "write" | "update" | "delete" | "execute" | "enqueue" | "generate" | "stream";
  required: boolean;
}

export interface ProbeDefinition {
  id: string;
  name: string;
  category: ProbeCategory;
  level: VerificationLevel;
  severity: ProbeSeverity;
  required: boolean;
  timeoutMs: number;
  retries?: number;
  runMode: "unauthenticated" | "authenticated" | "service_role" | "system" | "hybrid";
  expects?: ProbeExpectation;
  input?: ProbeInput;
  integrity?: ProbeIntegrityRule[];
  onFail?: FailurePolicy;
  tags?: string[];
}

export interface ProbeExpectation {
  allowedHttpStatuses?: number[];
  expectedHttpStatus?: number;
  responseSchemaName?: string;
  requiresNonEmptyBody?: boolean;
  streamMustStart?: boolean;
  streamMustComplete?: boolean;
  minBytes?: number;
  maxLatencyMs?: number;
  expectedSideEffect?: ExpectedSideEffect;
}

export interface ProbeInput {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  route?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
  authProfileId?: string;
  fixtureId?: string;
}

export interface ExpectedSideEffect {
  type:
    | "db_row_created"
    | "db_row_updated"
    | "file_uploaded"
    | "artifact_created"
    | "job_enqueued"
    | "job_completed"
    | "message_persisted"
    | "stream_event_emitted";
  resource: string;
  matcher?: Record<string, unknown>;
}

export interface ProbeIntegrityRule {
  id: string;
  type:
    | "json_schema"
    | "non_empty_string"
    | "non_empty_array"
    | "url_resolves"
    | "file_size_gt"
    | "contains_keys"
    | "not_contains_error_shape"
    | "stream_has_first_delta"
    | "stream_has_finish_event";
  config?: Record<string, unknown>;
}

export interface FailurePolicy {
  continueFeatureVerification: boolean;
  downgradeFinalStatusTo?: VerificationFinalStatus;
  openIncident?: boolean;
  markFeatureDegraded?: boolean;
}

export interface FeaturePassRules {
  requireAllCritical: boolean;
  requireAllRequired: boolean;
  allowWarnings?: boolean;
  minimumPassingLevels?: VerificationLevel[];
  finalPassRequires?: {
    route?: boolean;
    guard?: boolean;
    dependency?: boolean;
    configuration?: boolean;
    connectivity?: boolean;
    permission?: boolean;
    functional?: boolean;
    integrity?: boolean;
  };
}

export interface FeatureReportingConfig {
  showProbeTable: boolean;
  showEvidence: boolean;
  showLatency: boolean;
  showExpectedVsActual: boolean;
  collapsePassingChecksByDefault?: boolean;
}

// ── Runtime result schema ──────────────────────────────────────────────────────

export interface ProbeEvidence {
  type: EvidenceType;
  label: string;
  ok: boolean;
  data?: Record<string, unknown>;
}

export interface ProbeResult {
  probeId: string;
  probeName: string;
  category: ProbeCategory;
  level: VerificationLevel;
  severity: ProbeSeverity;
  status: ProbeStatus;
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

export interface FeatureCoverage {
  route: ProbeStatus;
  guard: ProbeStatus;
  dependency: ProbeStatus;
  configuration: ProbeStatus;
  connectivity: ProbeStatus;
  permission: ProbeStatus;
  functional: ProbeStatus;
  integrity: ProbeStatus;
  endToEnd: ProbeStatus;
}

export interface FeatureRollup {
  requiredProbeCount: number;
  requiredProbePassedCount: number;
  criticalProbeCount: number;
  criticalProbePassedCount: number;
  reasonsForFailure?: string[];
  reasonsForWarning?: string[];
}

export interface FeatureVerificationResult {
  featureId: string;
  featureName: string;
  finalStatus: VerificationFinalStatus;
  featureOperationalStatus: "fully_operational" | "degraded" | "non_operational" | "unknown";
  coverage: FeatureCoverage;
  probes: ProbeResult[];
  rollup: FeatureRollup;
  notes?: string[];
}

export interface VerificationSummary {
  totalFeatures: number;
  passedFeatures: number;
  failedFeatures: number;
  partialFeatures: number;
  warningFeatures: number;
  skippedFeatures: number;
  totalProbes: number;
  passedProbes: number;
  failedProbes: number;
  warningProbes: number;
  skippedProbes: number;
  criticalFailures: number;
}

export interface VerificationIncident {
  id: string;
  featureId?: string;
  severity: ProbeSeverity;
  title: string;
  description: string;
  relatedProbeIds?: string[];
}

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
  // Extended by repair system — populated by /api/verify after planRepairsFromVerification()
  rootCauseHypotheses?: unknown[];
  repairProposals?: unknown[];
}

// ── Bot-facing compact schema ──────────────────────────────────────────────────

export interface BuilderVerifierFeatureSummary {
  featureId: string;
  featureName: string;
  uiBadge: UiBadge;
  finalStatus: VerificationFinalStatus;
  operationalStatus: "fully_operational" | "degraded" | "non_operational" | "unknown";
  routeExists: boolean;
  authGuardWorks: boolean;
  validationWorks: boolean;
  dependencyReady: boolean;
  configurationReady: boolean;
  connectivityReady: boolean;
  permissionsReady: boolean;
  functionalProbePassed: boolean;
  integrityProbePassed: boolean;
  criticalFailures: string[];
  warnings: string[];
  evidenceCount: number;
  probes: ProbeResult[];
  repairProposals?: unknown[];
}

export interface BuilderVerifierBotPayload {
  runId: string;
  startedAt: string;
  finishedAt: string;
  environment: string;
  overallStatus: VerificationFinalStatus;
  summary: {
    fullyVerified: number;
    degraded: number;
    failed: number;
    guardOnly: number;
    routeOnly: number;
  };
  features: BuilderVerifierFeatureSummary[];
}

// ── Default pass rules ─────────────────────────────────────────────────────────

export const DEFAULT_FEATURE_PASS_RULES: FeaturePassRules = {
  requireAllCritical: true,
  requireAllRequired: true,
  allowWarnings: false,
  finalPassRequires: {
    route: true,
    guard: true,
    dependency: true,
    configuration: true,
    connectivity: true,
    permission: true,
    functional: true,
    integrity: true,
  },
};
