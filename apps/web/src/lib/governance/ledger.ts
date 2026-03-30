/**
 * ledger.ts — Governance Ledger
 * Append-only audit log for every consequential action in the system.
 * No bypass routes — every generation, validation, job, and failure is logged.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ── Action types (exhaustive, no catch-all) ────────────────────────────────

export type LedgerAction =
  // Generation
  | "image_generated" | "image_rejected" | "image_rerun"
  | "video_generated" | "video_rejected" | "video_rerun"
  | "tts_generated"   | "stt_transcribed"
  | "song_generated"
  // Validation
  | "copy_validated"  | "copy_rejected"
  | "image_validated" | "image_qc_failed"
  | "video_validated" | "video_qc_failed"
  | "governance_pass" | "governance_fail"
  // Jobs
  | "job_enqueued"    | "job_completed"
  | "job_failed"      | "job_failed_exhausted"
  | "job_cancelled"
  // Files
  | "file_uploaded"   | "file_deleted"   | "file_deduplicated"
  | "url_intake"      | "url_blocked"
  // Auth / Security
  | "rate_limited"    | "auth_failed"    | "ssrf_blocked"
  | "mime_rejected"   | "file_scan_failed"
  // Pipeline
  | "pipeline_started" | "pipeline_completed" | "pipeline_failed"
  // Voice
  | "voice_dataset_uploaded" | "voice_dataset_rejected"
  // Admin
  | "config_changed"  | "provider_health_check";

export type Severity = "debug" | "info" | "warn" | "error" | "critical";

export interface LedgerEntry {
  action:      LedgerAction;
  entityType?: string;
  entityId?:   string;
  payload?:    Record<string, unknown>;
  severity?:   Severity;
  workspaceId?: string;
  userId?:     string;
  durationMs?: number;
  ipAddress?:  string;
}

// ── Log ───────────────────────────────────────────────────────────────────

export async function logAction(entry: LedgerEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("ledger_logs").insert({
      action:       entry.action,
      entity_type:  entry.entityType,
      entity_id:    entry.entityId,
      payload:      entry.payload ?? {},
      severity:     entry.severity ?? "info",
      workspace_id: entry.workspaceId,
      user_id:      entry.userId,
      duration_ms:  entry.durationMs,
      ip_address:   entry.ipAddress,
    });
  } catch (e) {
    // Ledger must never crash the caller
    console.error("[ledger] write failed:", e);
  }
}

// ── Query ─────────────────────────────────────────────────────────────────

export interface LedgerQueryOptions {
  workspaceId?: string;
  action?:      LedgerAction;
  severity?:    Severity;
  entityType?:  string;
  limit?:       number;
  after?:       string; // ISO timestamp
}

export async function queryLedger(opts: LedgerQueryOptions) {
  const admin = createAdminClient();
  let q = admin
    .from("ledger_logs")
    .select()
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.workspaceId) q = q.eq("workspace_id", opts.workspaceId);
  if (opts.action)      q = q.eq("action", opts.action);
  if (opts.severity)    q = q.eq("severity", opts.severity);
  if (opts.entityType)  q = q.eq("entity_type", opts.entityType);
  if (opts.after)       q = q.gte("created_at", opts.after);

  const { data, error } = await q;
  if (error) throw new Error(`Ledger query failed: ${error.message}`);
  return data ?? [];
}

// ── Failure summary ───────────────────────────────────────────────────────

export async function getFailureSummary(
  workspaceId: string,
  hoursBack = 24
): Promise<{
  totalFailed:   number;
  byAction:      Record<string, number>;
  recentErrors:  Array<{ action: string; error: string; created_at: string }>;
}> {
  const after = new Date(Date.now() - hoursBack * 3600000).toISOString();
  const entries = await queryLedger({
    workspaceId,
    severity: "error",
    after,
    limit: 500,
  });

  const byAction: Record<string, number> = {};
  for (const e of entries) {
    byAction[e.action] = (byAction[e.action] ?? 0) + 1;
  }

  return {
    totalFailed: entries.length,
    byAction,
    recentErrors: entries.slice(0, 20).map(e => ({
      action:     e.action,
      error:      (e.payload as Record<string,unknown>)?.error as string ?? "",
      created_at: e.created_at,
    })),
  };
}

// ── Rate limit check ──────────────────────────────────────────────────────

export async function checkRateLimit(
  userId: string,
  action: string,
  maxPerHour: number
): Promise<{ allowed: boolean; count: number; limit: number }> {
  const admin = createAdminClient();
  const after = new Date(Date.now() - 3600000).toISOString();

  const { count } = await admin
    .from("ledger_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", action)
    .gte("created_at", after);

  const current = count ?? 0;
  const allowed = current < maxPerHour;

  if (!allowed) {
    await logAction({
      action:   "rate_limited",
      userId,
      payload:  { limitedAction: action, count: current, limit: maxPerHour },
      severity: "warn",
    });
  }

  return { allowed, count: current, limit: maxPerHour };
}
