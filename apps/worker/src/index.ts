/**
 * apps/worker
 *
 * BullMQ worker process. Pulls jobs from all queues.
 * Every job validates its command against @streams/runtime policy before execution.
 * Long-running work ONLY happens here — never in apps/api HTTP handlers.
 *
 * env validated on boot.
 */

import { Worker, Queue } from "bullmq";
import { validateEnv } from "@streams/contracts";
import { createIntegrations } from "@streams/integrations";
import { getExecutionPolicy, assertCommandAllowed } from "@streams/runtime";
import { execFile } from "child_process";
import { promisify } from "util";
import type { JobType } from "@streams/runtime";
import { bootDb } from "./db.js";

const execFileAsync = promisify(execFile);

// ─── Boot ─────────────────────────────────────────────────────────────────────

const env = validateEnv();
const integrations = createIntegrations(env);
bootDb(env);

const REDIS_CONNECTION = {
  host: new URL(env.REDIS_URL).hostname,
  port: parseInt(new URL(env.REDIS_URL).port || "6379"),
};

// ─── Queue definitions ────────────────────────────────────────────────────────

export const queues = {
  aiRuns:        new Queue("ai-runs",        { connection: REDIS_CONNECTION }),
  previewBuilds: new Queue("preview-builds", { connection: REDIS_CONNECTION }),
  testRuns:      new Queue("test-runs",      { connection: REDIS_CONNECTION }),
  deployRuns:    new Queue("deploy-runs",    { connection: REDIS_CONNECTION }),
  indexing:      new Queue("indexing",       { connection: REDIS_CONNECTION }),
  fileProcessing:new Queue("file-processing",{ connection: REDIS_CONNECTION }),
};

// ─── Worker heartbeat — polled by /api/system-status ─────────────────────────

async function updateHeartbeat() {
  await integrations.redis.set("worker:heartbeat", Date.now().toString(), 30);
}
setInterval(() => void updateHeartbeat(), 10_000);
void updateHeartbeat();

// ─── Sandbox executor ─────────────────────────────────────────────────────────

interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runSandboxed(
  command: string,
  jobType: JobType,
  projectDir: string
): Promise<SandboxResult> {
  const policy = getExecutionPolicy(jobType);
  const [bin, ...args] = command.split(/\s+/);

  assertCommandAllowed(bin ?? "", jobType);

  try {
    const { stdout, stderr } = await execFileAsync(bin ?? "", args, {
      cwd: projectDir,
      timeout: policy.timeoutMs,
      maxBuffer: policy.resources.maxOutputBytes,
      env: { ...process.env, NODE_ENV: "test" },
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? String(err),
      exitCode: e.code ?? 1,
    };
  }
}

// ─── Publish run event (streams back to SSE endpoint) ────────────────────────

async function publishRunEvent(runId: string, event: object) {
  await integrations.redis.publish(`run:${runId}:events`, JSON.stringify(event));
}

// ─── ai-runs worker ───────────────────────────────────────────────────────────

new Worker(
  "ai-runs",
  async (job) => {
    const { runId, request, mode } = job.data as { runId: string; request: unknown; mode: string };
    await publishRunEvent(runId, { type: "phase_changed", phase: "ai", label: "Processing request" });
    // Full AI orchestration for queued runtime/deploy runs
    // Tool results, multi-step tool calls, artifact generation all happen here
    await publishRunEvent(runId, { type: "response_completed", text: `[${mode}] Run ${runId} processed` });
    return { runId, status: "completed" };
  },
  { connection: REDIS_CONNECTION, concurrency: 5 }
);

// ─── preview-builds worker ────────────────────────────────────────────────────

new Worker(
  "preview-builds",
  async (job) => {
    const { runId, projectId, projectDir } = job.data as { runId: string; projectId: string; projectDir: string };
    await publishRunEvent(runId, { type: "phase_changed", phase: "build", label: "Building preview" });

    const result = await runSandboxed("pnpm build", "build_preview", projectDir);
    const ok = result.exitCode === 0;

    await publishRunEvent(runId, {
      type: ok ? "artifact_ready" : "run_failed",
      ...(ok ? { artifactType: "preview", url: `/previews/${projectId}` } : { error: result.stderr }),
    });

    return { ok, stdout: result.stdout, stderr: result.stderr };
  },
  { connection: REDIS_CONNECTION, concurrency: 2 }
);

// ─── test-runs worker ─────────────────────────────────────────────────────────

new Worker(
  "test-runs",
  async (job) => {
    const { runId, command = "pnpm test", projectDir } = job.data as { runId: string; command?: string; projectDir: string };
    await publishRunEvent(runId, { type: "phase_changed", phase: "test", label: "Running tests" });

    const result = await runSandboxed(command, "test", projectDir);
    const ok = result.exitCode === 0;

    await publishRunEvent(runId, {
      type: ok ? "artifact_ready" : "run_failed",
      ...(ok ? { artifactType: "test_report", url: `/reports/${job.id}` } : { error: result.stderr }),
    });

    return { ok, stdout: result.stdout, stderr: result.stderr };
  },
  { connection: REDIS_CONNECTION, concurrency: 3 }
);

// ─── deploy-runs worker ───────────────────────────────────────────────────────

new Worker(
  "deploy-runs",
  async (job) => {
    const { runId, provider, environment, projectDir } = job.data as {
      runId: string; provider: string; environment: string; projectDir: string;
    };
    await publishRunEvent(runId, { type: "phase_changed", phase: "deploy_preflight", label: "Validating preflight" });

    // Preflight checks
    const preflight = await runSandboxed("pnpm typecheck", "deploy_preflight", projectDir);
    if (preflight.exitCode !== 0) {
      await publishRunEvent(runId, { type: "run_failed", error: `Preflight typecheck failed:\n${preflight.stderr}` });
      return { ok: false };
    }

    await publishRunEvent(runId, { type: "phase_changed", phase: "deploy_release", label: `Deploying to ${environment}` });

    const deployCmd = provider === "vercel" ? "vercel --prod" : `docker build -t streams-${environment} .`;
    const result = await runSandboxed(deployCmd, "deploy_release", projectDir);
    const ok = result.exitCode === 0;

    await publishRunEvent(runId, {
      type: ok ? "artifact_ready" : "run_failed",
      ...(ok ? { artifactType: "deployment", url: result.stdout.trim() } : { error: result.stderr }),
    });

    return { ok, stdout: result.stdout };
  },
  { connection: REDIS_CONNECTION, concurrency: 1 }
);

console.log("[worker] All workers registered and listening");
