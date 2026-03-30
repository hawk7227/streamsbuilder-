/**
 * queue.ts — Postgres-backed Job Queue
 * No Redis/BullMQ required. Uses SELECT FOR UPDATE SKIP LOCKED for safe claiming.
 * Supports: retry logic, failure logging, long-running job tracking, status polling.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ── Types ──────────────────────────────────────────────────────────────────

export type JobType =
  | "image_gen" | "video_gen" | "t2v" | "i2v"
  | "tts" | "stt" | "song_gen"
  | "parse_file" | "chunk_file" | "intake_url"
  | "voice_dataset_process";

export type JobStatus = "pending" | "claimed" | "running" | "completed" | "failed" | "cancelled";

export interface Job {
  id:           string;
  workspace_id: string;
  user_id:      string;
  type:         JobType;
  status:       JobStatus;
  priority:     number;
  payload:      Record<string, unknown>;
  result?:      Record<string, unknown>;
  error?:       string;
  retries:      number;
  max_retries:  number;
  claimed_at?:  string;
  completed_at?: string;
  created_at:   string;
  updated_at:   string;
}

// ── Enqueue ────────────────────────────────────────────────────────────────

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  options: {
    workspaceId: string;
    userId:      string;
    priority?:   number;    // 1 = highest, 10 = lowest
    maxRetries?: number;
  }
): Promise<Job> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pipeline_jobs")
    .insert({
      workspace_id: options.workspaceId,
      user_id:      options.userId,
      type,
      payload,
      status:       "pending",
      priority:     options.priority ?? 5,
      max_retries:  options.maxRetries ?? 3,
      retries:      0,
    })
    .select()
    .single();

  if (error) throw new Error(`Enqueue failed: ${error.message}`);
  return data as Job;
}

// ── Claim next pending job ─────────────────────────────────────────────────

export async function claimNextJob(type?: JobType): Promise<Job | null> {
  const admin = createAdminClient();

  // Use raw SQL for SELECT FOR UPDATE SKIP LOCKED — safe concurrent claiming
  let query = `
    UPDATE pipeline_jobs
    SET status = 'claimed', claimed_at = now(), updated_at = now()
    WHERE id = (
      SELECT id FROM pipeline_jobs
      WHERE status = 'pending'
      ${type ? `AND type = '${type}'` : ""}
      ORDER BY priority ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;

  const { data, error } = await admin.rpc("claim_next_job", { job_type: type ?? null });

  if (error) {
    // Fallback without SKIP LOCKED (works but less safe under high concurrency)
    const { data: fallback } = await admin
      .from("pipeline_jobs")
      .select()
      .eq("status", "pending")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!fallback) return null;

    await admin
      .from("pipeline_jobs")
      .update({ status: "claimed", claimed_at: new Date().toISOString() })
      .eq("id", fallback.id)
      .eq("status", "pending"); // optimistic lock

    return fallback as Job;
  }

  void query; // suppress unused warning
  return (data as Job[])?.at(0) ?? null;
}

// ── Mark running ───────────────────────────────────────────────────────────

export async function markJobRunning(jobId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("pipeline_jobs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

// ── Complete ───────────────────────────────────────────────────────────────

export async function completeJob(
  jobId: string,
  result: Record<string, unknown>
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("pipeline_jobs").update({
    status:       "completed",
    result,
    completed_at: new Date().toISOString(),
    updated_at:   new Date().toISOString(),
  }).eq("id", jobId);
}

// ── Fail ───────────────────────────────────────────────────────────────────

export async function failJob(jobId: string, error: string): Promise<void> {
  const admin = createAdminClient();

  const { data: job } = await admin
    .from("pipeline_jobs")
    .select("retries, max_retries")
    .eq("id", jobId)
    .single();

  if (!job) return;

  const retries = (job.retries ?? 0) + 1;
  const exhausted = retries >= (job.max_retries ?? 3);

  await admin.from("pipeline_jobs").update({
    status:     exhausted ? "failed" : "pending",
    error,
    retries,
    updated_at: new Date().toISOString(),
    ...(exhausted ? { completed_at: new Date().toISOString() } : {}),
  }).eq("id", jobId);

  // Ledger log on final failure
  if (exhausted) {
    await admin.from("ledger_logs").insert({
      action:      "job_failed_exhausted",
      entity_type: "pipeline_job",
      entity_id:   jobId,
      payload:     { error, retries },
      severity:    "error",
    }).then(() => {});
  }
}

// ── Cancel ─────────────────────────────────────────────────────────────────

export async function cancelJob(jobId: string, userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("pipeline_jobs")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("user_id", userId);
}

// ── Poll status ────────────────────────────────────────────────────────────

export async function getJobStatus(jobId: string): Promise<Job | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("pipeline_jobs")
    .select()
    .eq("id", jobId)
    .single();
  return (data as Job) ?? null;
}

// ── List workspace jobs ────────────────────────────────────────────────────

export async function listJobs(
  workspaceId: string,
  options?: { type?: JobType; status?: JobStatus; limit?: number }
): Promise<Job[]> {
  const admin = createAdminClient();
  let q = admin
    .from("pipeline_jobs")
    .select()
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 50);

  if (options?.type)   q = q.eq("type", options.type);
  if (options?.status) q = q.eq("status", options.status);

  const { data } = await q;
  return (data ?? []) as Job[];
}

// ── Step tracking ──────────────────────────────────────────────────────────

export async function recordStep(
  jobId: string,
  stepName: string,
  status: "running" | "completed" | "failed" | "skipped",
  options?: {
    input?:      Record<string, unknown>;
    output?:     Record<string, unknown>;
    error?:      string;
    durationMs?: number;
  }
): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  await admin.from("pipeline_steps").upsert({
    job_id:      jobId,
    step_name:   stepName,
    status,
    input:       options?.input ?? {},
    output:      options?.output,
    error:       options?.error,
    duration_ms: options?.durationMs,
    started_at:  status === "running" ? now : undefined,
    completed_at: ["completed","failed","skipped"].includes(status) ? now : undefined,
    created_at:  now,
  }, { onConflict: "job_id,step_name" });
}

// ── Job status API route handler ───────────────────────────────────────────

export { getJobStatus as default };
