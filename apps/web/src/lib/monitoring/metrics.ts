/**
 * metrics.ts — Runtime monitoring
 * Server: job failure rates, generation error rates, provider latency
 * Client: Web Vitals (CLS, INP, FCP, LCP, TTFB) — call initWebVitals() in layout
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logAction } from "@/lib/governance/ledger";

// ── Server-side metrics ────────────────────────────────────────────────────

export interface SystemMetrics {
  jobs: {
    pending:    number;
    running:    number;
    failed24h:  number;
    completed24h: number;
    failureRate: number;  // 0-1
  };
  generations: {
    failed24h:  number;
    total24h:   number;
    failureRate: number;
  };
  files: {
    total:      number;
    tempExpired: number;
  };
  alerts: Alert[];
}

export interface Alert {
  level:   "warn" | "error" | "critical";
  message: string;
  metric:  string;
  value:   number;
  threshold: number;
}

const ALERT_THRESHOLDS = {
  jobFailureRate:   0.1,   // 10%
  genFailureRate:   0.15,  // 15%
  pendingJobsHigh:  50,    // >50 pending = queue backup
};

export async function getSystemMetrics(): Promise<SystemMetrics> {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 86400000).toISOString();

  const [
    { count: pending },
    { count: running },
    { count: failed24h },
    { count: completed24h },
    { count: genFailed24h },
    { count: genTotal24h },
    { count: totalFiles },
    { count: tempExpired },
  ] = await Promise.all([
    admin.from("pipeline_jobs").select("*", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("pipeline_jobs").select("*", { count: "exact", head: true }).in("status", ["running", "claimed"]),
    admin.from("pipeline_jobs").select("*", { count: "exact", head: true }).eq("status", "failed").gte("updated_at", since24h),
    admin.from("pipeline_jobs").select("*", { count: "exact", head: true }).eq("status", "completed").gte("updated_at", since24h),
    admin.from("generations").select("*", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since24h),
    admin.from("generations").select("*", { count: "exact", head: true }).gte("created_at", since24h),
    admin.from("files").select("*", { count: "exact", head: true }),
    admin.from("files").select("*", { count: "exact", head: true }).eq("is_temp", true).lt("created_at", new Date(Date.now() - 86400000).toISOString()),
  ]);

  const jobTotal     = (failed24h ?? 0) + (completed24h ?? 0);
  const jobFailRate  = jobTotal > 0 ? (failed24h ?? 0) / jobTotal : 0;
  const genTotal     = genTotal24h ?? 0;
  const genFailRate  = genTotal > 0 ? (genFailed24h ?? 0) / genTotal : 0;

  const alerts: Alert[] = [];

  if (jobFailRate > ALERT_THRESHOLDS.jobFailureRate) {
    alerts.push({ level: "error", message: `High job failure rate: ${(jobFailRate * 100).toFixed(1)}%`, metric: "job_failure_rate", value: jobFailRate, threshold: ALERT_THRESHOLDS.jobFailureRate });
  }
  if (genFailRate > ALERT_THRESHOLDS.genFailureRate) {
    alerts.push({ level: "warn", message: `High generation failure rate: ${(genFailRate * 100).toFixed(1)}%`, metric: "gen_failure_rate", value: genFailRate, threshold: ALERT_THRESHOLDS.genFailureRate });
  }
  if ((pending ?? 0) > ALERT_THRESHOLDS.pendingJobsHigh) {
    alerts.push({ level: "warn", message: `Queue backup: ${pending} pending jobs`, metric: "pending_jobs", value: pending ?? 0, threshold: ALERT_THRESHOLDS.pendingJobsHigh });
  }

  // Log critical alerts to ledger
  for (const alert of alerts.filter(a => a.level === "critical")) {
    await logAction({ action: "pipeline_failed", payload: alert as unknown as Record<string,unknown>, severity: "critical" });
  }

  return {
    jobs: {
      pending:     pending ?? 0,
      running:     running ?? 0,
      failed24h:   failed24h ?? 0,
      completed24h: completed24h ?? 0,
      failureRate: jobFailRate,
    },
    generations: {
      failed24h:   genFailed24h ?? 0,
      total24h:    genTotal,
      failureRate: genFailRate,
    },
    files: {
      total:       totalFiles ?? 0,
      tempExpired: tempExpired ?? 0,
    },
    alerts,
  };
}

// ── Metrics API route helper ───────────────────────────────────────────────

export async function getMetricsForWorkspace(workspaceId: string) {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 86400000).toISOString();

  const [genStats, jobStats] = await Promise.all([
    admin.from("generations").select("status", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .gte("created_at", since24h),
    admin.from("pipeline_jobs").select("status", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .gte("created_at", since24h),
  ]);

  return { generations: genStats.data, jobs: jobStats.data };
}

// ── Client-side Web Vitals (browser only) ─────────────────────────────────

export interface WebVitalEntry {
  name:  "CLS" | "INP" | "FCP" | "LCP" | "TTFB";
  value: number;
  rating: "good" | "needs-improvement" | "poor";
}

export function rateWebVital(name: string, value: number): WebVitalEntry["rating"] {
  const thresholds: Record<string, [number, number]> = {
    CLS:  [0.1, 0.25],
    INP:  [200, 500],
    FCP:  [1800, 3000],
    LCP:  [2500, 4000],
    TTFB: [800, 1800],
  };
  const [good, poor] = thresholds[name] ?? [0, Infinity];
  if (value <= good) return "good";
  if (value <= poor) return "needs-improvement";
  return "poor";
}

export async function reportWebVital(entry: WebVitalEntry): Promise<void> {
  try {
    await fetch("/api/monitoring/vitals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
      keepalive: true,
    });
  } catch { /* non-blocking */ }
}

// ── Web Vitals initialiser (call in client component or layout) ────────────

export async function initWebVitals(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { onCLS, onINP, onFCP, onLCP, onTTFB } = await import("web-vitals");
    const handler = (metric: { name: string; value: number }) => {
      const entry: WebVitalEntry = {
        name:   metric.name as WebVitalEntry["name"],
        value:  metric.value,
        rating: rateWebVital(metric.name, metric.value),
      };
      void reportWebVital(entry);
    };
    onCLS(handler); onINP(handler); onFCP(handler); onLCP(handler); onTTFB(handler);
  } catch { /* web-vitals not installed — skip */ }
}
