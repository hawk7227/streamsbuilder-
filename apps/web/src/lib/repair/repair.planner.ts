import type {
  FeatureVerificationResult,
  ProbeEvidence,
  RepairAction,
  RepairCategory,
  RepairCauseType,
  RepairExecutionMode,
  RepairPlanResult,
  RepairPrecondition,
  RepairProposal,
  RepairRisk,
  RepairSeverity,
  RepairTargetType,
  Repairability,
  RootCauseHypothesis,
  VerificationRunResult,
} from "./repair.types";
import type { RepairPolicy } from "./repair.policy";
import type { ProbeResult } from "@/lib/verifier/types";
import {
  getPolicyForEnvironment,
  proposalCanAutoApply,
  resolveExecutionMode,
} from "./repair.policy";

function nowIso(): string {
  return new Date().toISOString();
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function makeId(prefix: string, seed: string): string {
  const normalized = seed.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  return `${prefix}_${normalized}`;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function collectStrings(...arrays: Array<string[] | undefined>): string[] {
  return unique(arrays.flatMap((arr) => arr ?? []).filter(Boolean));
}

function summarizeEvidence(probe: ProbeResult): string[] {
  const parts: string[] = [];
  if (typeof probe.actual?.httpStatus === "number") parts.push(`HTTP ${probe.actual.httpStatus}`);
  if (probe.actual?.errorCode) parts.push(`errorCode=${probe.actual.errorCode}`);
  if (probe.actual?.errorMessage) parts.push(`errorMessage=${probe.actual.errorMessage}`);
  if (typeof probe.actual?.latencyMs === "number") parts.push(`latencyMs=${probe.actual.latencyMs}`);
  if (probe.actual?.sideEffectObserved === false) parts.push("sideEffectObserved=false");
  for (const ev of probe.evidence) {
    if (!ev.ok) parts.push(`${ev.type}:${ev.label}`);
  }
  return unique(parts);
}

function inferSeverity(probe: ProbeResult): RepairSeverity {
  switch (probe.severity) {
    case "critical": return "critical";
    case "high": return "high";
    case "medium": return "medium";
    default: return "low";
  }
}

function inferTargetType(probe: ProbeResult): RepairTargetType {
  switch (probe.category) {
    case "route_exists":
    case "auth_guard":
    case "validation_guard":
    case "response_schema":
    case "stream_start":
    case "stream_complete":
      return "route";
    case "queue_present":
    case "job_enqueue":
    case "job_process":
      return "queue";
    case "worker_online":
      return "worker";
    case "db_schema_present":
      return "database";
    case "bucket_present":
    case "artifact_created":
    case "artifact_readback":
      return "storage";
    case "env_present":
    case "env_valid":
    case "credential_valid":
      return "env";
    case "package_installed":
    case "module_import":
      return "build";
    case "service_reachable":
      return "provider";
    default:
      return "unknown";
  }
}

function fingerprintForProbe(probe: ProbeResult, causeType: RepairCauseType): string {
  const values = [
    (probe as unknown as { featureId?: string }).featureId ?? "",
    probe.probeId,
    probe.category,
    causeType,
    String(probe.actual?.httpStatus ?? ""),
    String(probe.actual?.errorCode ?? ""),
    String(probe.actual?.errorMessage ?? ""),
  ].join("|");
  return makeId("fp", values);
}

function inferCause(probe: ProbeResult): {
  causeType: RepairCauseType;
  category: RepairCategory;
  repairability: Repairability;
  confidence: number;
  summary: string;
  relatedEnvVars?: string[];
  relatedRoutes?: string[];
  relatedFiles?: string[];
  relatedCommands?: string[];
} {
  const http = probe.actual?.httpStatus;
  const msg = (probe.actual?.errorMessage ?? "").toLowerCase();
  const response = (probe.actual?.responseSnippet ?? "").toLowerCase();

  switch (probe.category) {
    case "env_present":
      return { causeType: "missing_env", category: "env_fix", repairability: "approval_required", confidence: 0.97, summary: "Required environment variable is missing or empty." };
    case "env_valid":
      return { causeType: "invalid_env", category: "env_fix", repairability: "approval_required", confidence: 0.95, summary: "Environment variable exists but is invalid for intended use." };
    case "package_installed":
      return { causeType: "package_missing", category: "dependency_fix", repairability: "approval_required", confidence: 0.94, summary: "Required package is missing from the runtime or install set." };
    case "module_import":
      return { causeType: "module_import_failure", category: "code_patch", repairability: "auto_repairable", confidence: 0.88, summary: "Module import failed due to missing export, bad path, or broken module wiring." };
    case "route_exists":
      if (http === 404) return { causeType: "route_not_registered", category: "code_patch", repairability: "auto_repairable", confidence: 0.95, summary: "Route is not registered or handler path is missing." };
      return { causeType: "route_handler_failure", category: "code_patch", repairability: "auto_repairable", confidence: 0.72, summary: "Route exists but route logic likely failed before completing expected behavior." };
    case "auth_guard":
      return { causeType: "auth_miswire", category: "auth_fix", repairability: "approval_required", confidence: 0.86, summary: "Authentication gate behavior does not match the expected route contract." };
    case "validation_guard":
      return { causeType: "validation_miswire", category: "validation_fix", repairability: "auto_repairable", confidence: 0.9, summary: "Validation layer is missing, bypassed, or mapped to the wrong request schema." };
    case "service_reachable":
      return { causeType: "provider_unreachable", category: "provider_fix", repairability: "approval_required", confidence: 0.84, summary: "External or internal service cannot be reached from the current runtime." };
    case "credential_valid":
      return { causeType: "invalid_secret", category: "config_fix", repairability: "approval_required", confidence: 0.93, summary: "Credential exists but is invalid, expired, or rejected by the provider." };
    case "permission_read":
    case "permission_write":
    case "permission_execute":
      return { causeType: "permission_denied", category: "permission_fix", repairability: "approval_required", confidence: 0.93, summary: "Credential is present but lacks the required permission or scope." };
    case "db_schema_present":
      return { causeType: "db_schema_missing", category: "migration_fix", repairability: "approval_required", confidence: 0.95, summary: "Expected database schema, table, or column is missing." };
    case "bucket_present":
      return { causeType: "storage_bucket_missing", category: "storage_fix", repairability: "approval_required", confidence: 0.93, summary: "Expected storage bucket or object container does not exist." };
    case "queue_present":
      return { causeType: "queue_missing", category: "queue_fix", repairability: "approval_required", confidence: 0.92, summary: "Expected queue is missing or not registered." };
    case "worker_online":
      return { causeType: "worker_offline", category: "worker_fix", repairability: "approval_required", confidence: 0.94, summary: "Background worker is offline, unregistered, or failing startup." };
    case "job_enqueue":
      return { causeType: "queue_unreachable", category: "queue_fix", repairability: "approval_required", confidence: 0.87, summary: "Job enqueue path failed due to queue connectivity or queue contract issues." };
    case "job_process":
      return { causeType: "worker_stuck", category: "worker_fix", repairability: "approval_required", confidence: 0.84, summary: "Job was accepted but not completed by a healthy worker path." };
    case "response_schema":
      return { causeType: "response_schema_mismatch", category: "schema_fix", repairability: "auto_repairable", confidence: 0.89, summary: "Response shape does not match the declared or expected contract." };
    case "stream_start":
      return { causeType: "stream_start_failure", category: "code_patch", repairability: "auto_repairable", confidence: 0.85, summary: "Streaming request did not emit the initial stream event or first delta." };
    case "stream_complete":
      return { causeType: "stream_completion_failure", category: "code_patch", repairability: "auto_repairable", confidence: 0.83, summary: "Streaming request started but did not complete or emit the expected finish event." };
    case "artifact_created":
    case "artifact_readback":
    case "side_effect_confirmed":
      return { causeType: "side_effect_missing", category: "code_patch", repairability: "auto_repairable", confidence: 0.8, summary: "Primary request may succeed, but expected side effect or artifact proof is missing." };
    case "latency_budget":
      return { causeType: "route_handler_failure", category: "fallback_enable", repairability: "auto_repairable", confidence: 0.66, summary: "Feature exceeded latency budget and likely needs fallback or performance guard logic." };
    case "health_contract":
      return { causeType: "build_failure", category: "observability_fix", repairability: "auto_repairable", confidence: 0.61, summary: "Health contract or service status reporting is incomplete or inconsistent." };
    default:
      if (http === 401 && probe.category !== "auth_guard") return { causeType: "auth_miswire", category: "auth_fix", repairability: "approval_required", confidence: 0.62, summary: "Unexpected authentication failure blocked the intended execution path." };
      if (http === 400 && probe.category !== "validation_guard") return { causeType: "validation_miswire", category: "validation_fix", repairability: "auto_repairable", confidence: 0.6, summary: "Unexpected validation failure blocked the intended execution path." };
      if (response.includes("permission") || msg.includes("permission")) return { causeType: "permission_denied", category: "permission_fix", repairability: "approval_required", confidence: 0.7, summary: "Permission failure was detected in the response or error channel." };
      return { causeType: "unknown", category: "observability_fix", repairability: "unknown", confidence: 0.32, summary: "Probe failed, but no strong normalized root cause could be inferred yet." };
  }
}

function deriveRisk(category: RepairCategory, severity: RepairSeverity, targetType: RepairTargetType): RepairRisk {
  if (category === "auth_fix" || category === "permission_fix" || category === "migration_fix" || category === "env_fix") return "high";
  if (category === "dependency_fix" || category === "restart_service") return "high";
  if (targetType === "database" || targetType === "policy") return "high";
  if (severity === "critical") return "medium";
  return "low";
}

function buildPreconditions(category: RepairCategory, targetType: RepairTargetType, executionMode: RepairExecutionMode, policy: RepairPolicy): RepairPrecondition[] {
  const base: RepairPrecondition[] = [{
    id: "policy_allows_category",
    description: `Repair policy allows category ${category}`,
    required: true,
    satisfied: executionMode !== "blocked",
    failureReason: executionMode === "blocked" ? `Category ${category} is blocked by policy.` : undefined,
  }];
  if (targetType === "env") base.push({ id: "env_mutation_policy", description: "Environment mutation is allowed by policy", required: true, satisfied: policy.guardrails.allowEnvMutation, failureReason: policy.guardrails.allowEnvMutation ? undefined : "Policy disallows environment mutation." });
  if (category === "migration_fix") base.push({ id: "migration_policy", description: "Migration execution is allowed by policy", required: true, satisfied: policy.guardrails.allowMigrationExecution, failureReason: policy.guardrails.allowMigrationExecution ? undefined : "Policy disallows migrations." });
  if (category === "dependency_fix") base.push({ id: "dependency_install_policy", description: "Dependency installation is allowed by policy", required: true, satisfied: policy.guardrails.allowDependencyInstallation, failureReason: policy.guardrails.allowDependencyInstallation ? undefined : "Policy disallows dependency installation." });
  return base;
}

function fileCandidatesForHypothesis(h: RootCauseHypothesis): string[] {
  const guesses = [...(h.relatedFiles ?? [])];
  switch (h.targetType) {
    case "route": guesses.push("src/app/api/**/route.ts"); break;
    case "worker": guesses.push("src/workers/**", "workers/**"); break;
    case "queue": guesses.push("src/queues/**", "src/lib/queue/**"); break;
    case "database": guesses.push("supabase/migrations/**", "db/migrations/**"); break;
    case "component": guesses.push("src/components/**"); break;
  }
  return unique(guesses);
}

function actionsForHypothesis(h: RootCauseHypothesis, policy: RepairPolicy): RepairAction[] {
  const actions: RepairAction[] = [];
  switch (h.category) {
    case "code_patch":
      actions.push({ id: makeId("action", `${h.id}_collect_logs`), type: "collect_logs", title: "Collect route and runtime logs", description: "Collect targeted logs and failing response evidence before patch generation.", risk: "low", requiresApproval: false });
      actions.push({ id: makeId("action", `${h.id}_patch_file`), type: "patch_file", title: "Apply targeted code patch", description: "Patch the likely failing route, stream logic, or side-effect execution path.", risk: "medium", requiresApproval: false, files: fileCandidatesForHypothesis(h) });
      actions.push({ id: makeId("action", `${h.id}_typecheck`), type: "run_command", title: "Run targeted typecheck", description: "Run typecheck after patch application to prevent repair regressions.", risk: "low", requiresApproval: false, commands: ["pnpm typecheck"] });
      break;
    case "ui_patch":
      actions.push({ id: makeId("action", `${h.id}_capture_before`), type: "capture_preview", title: "Capture current runtime preview", description: "Capture exact current UI runtime view before proposing repair.", risk: "low", requiresApproval: false });
      actions.push({ id: makeId("action", `${h.id}_patch_ui`), type: "patch_file", title: "Apply UI repair patch", description: "Patch UI component or layout logic with preview-first validation.", risk: "medium", requiresApproval: false, files: fileCandidatesForHypothesis(h) });
      actions.push({ id: makeId("action", `${h.id}_render_after`), type: "render_preview", title: "Render repaired preview", description: "Render proposed runtime result and compare before/after.", risk: "low", requiresApproval: false });
      break;
    case "schema_fix":
    case "validation_fix":
      actions.push({ id: makeId("action", `${h.id}_patch_schema`), type: "patch_file", title: "Patch schema or validation contract", description: "Repair request/response schema definitions and route-level enforcement.", risk: "medium", requiresApproval: false, files: fileCandidatesForHypothesis(h) });
      actions.push({ id: makeId("action", `${h.id}_tests`), type: "run_command", title: "Run contract tests", description: "Run schema and route contract tests after patch.", risk: "low", requiresApproval: false, commands: ["pnpm test -- --runInBand"] });
      break;
    case "env_fix":
      actions.push({ id: makeId("action", `${h.id}_request_env`), type: "request_secret", title: "Request missing or corrected environment value", description: "Gather or replace the missing/invalid environment variable with approved values.", risk: "high", requiresApproval: true, envVars: h.relatedEnvVars });
      break;
    case "config_fix":
      actions.push({ id: makeId("action", `${h.id}_request_config`), type: "request_human_approval", title: "Approve credential or provider config repair", description: "Config-level repair changes require explicit approval.", risk: "high", requiresApproval: true });
      break;
    case "dependency_fix":
      actions.push({ id: makeId("action", `${h.id}_install_dep`), type: "run_command", title: "Install or reconcile dependency", description: "Install missing dependency or align version mismatch.", risk: "high", requiresApproval: true, commands: ["pnpm install"] });
      break;
    case "auth_fix":
    case "permission_fix":
      actions.push({ id: makeId("action", `${h.id}_collect_policy`), type: "collect_logs", title: "Collect auth and permission evidence", description: "Capture current auth middleware, policy path, and permission denial evidence.", risk: "low", requiresApproval: false });
      actions.push({ id: makeId("action", `${h.id}_approval_gate`), type: "request_human_approval", title: "Approve auth or permission repair", description: "Auth and permission changes require explicit review and approval.", risk: "high", requiresApproval: true });
      break;
    case "queue_fix":
    case "worker_fix":
      actions.push({ id: makeId("action", `${h.id}_collect_queue_logs`), type: "collect_logs", title: "Collect queue and worker logs", description: "Gather queue state, worker state, and processing history before repair.", risk: "low", requiresApproval: false });
      if (policy.guardrails.allowServiceRestarts) actions.push({ id: makeId("action", `${h.id}_restart_worker`), type: "restart_process", title: "Restart worker process", description: "Restart worker after configuration and health evidence are collected.", risk: "medium", requiresApproval: true });
      break;
    case "storage_fix":
    case "provider_fix":
    case "network_fix":
      actions.push({ id: makeId("action", `${h.id}_manual_repair`), type: "request_human_approval", title: "Request integration repair approval", description: "External service, storage, or network repair requires operator review.", risk: "high", requiresApproval: true });
      break;
    case "fallback_enable":
      actions.push({ id: makeId("action", `${h.id}_patch_fallback`), type: "patch_file", title: "Enable or repair fallback path", description: "Patch fallback behavior to prevent full feature failure.", risk: "low", requiresApproval: false, files: fileCandidatesForHypothesis(h) });
      break;
    case "migration_fix":
      actions.push({ id: makeId("action", `${h.id}_migration_approval`), type: "request_human_approval", title: "Approve migration repair", description: "Database schema changes require approval before execution.", risk: "high", requiresApproval: true });
      if (policy.guardrails.allowMigrationExecution) actions.push({ id: makeId("action", `${h.id}_run_migration`), type: "run_command", title: "Run migration", description: "Execute migration once approved.", risk: "high", requiresApproval: true, commands: ["pnpm db:migrate"] });
      break;
    case "observability_fix":
      actions.push({ id: makeId("action", `${h.id}_patch_health`), type: "patch_file", title: "Patch health/status contract", description: "Repair health reporting or observability contract for clearer diagnostics.", risk: "low", requiresApproval: false, files: fileCandidatesForHypothesis(h) });
      break;
    case "restart_service":
      actions.push({ id: makeId("action", `${h.id}_restart_service`), type: "restart_process", title: "Restart affected service", description: "Restart service after evidence collection and approval.", risk: "medium", requiresApproval: true });
      break;
    default:
      actions.push({ id: makeId("action", `${h.id}_incident`), type: "open_incident", title: "Open repair incident", description: "Create a repair incident because the system could not confidently auto-classify the failure.", risk: "low", requiresApproval: false });
      break;
  }
  return actions;
}

function buildProposalFromHypothesis(hypothesis: RootCauseHypothesis, feature: FeatureVerificationResult, policy: RepairPolicy): RepairProposal | null {
  const executionMode = resolveExecutionMode(hypothesis.category, deriveRisk(hypothesis.category, hypothesis.severity, hypothesis.targetType), hypothesis.severity, policy);
  const preconditions = buildPreconditions(hypothesis.category, hypothesis.targetType, executionMode, policy);
  const blockedReason = preconditions.find((p) => p.required && !p.satisfied)?.failureReason;
  const actions = actionsForHypothesis(hypothesis, policy);
  const risk = deriveRisk(hypothesis.category, hypothesis.severity, hypothesis.targetType);
  if (actions.length === 0) return null;

  const validationPlan: RepairProposal["validationPlan"] = {
    rerunVerifier: true,
    verifyFeatureIds: [feature.featureId],
    verifyProbeIds: [hypothesis.probeId],
    runTypecheck: hypothesis.category === "code_patch" || hypothesis.category === "schema_fix" || hypothesis.category === "validation_fix",
    runLint: hypothesis.category === "code_patch" || hypothesis.category === "ui_patch",
    runTests: policy.guardrails.requireTestsAfterCodePatch && (hypothesis.category === "code_patch" || hypothesis.category === "schema_fix" || hypothesis.category === "validation_fix"),
    runBuild: hypothesis.category === "dependency_fix" || hypothesis.category === "code_patch",
    capturePreviewBefore: hypothesis.category === "ui_patch" && policy.guardrails.requirePreviewForUiRepairs,
    capturePreviewAfter: hypothesis.category === "ui_patch" && policy.guardrails.requirePreviewForUiRepairs,
    compareBeforeAfterPreview: hypothesis.category === "ui_patch" && policy.guardrails.requirePreviewForUiRepairs,
  };

  const rollbackPlan: RepairProposal["rollbackPlan"] = {
    supported: hypothesis.category === "code_patch" || hypothesis.category === "ui_patch",
    strategy: hypothesis.category === "code_patch" || hypothesis.category === "ui_patch" ? "revert_patch" : "manual_only",
    commands: hypothesis.category === "code_patch" || hypothesis.category === "ui_patch" ? ["git diff --staged", "git restore --source=HEAD -- ."] : undefined,
    notes: hypothesis.category === "code_patch" || hypothesis.category === "ui_patch" ? ["Rollback should revert only the repair patch scope if regression is detected."] : ["Rollback must be performed manually for this repair category."],
  };

  const proposal: RepairProposal = {
    id: makeId("proposal", `${feature.featureId}_${hypothesis.probeId}_${hypothesis.causeType}`),
    featureId: feature.featureId,
    featureName: feature.featureName,
    probeIds: [hypothesis.probeId],
    title: `Repair ${feature.featureName}: ${hypothesis.summary}`,
    summary: `Proposed repair for ${feature.featureName} based on normalized root cause ${hypothesis.causeType}.`,
    rootCause: hypothesis.summary,
    severity: hypothesis.severity,
    risk,
    confidence: hypothesis.confidence,
    category: hypothesis.category,
    repairability: hypothesis.repairability,
    executionMode,
    targetType: hypothesis.targetType,
    safeToAutoApply: executionMode === "auto_apply" && risk !== "high" && risk !== "critical" && !preconditions.some((p) => p.required && !p.satisfied),
    requiresApproval: executionMode === "approval_required" || actions.some((a) => a.requiresApproval),
    blockedReason,
    affectedFiles: collectStrings(hypothesis.relatedFiles, actions.flatMap((a) => a.files ?? [])),
    affectedRoutes: hypothesis.relatedRoutes,
    affectedEnvVars: hypothesis.relatedEnvVars,
    affectedServices: hypothesis.relatedCommands?.filter((c) => c.includes("service")),
    hypotheses: [hypothesis],
    preconditions,
    actions,
    validationPlan,
    rollbackPlan,
    warnings: blockedReason ? [blockedReason] : undefined,
    notes: [`Generated at ${nowIso()}`, `Feature current status: ${feature.finalStatus}`],
    tags: [hypothesis.category, hypothesis.causeType, hypothesis.targetType],
  };

  if (!proposalCanAutoApply(proposal, policy) && executionMode === "auto_apply") {
    proposal.executionMode = "approval_required";
    proposal.requiresApproval = true;
    proposal.safeToAutoApply = false;
    proposal.warnings = unique([...(proposal.warnings ?? []), "Proposal fell below policy threshold for automatic application."]);
  }

  return proposal;
}

function normalizeHypotheses(features: FeatureVerificationResult[]): RootCauseHypothesis[] {
  const hypotheses: RootCauseHypothesis[] = [];
  for (const feature of features) {
    for (const probe of feature.probes) {
      if (probe.status !== "fail" && probe.status !== "warning") continue;
      const inferred = inferCause(probe);
      const targetType = inferTargetType(probe);
      hypotheses.push({
        id: makeId("hyp", `${feature.featureId}_${probe.probeId}_${inferred.causeType}`),
        featureId: feature.featureId,
        featureName: feature.featureName,
        probeId: probe.probeId,
        probeName: probe.probeName,
        confidence: clamp01(inferred.confidence),
        severity: inferSeverity(probe),
        causeType: inferred.causeType,
        category: inferred.category,
        repairability: inferred.repairability,
        targetType,
        summary: inferred.summary,
        supportingEvidence: summarizeEvidence(probe),
        relatedFiles: inferred.relatedFiles,
        relatedRoutes: inferred.relatedRoutes,
        relatedEnvVars: inferred.relatedEnvVars,
        relatedCommands: inferred.relatedCommands,
        evidenceFingerprint: fingerprintForProbe(probe, inferred.causeType),
      });
    }
  }
  const deduped = new Map<string, RootCauseHypothesis>();
  for (const h of hypotheses) {
    const existing = deduped.get(h.evidenceFingerprint);
    if (!existing || existing.confidence < h.confidence) deduped.set(h.evidenceFingerprint, h);
  }
  return Array.from(deduped.values()).sort((a, b) => b.confidence - a.confidence);
}

function groupHypothesesByFeature(hypotheses: RootCauseHypothesis[]): Map<string, RootCauseHypothesis[]> {
  const map = new Map<string, RootCauseHypothesis[]>();
  for (const h of hypotheses) {
    const current = map.get(h.featureId) ?? [];
    current.push(h);
    map.set(h.featureId, current);
  }
  return map;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) map.set(item.id, item);
  return Array.from(map.values());
}

function mergeSiblingProposals(proposals: RepairProposal[]): RepairProposal[] {
  const grouped = new Map<string, RepairProposal[]>();
  for (const proposal of proposals) {
    const key = `${proposal.featureId}|${proposal.category}|${proposal.executionMode}`;
    const current = grouped.get(key) ?? [];
    current.push(proposal);
    grouped.set(key, current);
  }
  const merged: RepairProposal[] = [];
  for (const group of grouped.values()) {
    if (group.length === 1) { merged.push(group[0]!); continue; }
    const base = { ...group[0]! };
    base.id = makeId("proposal", `${base.featureId}_${base.category}_merged`);
    base.probeIds = unique(group.flatMap((p) => p.probeIds));
    base.hypotheses = group.flatMap((p) => p.hypotheses);
    base.confidence = Math.max(...group.map((p) => p.confidence));
    base.affectedFiles = unique(group.flatMap((p) => p.affectedFiles ?? []));
    base.affectedRoutes = unique(group.flatMap((p) => p.affectedRoutes ?? []));
    base.affectedEnvVars = unique(group.flatMap((p) => p.affectedEnvVars ?? []));
    base.actions = uniqueById(group.flatMap((p) => p.actions));
    base.preconditions = uniqueById(group.flatMap((p) => p.preconditions));
    base.warnings = unique(group.flatMap((p) => p.warnings ?? []));
    base.notes = unique(group.flatMap((p) => p.notes ?? []));
    base.tags = unique(group.flatMap((p) => p.tags ?? []));
    base.title = `Repair ${base.featureName}: grouped ${base.category} proposal`;
    base.summary = `Grouped repair proposal covering ${base.probeIds.length} failing probes for ${base.featureName}.`;
    merged.push(base);
  }
  return merged.sort((a, b) => b.confidence - a.confidence);
}

export interface RepairPlannerOptions {
  policy?: RepairPolicy;
}

export function planRepairsFromVerification(verification: VerificationRunResult, options: RepairPlannerOptions = {}): RepairPlanResult {
  const policy = options.policy ?? getPolicyForEnvironment(verification.environment);
  const hypotheses = normalizeHypotheses(verification.features);
  const groupedByFeature = groupHypothesesByFeature(hypotheses);
  const proposals: RepairProposal[] = [];

  for (const feature of verification.features) {
    const featureHypotheses = groupedByFeature.get(feature.featureId) ?? [];
    for (const hypothesis of featureHypotheses) {
      if (hypothesis.confidence < policy.loop.minConfidenceToShowPrimaryProposal) continue;
      const proposal = buildProposalFromHypothesis(hypothesis, feature, policy);
      if (proposal) proposals.push(proposal);
    }
  }

  const merged = mergeSiblingProposals(proposals);
  return {
    runId: verification.runId,
    hypotheses,
    proposals: merged,
    summary: {
      totalHypotheses: hypotheses.length,
      totalProposals: merged.length,
      autoApplicable: merged.filter((p) => p.executionMode === "auto_apply").length,
      approvalRequired: merged.filter((p) => p.executionMode === "approval_required").length,
      manualOnly: merged.filter((p) => p.executionMode === "manual_only").length,
      blocked: merged.filter((p) => p.executionMode === "blocked").length,
    },
  };
}
