/**
 * packages/core
 *
 * Pure business logic shared between apps/api and apps/worker.
 * No HTTP, no queue, no SDK clients. Those belong in their respective layers.
 * Depends only on @streams/contracts.
 */

import type { RunMode, RunStatus, SystemStatus } from "@streams/contracts";

// ─── Run lifecycle ────────────────────────────────────────────────────────────

export type RunTransition =
  | { from: "pending"; to: "running" }
  | { from: "running"; to: "completed" }
  | { from: "running"; to: "failed" }
  | { from: "running"; to: "cancelled" }
  | { from: "pending"; to: "cancelled" };

export function isValidTransition(from: RunStatus, to: RunStatus): boolean {
  const valid: Partial<Record<RunStatus, RunStatus[]>> = {
    pending: ["running", "cancelled"],
    running: ["completed", "failed", "cancelled"],
  };
  return valid[from]?.includes(to) ?? false;
}

export function assertValidTransition(from: RunStatus, to: RunStatus): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`[core] Invalid run transition: ${from} → ${to}`);
  }
}

// ─── Project context builder ──────────────────────────────────────────────────

export interface ProjectContext {
  projectId: string;
  name: string;
  repoUrl: string | null;
  defaultBranch: string;
  framework: string | null;
  recentFiles: string[];
}

export function buildProjectContextString(ctx: ProjectContext): string {
  const lines = [
    `Project: ${ctx.name} (${ctx.projectId})`,
    ctx.repoUrl ? `Repo: ${ctx.repoUrl} @ ${ctx.defaultBranch}` : null,
    ctx.framework ? `Framework: ${ctx.framework}` : null,
    ctx.recentFiles.length > 0
      ? `Recent files:\n${ctx.recentFiles.map((f) => `  - ${f}`).join("\n")}`
      : null,
  ].filter(Boolean);
  return lines.join("\n");
}

// ─── Mode capability map ──────────────────────────────────────────────────────

export const MODE_CAPABILITIES: Record<RunMode, string[]> = {
  helper: ["read_file", "list_files", "grep_project"],
  builder: ["read_file", "write_file", "list_files", "grep_project"],
  runtime: ["read_file", "write_file", "list_files", "grep_project", "run_command", "create_preview_build", "run_tests"],
  deploy: ["read_file", "write_file", "list_files", "grep_project", "run_command", "create_preview_build", "run_tests", "deploy_production"],
};

export function getCapabilitiesForMode(mode: RunMode): string[] {
  return MODE_CAPABILITIES[mode] ?? [];
}

// ─── Artifact helpers ─────────────────────────────────────────────────────────

export type ArtifactType = "preview" | "test_report" | "deployment" | "build_log";

export interface Artifact {
  type: ArtifactType;
  url: string;
  runId: string;
  projectId: string;
  createdAt: string;
}

export function makeArtifact(
  type: ArtifactType,
  url: string,
  runId: string,
  projectId: string
): Artifact {
  return { type, url, runId, projectId, createdAt: new Date().toISOString() };
}

// ─── System status helpers ────────────────────────────────────────────────────

export function systemStatusColor(status: SystemStatus["status"]): "green" | "yellow" | "red" {
  switch (status) {
    case "ok": return "green";
    case "degraded": return "yellow";
    case "down": return "red";
    default: return "red";
  }
}

export function allServicesOk(status: SystemStatus): boolean {
  return Object.values(status.services).every((s) => s === "ok");
}

export function failingServices(status: SystemStatus): string[] {
  return Object.entries(status.services)
    .filter(([, s]) => s !== "ok")
    .map(([name]) => name);
}
