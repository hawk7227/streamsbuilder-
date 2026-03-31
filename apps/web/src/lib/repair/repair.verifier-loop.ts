import type {
  RepairExecutionRecord,
  RepairLoopState,
  RepairPlanResult,
  RepairProposal,
  RepairStatus,
  VerificationRunResult,
} from "./repair.types";
import type { RepairPolicy } from "./repair.policy";
import { getPolicyForEnvironment, proposalCanAutoApply } from "./repair.policy";
import { planRepairsFromVerification } from "./repair.planner";

export interface RepairExecutor {
  executeProposal(proposal: RepairProposal): Promise<RepairExecutionRecord>;
}

export interface VerificationRunner {
  runVerification(featureIds?: string[], probeIds?: string[]): Promise<VerificationRunResult>;
}

export interface RepairLoopDeps {
  verifier: VerificationRunner;
  executor: RepairExecutor;
  policy?: RepairPolicy;
  logger?: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
}

export interface RepairLoopRunResult {
  initialVerification: VerificationRunResult;
  finalVerification: VerificationRunResult;
  roundCount: number;
  loopState: RepairLoopState;
  lastRepairPlan?: RepairPlanResult;
  overallRepairStatus: RepairStatus;
  summary: {
    proposalsAttempted: number;
    proposalsSucceeded: number;
    proposalsFailed: number;
    proposalsBlocked: number;
    regressionsDetected: number;
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeExecutionRecordBlocked(proposal: RepairProposal, reason: string): RepairExecutionRecord {
  return { proposalId: proposal.id, startedAt: nowIso(), finishedAt: nowIso(), status: "blocked", actionsAttempted: 0, actionsSucceeded: 0, actionsFailed: 0, failures: [reason] };
}

function isVerificationHealthy(verification: VerificationRunResult): boolean {
  return verification.overallStatus === "pass";
}

function countFeatureFailures(verification: VerificationRunResult): number {
  return verification.features.filter((f) => f.finalStatus === "fail" || f.finalStatus === "partial" || f.finalStatus === "warning").length;
}

function hasCriticalRegression(before: VerificationRunResult, after: VerificationRunResult): boolean {
  if (countFeatureFailures(after) > countFeatureFailures(before)) return true;
  const beforePassed = before.features.filter((f) => f.finalStatus === "pass").map((f) => f.featureId);
  const afterMap = new Map(after.features.map((f) => [f.featureId, f.finalStatus]));
  for (const featureId of beforePassed) {
    const status = afterMap.get(featureId);
    if (status && status !== "pass") return true;
  }
  return false;
}

function chooseExecutableProposals(plan: RepairPlanResult, policy: RepairPolicy, state: RepairLoopState): RepairProposal[] {
  return plan.proposals.filter((proposal) => {
    if (state.attemptedProposalIds.includes(proposal.id)) return false;
    const attemptsForFeature = state.executionRecords.filter((r) => plan.proposals.find((p) => p.id === r.proposalId)?.featureId === proposal.featureId).length;
    if (attemptsForFeature >= policy.loop.maxRepairsPerFeature) return false;
    const repeatCount = state.fingerprintsSeen.filter((fp) => proposal.hypotheses.some((h) => h.evidenceFingerprint === fp)).length;
    if (repeatCount >= policy.loop.blockOnRepeatedFailureCount) return false;
    return true;
  });
}

function summarizeOverallStatus(initial: VerificationRunResult, final: VerificationRunResult, state: RepairLoopState, regressionsDetected: number): RepairStatus {
  if (regressionsDetected > 0 && final.overallStatus !== "pass") return "failed";
  const succeeded = state.executionRecords.some((r) => r.status === "succeeded");
  const failed = state.executionRecords.some((r) => r.status === "failed");
  const blocked = state.executionRecords.some((r) => r.status === "blocked");
  if (final.overallStatus === "pass" && succeeded) return "succeeded";
  if (final.overallStatus === initial.overallStatus && blocked && !succeeded) return "blocked";
  if (succeeded && final.overallStatus !== "pass") return "partial";
  if (failed) return "failed";
  if (blocked) return "blocked";
  return "proposed";
}

export async function runRepairVerifierLoop(deps: RepairLoopDeps): Promise<RepairLoopRunResult> {
  const initialVerification = await deps.verifier.runVerification();
  const policy = deps.policy ?? getPolicyForEnvironment(initialVerification.environment);
  const logger = deps.logger ?? { info: () => undefined, warn: () => undefined, error: () => undefined };

  const state: RepairLoopState = {
    round: 0,
    startedAt: nowIso(),
    attemptedProposalIds: [],
    attemptedFeatureIds: [],
    fingerprintsSeen: [],
    executionRecords: [],
    blockedFeatures: [],
  };

  let currentVerification = initialVerification;
  let lastRepairPlan: RepairPlanResult | undefined;
  let regressionsDetected = 0;

  if (isVerificationHealthy(initialVerification)) {
    return { initialVerification, finalVerification: initialVerification, roundCount: 0, loopState: state, overallRepairStatus: "succeeded", summary: { proposalsAttempted: 0, proposalsSucceeded: 0, proposalsFailed: 0, proposalsBlocked: 0, regressionsDetected: 0 } };
  }

  for (let round = 1; round <= policy.loop.maxRepairRoundsPerRun; round += 1) {
    state.round = round;
    logger.info("repair_loop_round_started", { round, runId: currentVerification.runId, overallStatus: currentVerification.overallStatus });

    lastRepairPlan = planRepairsFromVerification(currentVerification, { policy });
    const executable = chooseExecutableProposals(lastRepairPlan, policy, state).slice(0, policy.loop.enableParallelProposalGeneration ? policy.loop.maxActionsPerProposal : 1);

    if (executable.length === 0) {
      logger.warn("repair_loop_no_executable_proposals", { round, runId: currentVerification.runId });
      break;
    }

    for (const proposal of executable) {
      state.attemptedProposalIds.push(proposal.id);
      state.attemptedFeatureIds.push(proposal.featureId);
      for (const hypothesis of proposal.hypotheses) state.fingerprintsSeen.push(hypothesis.evidenceFingerprint);

      if (proposal.executionMode === "blocked") {
        state.executionRecords.push(makeExecutionRecordBlocked(proposal, proposal.blockedReason ?? "Proposal blocked by policy."));
        state.blockedFeatures.push(proposal.featureId);
        logger.warn("repair_loop_proposal_blocked", { proposalId: proposal.id, featureId: proposal.featureId, reason: proposal.blockedReason });
        continue;
      }

      if (proposal.executionMode === "manual_only") {
        state.executionRecords.push(makeExecutionRecordBlocked(proposal, "Proposal requires manual operator intervention."));
        state.blockedFeatures.push(proposal.featureId);
        logger.warn("repair_loop_proposal_manual_only", { proposalId: proposal.id, featureId: proposal.featureId });
        continue;
      }

      if (proposal.executionMode === "approval_required" && !proposalCanAutoApply(proposal, policy)) {
        state.executionRecords.push(makeExecutionRecordBlocked(proposal, "Proposal requires human approval before execution."));
        state.blockedFeatures.push(proposal.featureId);
        logger.warn("repair_loop_proposal_approval_required", { proposalId: proposal.id, featureId: proposal.featureId });
        continue;
      }

      logger.info("repair_loop_executing_proposal", { proposalId: proposal.id, featureId: proposal.featureId });
      const beforeRunId = currentVerification.runId;
      const execution = await deps.executor.executeProposal(proposal);
      execution.beforeRunId = beforeRunId;
      state.executionRecords.push(execution);

      const afterVerification = await deps.verifier.runVerification(proposal.validationPlan.verifyFeatureIds, proposal.validationPlan.verifyProbeIds);
      execution.afterRunId = afterVerification.runId;

      if (hasCriticalRegression(currentVerification, afterVerification)) {
        regressionsDetected += 1;
        logger.error("repair_loop_regression_detected", { proposalId: proposal.id, featureId: proposal.featureId, beforeRunId, afterRunId: afterVerification.runId });
        if (policy.loop.stopOnCriticalRegression) { currentVerification = afterVerification; break; }
      }

      currentVerification = mergeVerificationResults(currentVerification, afterVerification);
      if (isVerificationHealthy(currentVerification)) {
        logger.info("repair_loop_verification_fully_passed", { runId: currentVerification.runId, round });
        break;
      }
    }

    if (isVerificationHealthy(currentVerification)) break;
  }

  return {
    initialVerification,
    finalVerification: currentVerification,
    roundCount: state.round,
    loopState: state,
    lastRepairPlan,
    overallRepairStatus: summarizeOverallStatus(initialVerification, currentVerification, state, regressionsDetected),
    summary: {
      proposalsAttempted: state.executionRecords.length,
      proposalsSucceeded: state.executionRecords.filter((r) => r.status === "succeeded").length,
      proposalsFailed: state.executionRecords.filter((r) => r.status === "failed").length,
      proposalsBlocked: state.executionRecords.filter((r) => r.status === "blocked").length,
      regressionsDetected,
    },
  };
}

export function mergeVerificationResults(baseline: VerificationRunResult, targeted: VerificationRunResult): VerificationRunResult {
  const featureMap = new Map(baseline.features.map((f) => [f.featureId, f]));
  for (const feature of targeted.features) featureMap.set(feature.featureId, feature);
  const mergedFeatures = Array.from(featureMap.values());
  const failedFeatures = mergedFeatures.filter((f) => f.finalStatus === "fail").length;
  const partialFeatures = mergedFeatures.filter((f) => f.finalStatus === "partial").length;
  const warningFeatures = mergedFeatures.filter((f) => f.finalStatus === "warning").length;
  const passedFeatures = mergedFeatures.filter((f) => f.finalStatus === "pass").length;
  const skippedFeatures = mergedFeatures.filter((f) => f.finalStatus === "skipped").length;
  return {
    ...baseline,
    runId: targeted.runId,
    finishedAt: targeted.finishedAt,
    durationMs: targeted.durationMs,
    overallStatus: failedFeatures > 0 ? "fail" : partialFeatures > 0 ? "partial" : warningFeatures > 0 ? "warning" : "pass",
    features: mergedFeatures,
    summary: {
      ...baseline.summary,
      totalFeatures: mergedFeatures.length,
      passedFeatures,
      failedFeatures,
      partialFeatures,
      warningFeatures,
      skippedFeatures,
    },
  };
}
