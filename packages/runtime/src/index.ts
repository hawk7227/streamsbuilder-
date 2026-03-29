/**
 * packages/runtime
 *
 * Execution policy enforcement for all worker sandbox jobs.
 * Nothing in apps/worker runs a command without passing through this package.
 * All limits are hard — no overrides at call site.
 */

import type { RunModeSchema } from "@streams/contracts";
import type { z } from "zod";

export type RunMode = z.infer<typeof RunModeSchema>;

// ─── Job types ────────────────────────────────────────────────────────────────

export type JobType =
  | "install_dependencies"
  | "build_preview"
  | "lint"
  | "typecheck"
  | "test"
  | "run_script"
  | "deploy_preflight"
  | "deploy_release";

// ─── Timeout limits (ms) — enforced, not configurable per call ───────────────

export const JOB_TIMEOUTS_MS: Record<JobType, number> = {
  install_dependencies: 120_000,
  build_preview: 300_000,
  lint: 60_000,
  typecheck: 60_000,
  test: 180_000,
  run_script: 30_000,
  deploy_preflight: 60_000,
  deploy_release: 300_000,
};

// ─── Resource limits ──────────────────────────────────────────────────────────

export interface ResourceLimits {
  maxMemoryMb: number;
  maxCpuPercent: number;
  maxOutputBytes: number;
  networkPolicy: "none" | "restricted" | "full";
}

export const JOB_RESOURCE_LIMITS: Record<JobType, ResourceLimits> = {
  install_dependencies: { maxMemoryMb: 512, maxCpuPercent: 80, maxOutputBytes: 10_000_000, networkPolicy: "restricted" },
  build_preview:        { maxMemoryMb: 1024, maxCpuPercent: 90, maxOutputBytes: 50_000_000, networkPolicy: "none" },
  lint:                 { maxMemoryMb: 256, maxCpuPercent: 50, maxOutputBytes: 1_000_000, networkPolicy: "none" },
  typecheck:            { maxMemoryMb: 512, maxCpuPercent: 80, maxOutputBytes: 1_000_000, networkPolicy: "none" },
  test:                 { maxMemoryMb: 512, maxCpuPercent: 80, maxOutputBytes: 10_000_000, networkPolicy: "none" },
  run_script:           { maxMemoryMb: 256, maxCpuPercent: 50, maxOutputBytes: 1_000_000, networkPolicy: "none" },
  deploy_preflight:     { maxMemoryMb: 256, maxCpuPercent: 30, maxOutputBytes: 1_000_000, networkPolicy: "restricted" },
  deploy_release:       { maxMemoryMb: 512, maxCpuPercent: 50, maxOutputBytes: 10_000_000, networkPolicy: "full" },
};

// ─── Command allowlist — only these base commands may be spawned ──────────────

const BASE_ALLOWED_COMMANDS = new Set([
  "node", "pnpm", "npm", "npx", "tsc", "eslint", "vitest",
  "turbo", "next", "prisma", "drizzle-kit",
]);

const DEPLOY_ALLOWED_COMMANDS = new Set([
  ...BASE_ALLOWED_COMMANDS,
  "vercel", "docker", "fly", "railway",
]);

export function isCommandAllowed(command: string, jobType: JobType): boolean {
  const base = command.split(/\s+/)[0] ?? "";
  const allowed = jobType.startsWith("deploy") ? DEPLOY_ALLOWED_COMMANDS : BASE_ALLOWED_COMMANDS;
  return allowed.has(base);
}

// ─── Execution policy ─────────────────────────────────────────────────────────

export interface ExecutionPolicy {
  jobType: JobType;
  timeoutMs: number;
  resources: ResourceLimits;
  allowedCommands: Set<string>;
  requiresSecretInjection: boolean;
  requiresAuditLog: boolean;
}

export function getExecutionPolicy(jobType: JobType): ExecutionPolicy {
  return {
    jobType,
    timeoutMs: JOB_TIMEOUTS_MS[jobType],
    resources: JOB_RESOURCE_LIMITS[jobType],
    allowedCommands: jobType.startsWith("deploy") ? DEPLOY_ALLOWED_COMMANDS : BASE_ALLOWED_COMMANDS,
    requiresSecretInjection: jobType === "deploy_release" || jobType === "install_dependencies",
    requiresAuditLog: jobType === "deploy_release" || jobType === "deploy_preflight",
  };
}

// ─── Policy enforcement guard ─────────────────────────────────────────────────

export function assertCommandAllowed(command: string, jobType: JobType): void {
  if (!isCommandAllowed(command, jobType)) {
    throw new Error(
      `[runtime:policy] Command "${command}" is not allowed for job type "${jobType}"`
    );
  }
}

export function assertWithinTimeout(startedAt: Date, jobType: JobType): void {
  const elapsed = Date.now() - startedAt.getTime();
  const limit = JOB_TIMEOUTS_MS[jobType];
  if (elapsed > limit) {
    throw new Error(
      `[runtime:policy] Job "${jobType}" exceeded timeout ${limit}ms (elapsed: ${elapsed}ms)`
    );
  }
}
