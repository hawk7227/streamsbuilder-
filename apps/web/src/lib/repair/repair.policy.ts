import type {
  RepairCategory,
  RepairExecutionMode,
  RepairGuardrails,
  RepairLoopConfig,
  RepairProposal,
  RepairRisk,
  RepairSeverity,
} from "./repair.types";

export interface RepairPolicy {
  name: string;
  environment: "local" | "preview" | "staging" | "production" | "test";
  autoApplyCategories: ReadonlySet<RepairCategory>;
  approvalRequiredCategories: ReadonlySet<RepairCategory>;
  manualOnlyCategories: ReadonlySet<RepairCategory>;
  blockedCategories: ReadonlySet<RepairCategory>;
  guardrails: RepairGuardrails;
  loop: RepairLoopConfig;
}

export const DEFAULT_REPAIR_GUARDRAILS: RepairGuardrails = {
  allowFileWrites: true,
  allowCommandExecution: true,
  allowServiceRestarts: false,
  allowEnvMutation: false,
  allowMigrationExecution: false,
  allowDestructiveChanges: false,
  allowDependencyInstallation: false,
  allowProductionChanges: false,
  requirePreviewForUiRepairs: true,
  requireTestsAfterCodePatch: true,
  requireReverifyAfterAnyRepair: true,
};

export const DEFAULT_REPAIR_LOOP_CONFIG: RepairLoopConfig = {
  maxRepairRoundsPerRun: 3,
  maxRepairsPerFeature: 2,
  maxActionsPerProposal: 8,
  blockOnRepeatedFailureCount: 2,
  minConfidenceToAutoApply: 0.84,
  minConfidenceToShowPrimaryProposal: 0.55,
  enableParallelProposalGeneration: true,
  enableAutoRollbackOnRegression: true,
  requireHumanApprovalInProduction: true,
  stopOnCriticalRegression: true,
};

export const LOCAL_REPAIR_POLICY: RepairPolicy = {
  name: "local-default",
  environment: "local",
  autoApplyCategories: new Set<RepairCategory>([
    "code_patch",
    "ui_patch",
    "schema_fix",
    "validation_fix",
    "fallback_enable",
    "observability_fix",
  ]),
  approvalRequiredCategories: new Set<RepairCategory>([
    "config_fix",
    "env_fix",
    "dependency_fix",
    "auth_fix",
    "permission_fix",
    "queue_fix",
    "worker_fix",
    "storage_fix",
    "provider_fix",
    "restart_service",
    "migration_fix",
  ]),
  manualOnlyCategories: new Set<RepairCategory>(["network_fix"]),
  blockedCategories: new Set<RepairCategory>([]),
  guardrails: {
    ...DEFAULT_REPAIR_GUARDRAILS,
    allowServiceRestarts: true,
    allowDependencyInstallation: true,
    allowMigrationExecution: true,
  },
  loop: DEFAULT_REPAIR_LOOP_CONFIG,
};

export const PREVIEW_REPAIR_POLICY: RepairPolicy = {
  ...LOCAL_REPAIR_POLICY,
  name: "preview-default",
  environment: "preview",
  guardrails: {
    ...LOCAL_REPAIR_POLICY.guardrails,
    allowDependencyInstallation: false,
    allowMigrationExecution: false,
    allowEnvMutation: false,
  },
};

export const STAGING_REPAIR_POLICY: RepairPolicy = {
  ...PREVIEW_REPAIR_POLICY,
  name: "staging-default",
  environment: "staging",
  guardrails: {
    ...PREVIEW_REPAIR_POLICY.guardrails,
    allowServiceRestarts: false,
    allowProductionChanges: false,
  },
};

export const PRODUCTION_REPAIR_POLICY: RepairPolicy = {
  name: "production-restricted",
  environment: "production",
  autoApplyCategories: new Set<RepairCategory>(["observability_fix"]),
  approvalRequiredCategories: new Set<RepairCategory>([
    "code_patch",
    "ui_patch",
    "schema_fix",
    "validation_fix",
    "fallback_enable",
    "config_fix",
    "env_fix",
    "dependency_fix",
    "auth_fix",
    "permission_fix",
    "queue_fix",
    "worker_fix",
    "storage_fix",
    "provider_fix",
    "restart_service",
    "migration_fix",
  ]),
  manualOnlyCategories: new Set<RepairCategory>(["network_fix"]),
  blockedCategories: new Set<RepairCategory>([]),
  guardrails: {
    ...DEFAULT_REPAIR_GUARDRAILS,
    allowFileWrites: false,
    allowCommandExecution: false,
    allowServiceRestarts: false,
    allowEnvMutation: false,
    allowMigrationExecution: false,
    allowDestructiveChanges: false,
    allowDependencyInstallation: false,
    allowProductionChanges: false,
  },
  loop: {
    ...DEFAULT_REPAIR_LOOP_CONFIG,
    minConfidenceToAutoApply: 0.99,
    requireHumanApprovalInProduction: true,
  },
};

export function resolveExecutionMode(
  category: RepairCategory,
  risk: RepairRisk,
  severity: RepairSeverity,
  policy: RepairPolicy,
): RepairExecutionMode {
  if (policy.blockedCategories.has(category)) return "blocked";
  if (policy.manualOnlyCategories.has(category)) return "manual_only";
  if (policy.approvalRequiredCategories.has(category)) return "approval_required";
  if (policy.autoApplyCategories.has(category)) {
    if (risk === "critical") return "approval_required";
    if (severity === "critical" && policy.environment !== "local") return "approval_required";
    return "auto_apply";
  }
  return "approval_required";
}

export function isActionAllowed(category: RepairCategory, policy: RepairPolicy): boolean {
  return !policy.blockedCategories.has(category);
}

export function proposalCanAutoApply(proposal: RepairProposal, policy: RepairPolicy): boolean {
  if (proposal.executionMode !== "auto_apply") return false;
  if (!proposal.safeToAutoApply) return false;
  if (proposal.requiresApproval) return false;
  if (proposal.confidence < policy.loop.minConfidenceToAutoApply) return false;
  if (policy.environment === "production" && policy.loop.requireHumanApprovalInProduction) return false;
  if (proposal.risk === "high" || proposal.risk === "critical") return false;
  return true;
}

export function getPolicyForEnvironment(environment: RepairPolicy["environment"]): RepairPolicy {
  switch (environment) {
    case "local": return LOCAL_REPAIR_POLICY;
    case "preview": return PREVIEW_REPAIR_POLICY;
    case "staging": return STAGING_REPAIR_POLICY;
    case "production": return PRODUCTION_REPAIR_POLICY;
    case "test": return LOCAL_REPAIR_POLICY;
    default: return LOCAL_REPAIR_POLICY;
  }
}
