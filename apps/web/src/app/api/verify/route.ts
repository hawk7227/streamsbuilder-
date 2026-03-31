import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type {
  BuilderVerifierBotPayload,
  BuilderVerifierFeatureSummary,
  FeatureCoverage,
  FeatureVerificationResult,
  ProbeEvidence,
  ProbeResult,
  ProbeStatus,
  UiBadge,
  VerificationFinalStatus,
} from "@/lib/verifier/types";
import { ALL_FEATURES, FEATURE_REGISTRY, FEATURE_SET_MAP } from "@/lib/verifier/features";
import type { FeatureVerifierSpec, ProbeDefinition } from "@/lib/verifier/types";
import { planRepairsFromVerification } from "@/lib/repair/repair.planner";
import type { VerificationRunResult } from "@/lib/repair/repair.types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const SPEC_VERSION = "2.0.0";

// Keep backward compat export
export type VerifyResponse = BuilderVerifierBotPayload;

const PROVIDER_ENDPOINTS: Record<string, { url: string; headerName?: string; authHeader?: () => string | null }> = {
  openai:     { url: "https://api.openai.com/v1/models",                         authHeader: () => process.env.OPENAI_API_KEY    ? `Bearer ${process.env.OPENAI_API_KEY}` : null },
  anthropic:  { url: "https://api.anthropic.com/v1/messages",                   headerName: "x-api-key", authHeader: () => process.env.ANTHROPIC_API_KEY  ?? null },
  elevenlabs: { url: "https://api.elevenlabs.io/v1/voices",                      headerName: "xi-api-key", authHeader: () => process.env.ELEVENLABS_API_KEY ?? null },
  kling:      { url: "https://api-singapore.klingai.com/v1/images/generations",  authHeader: () => null },
  runway:     { url: "https://api.runwayml.com/v1/tasks",                        authHeader: () => process.env.RUNWAY_API_KEY    ? `Bearer ${process.env.RUNWAY_API_KEY}` : null },
  supabase:   { url: `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/rest/v1/`,   authHeader: () => null },
};

const ENV_TO_PROVIDER: Record<string, string> = {
  OPENAI_API_KEY: "openai",
  ANTHROPIC_API_KEY: "anthropic",
  ELEVENLABS_API_KEY: "elevenlabs",
  KLING_API_KEY: "kling",
  RUNWAY_API_KEY: "runway",
  NEXT_PUBLIC_SUPABASE_URL: "supabase",
};

function nowIso(): string { return new Date().toISOString(); }

function makeResult(probe: ProbeDefinition, status: ProbeStatus, evidence: ProbeEvidence[], actual?: ProbeResult["actual"], notes?: string[]): ProbeResult {
  const now = nowIso();
  return { probeId: probe.id, probeName: probe.name, category: probe.category, level: probe.level, severity: probe.severity, status, startedAt: now, finishedAt: now, durationMs: 0, actual, evidence, notes };
}

async function runHttpProbe(appUrl: string, probe: ProbeDefinition): Promise<ProbeResult> {
  const route = probe.input?.route ?? "";
  const url = `${appUrl}${route}`;
  const t0 = Date.now();
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), probe.timeoutMs);
  try {
    const res = await fetch(url, { method: probe.input?.method ?? "GET", headers: { "Content-Type": "application/json" }, body: probe.input?.body ? JSON.stringify(probe.input.body) : undefined, signal: ctrl.signal });
    clearTimeout(tid);
    const ms = Date.now() - t0;
    const allowed = probe.expects?.allowedHttpStatuses ?? (probe.expects?.expectedHttpStatus ? [probe.expects.expectedHttpStatus] : [200, 401]);
    const ok = allowed.includes(res.status);
    return { ...makeResult(probe, ok ? "pass" : "fail", [{ type: "http_response", label: `${probe.input?.method ?? "GET"} ${route} → ${res.status}`, ok, data: { status: res.status, url, durationMs: ms } }], { httpStatus: res.status, latencyMs: ms }), durationMs: ms, startedAt: new Date(t0).toISOString(), finishedAt: nowIso(), expected: { httpStatus: probe.expects?.expectedHttpStatus ?? allowed } };
  } catch (err) {
    clearTimeout(tid);
    const ms = Date.now() - t0;
    const isTO = err instanceof Error && err.name === "AbortError";
    return { ...makeResult(probe, "fail", [{ type: "http_response", label: `${route} → ${isTO ? "TIMEOUT" : "ERROR"}`, ok: false, data: { error: err instanceof Error ? err.message : String(err) } }], { errorMessage: isTO ? `Timed out after ${probe.timeoutMs}ms` : err instanceof Error ? err.message : String(err) }), durationMs: ms, startedAt: new Date(t0).toISOString(), finishedAt: nowIso() };
  }
}

// Known packages — static check avoids dynamic require.resolve() which Webpack can't trace
const KNOWN_PACKAGES: Record<string, boolean> = {
  "openai": true,
  "@anthropic-ai/sdk": true,
  "@supabase/supabase-js": true,
  "@supabase/ssr": true,
  "@supabase/storage-js": true,
  "jsonwebtoken": true,
  "bullmq": true,
};

async function runDependencyProbe(probe: ProbeDefinition, feature: FeatureVerifierSpec): Promise<ProbeResult> {
  const dep = feature.dependencies?.find((d) => d.kind === "npm_package" || d.kind === "node_module");
  if (!dep) return makeResult(probe, "not_applicable", [{ type: "import_check", label: "No dependency defined", ok: true }]);
  // Static lookup — avoids dynamic require.resolve() which breaks Webpack bundling
  const installed = KNOWN_PACKAGES[dep.name] ?? false;
  if (installed) {
    return makeResult(probe, "pass", [{ type: "import_check", label: `${dep.name} present`, ok: true, data: { package: dep.name } }]);
  }
  return makeResult(probe, "warning", [{ type: "import_check", label: `${dep.name} not in known list`, ok: false, data: { package: dep.name } }], { errorMessage: `Package ${dep.name} not in known packages list — add it to KNOWN_PACKAGES.` });
}

async function runConfigProbe(probe: ProbeDefinition, feature: FeatureVerifierSpec): Promise<ProbeResult> {
  if (probe.category === "env_present" || probe.category === "env_valid") {
    const configs = (feature.configuration ?? []).filter((c) => (c.kind === "env" || c.kind === "secret") && c.required);
    if (configs.length === 0) return makeResult(probe, "not_applicable", [{ type: "env_check", label: "No env config defined", ok: true }]);
    const evidence: ProbeEvidence[] = configs.map((c) => { const v = process.env[c.name]; const ok = !!v && v.trim().length > 0; return { type: "env_check" as const, label: c.redacted ? `${c.name} = [redacted] ${ok ? "✓" : "✗"}` : `${c.name} = ${ok ? "set" : "missing"}`, ok, data: { name: c.name, present: ok } }; });
    const allOk = evidence.every((e) => e.ok);
    return makeResult(probe, allOk ? "pass" : "fail", evidence, allOk ? undefined : { errorMessage: "Required environment variable(s) missing." });
  }
  if (probe.category === "db_schema_present") {
    const tables = (feature.configuration ?? []).filter((c) => c.kind === "db_schema" && c.required);
    if (tables.length === 0) return makeResult(probe, "not_applicable", [{ type: "db_query", label: "No DB schema config defined", ok: true }]);
    const admin = createAdminClient();
    const evidence: ProbeEvidence[] = [];
    for (const cfg of tables) {
      try {
        const { error } = await admin.from(cfg.name).select("id").limit(1);
        const ok = !error || !error.message.toLowerCase().includes("does not exist");
        evidence.push({ type: "db_query", label: `Table ${cfg.name}: ${ok ? "exists" : "missing"}`, ok, data: { table: cfg.name, error: error?.message } });
      } catch (e) { evidence.push({ type: "db_query", label: `Table ${cfg.name}: error`, ok: false, data: { error: e instanceof Error ? e.message : String(e) } }); }
    }
    return makeResult(probe, evidence.every((e) => e.ok) ? "pass" : "fail", evidence, evidence.every((e) => e.ok) ? undefined : { errorMessage: "One or more required tables are missing." });
  }
  if (probe.category === "bucket_present") {
    const buckets = (feature.configuration ?? []).filter((c) => c.kind === "bucket" && c.required);
    if (buckets.length === 0) return makeResult(probe, "not_applicable", [{ type: "storage_check", label: "No bucket config defined", ok: true }]);
    const admin = createAdminClient();
    const evidence: ProbeEvidence[] = [];
    for (const cfg of buckets) {
      try {
        const { data, error } = await admin.storage.getBucket(cfg.name);
        const ok = !!data && !error;
        evidence.push({ type: "storage_check", label: `Bucket ${cfg.name}: ${ok ? "exists" : "missing"}`, ok, data: { bucket: cfg.name, error: error?.message } });
      } catch (e) { evidence.push({ type: "storage_check", label: `Bucket ${cfg.name}: error`, ok: false, data: { error: e instanceof Error ? e.message : String(e) } }); }
    }
    return makeResult(probe, evidence.every((e) => e.ok) ? "pass" : "fail", evidence, evidence.every((e) => e.ok) ? undefined : { errorMessage: "One or more required storage buckets are missing." });
  }
  return makeResult(probe, "not_applicable", [{ type: "env_check", label: "Config category not applicable", ok: true }]);
}

async function runConnectivityProbe(probe: ProbeDefinition, feature: FeatureVerifierSpec): Promise<ProbeResult> {
  const envKeys = (feature.configuration ?? []).filter((c) => c.kind === "env" || c.kind === "secret").map((c) => c.name);
  const toCheck = [...new Set(envKeys.map((k) => ENV_TO_PROVIDER[k]).filter(Boolean) as string[])];
  if (toCheck.length === 0) toCheck.push("supabase");
  const evidence: ProbeEvidence[] = [];
  for (const key of toCheck) {
    const ep = PROVIDER_ENDPOINTS[key];
    if (!ep) continue;
    const t0 = Date.now();
    try {
      const headers: Record<string, string> = {};
      const auth = ep.authHeader?.();
      if (auth) headers[ep.headerName ?? "Authorization"] = auth;
      const res = await fetch(ep.url, { method: "GET", headers, signal: AbortSignal.timeout(probe.timeoutMs) });
      const ok = res.status !== 0 && res.status !== 502 && res.status !== 503;
      evidence.push({ type: "healthcheck", label: `${key} → ${res.status} (${Date.now() - t0}ms)`, ok, data: { provider: key, status: res.status } });
    } catch (e) { evidence.push({ type: "healthcheck", label: `${key} → UNREACHABLE`, ok: false, data: { provider: key, error: e instanceof Error ? e.message : String(e) } }); }
  }
  return makeResult(probe, evidence.every((e) => e.ok) ? "pass" : "fail", evidence, evidence.every((e) => e.ok) ? undefined : { errorMessage: "One or more providers are unreachable." });
}

async function runPermissionProbe(probe: ProbeDefinition, feature: FeatureVerifierSpec): Promise<ProbeResult> {
  if (probe.category === "credential_valid") {
    const envKeys = (feature.configuration ?? []).filter((c) => c.kind === "env" || c.kind === "secret").map((c) => c.name);
    const evidence: ProbeEvidence[] = [];
    for (const envKey of envKeys) {
      const provKey = ENV_TO_PROVIDER[envKey];
      if (!provKey || provKey === "supabase") continue;
      const ep = PROVIDER_ENDPOINTS[provKey];
      if (!ep) continue;
      try {
        const headers: Record<string, string> = {};
        const auth = ep.authHeader?.();
        if (auth) headers[ep.headerName ?? "Authorization"] = auth;
        const res = await fetch(ep.url, { method: "GET", headers, signal: AbortSignal.timeout(probe.timeoutMs) });
        const ok = res.status !== 401 && res.status !== 403;
        evidence.push({ type: "permission_check", label: `${provKey} credential: ${ok ? "valid" : "rejected"} (${res.status})`, ok, data: { provider: provKey, status: res.status } });
      } catch (e) { evidence.push({ type: "permission_check", label: `${provKey} credential check error`, ok: false, data: { error: e instanceof Error ? e.message : String(e) } }); }
    }
    if (evidence.length === 0) return makeResult(probe, "not_applicable", [{ type: "permission_check", label: "No credentials to validate", ok: true }]);
    return makeResult(probe, evidence.every((e) => e.ok) ? "pass" : "fail", evidence, evidence.every((e) => e.ok) ? undefined : { errorMessage: "Credential rejected by provider." });
  }
  if (probe.category === "permission_read" || probe.category === "permission_write") {
    const tables = (feature.configuration ?? []).filter((c) => c.kind === "db_schema" && c.required);
    if (tables.length === 0) return makeResult(probe, "not_applicable", [{ type: "permission_check", label: "No tables to check", ok: true }]);
    const admin = createAdminClient();
    const evidence: ProbeEvidence[] = [];
    for (const cfg of tables) {
      try {
        const { error } = await admin.from(cfg.name).select("id").limit(1);
        const ok = !error;
        evidence.push({ type: "permission_check", label: `READ ${cfg.name}: ${ok ? "allowed" : "denied"}`, ok, data: { table: cfg.name, error: error?.message } });
      } catch (e) { evidence.push({ type: "permission_check", label: `READ ${cfg.name}: error`, ok: false, data: { error: e instanceof Error ? e.message : String(e) } }); }
    }
    return makeResult(probe, evidence.every((e) => e.ok) ? "pass" : "fail", evidence, evidence.every((e) => e.ok) ? undefined : { errorMessage: "DB permission check failed." });
  }
  return makeResult(probe, "not_applicable", [{ type: "permission_check", label: "Permission category not applicable", ok: true }]);
}

async function runFunctionalProbe(appUrl: string, probe: ProbeDefinition): Promise<ProbeResult> {
  if (!probe.input?.route) return makeResult(probe, "not_applicable", [{ type: "http_response", label: "No route defined", ok: true }]);
  const url = `${appUrl}${probe.input.route}`;
  const t0 = Date.now();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const headers: Record<string, string> = { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}`, "X-Probe-Service-Role": "1" };
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), probe.timeoutMs);
    const res = await fetch(url, { method: probe.input.method ?? "POST", headers, body: probe.input.body ? JSON.stringify(probe.input.body) : undefined, signal: ctrl.signal });
    clearTimeout(tid);
    const ms = Date.now() - t0;
    const evidence: ProbeEvidence[] = [{ type: "http_response", label: `${probe.input.method ?? "POST"} → ${res.status} (${ms}ms)`, ok: res.status < 500, data: { status: res.status, durationMs: ms } }];

    if ((probe.category === "stream_start" || probe.category === "stream_complete") && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = ""; let hasDelta = false; let hasDone = false; let firstByteMs = 0; let bytes = 0;
      try {
        while (bytes < 8192) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!firstByteMs) firstByteMs = Date.now() - t0;
          buf += decoder.decode(value, { stream: true }); bytes += value.byteLength;
          for (const chunk of buf.split("\n\n").slice(0, -1)) {
            const line = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            try { const e = JSON.parse(line.slice(6)) as { type?: string; delta?: string }; if (e.type === "text" && e.delta) hasDelta = true; if (e.type === "done" || e.type === "phase") hasDone = true; } catch { /* skip */ }
          }
          buf = buf.split("\n\n").at(-1) ?? "";
          if (hasDelta && hasDone) break;
        }
        reader.cancel().catch(() => {});
      } catch { /* read error */ }
      evidence.push({ type: "stream_event", label: `First byte: ${firstByteMs}ms`, ok: firstByteMs > 0 });
      evidence.push({ type: "stream_event", label: `Has text delta: ${hasDelta}`, ok: hasDelta });
      evidence.push({ type: "stream_event", label: `Has done event: ${hasDone}`, ok: hasDone });
      const passed = probe.category === "stream_start" ? (res.status === 200 && hasDelta) : (res.status === 200 && hasDone);
      return { ...makeResult(probe, passed ? "pass" : "fail", evidence, { httpStatus: res.status, latencyMs: ms, sideEffectObserved: hasDelta }), durationMs: ms, startedAt: new Date(t0).toISOString(), finishedAt: nowIso(), expected: { httpStatus: 200 } };
    }

    const expected = probe.expects?.expectedHttpStatus ?? 200;
    const ok = res.status === expected;
    return { ...makeResult(probe, ok ? "pass" : "fail", evidence, { httpStatus: res.status, latencyMs: ms }), durationMs: ms, startedAt: new Date(t0).toISOString(), finishedAt: nowIso(), expected: { httpStatus: expected } };
  } catch (err) {
    const ms = Date.now() - t0;
    const isTO = err instanceof Error && err.name === "AbortError";
    return { ...makeResult(probe, "fail", [{ type: "http_response", label: `Functional probe → ${isTO ? "TIMEOUT" : "ERROR"}`, ok: false }], { errorMessage: isTO ? `Timeout ${probe.timeoutMs}ms` : err instanceof Error ? err.message : String(err) }), durationMs: ms, startedAt: new Date(t0).toISOString(), finishedAt: nowIso() };
  }
}

async function runSideEffectProbe(probe: ProbeDefinition): Promise<ProbeResult> {
  const se = probe.expects?.expectedSideEffect;
  if (!se) return makeResult(probe, "not_applicable", [{ type: "db_query", label: "No side effect defined", ok: true }]);
  if (se.type === "message_persisted") {
    const admin = createAdminClient();
    try {
      const { data, error } = await admin.from("assistant_conversations").select("id, updated_at").order("updated_at", { ascending: false }).limit(1);
      const ok = !!data?.[0] && !error;
      return makeResult(probe, ok ? "pass" : "fail", [{ type: "db_query", label: `Recent conversation: ${ok ? "found" : "not found"}`, ok, data: { id: data?.[0]?.id, error: error?.message } }], { sideEffectObserved: ok });
    } catch (e) { return makeResult(probe, "fail", [{ type: "db_query", label: "Side effect check error", ok: false, data: { error: e instanceof Error ? e.message : String(e) } }]); }
  }
  return makeResult(probe, "not_applicable", [{ type: "db_query", label: `Side effect ${se.type} not implemented`, ok: true }]);
}

async function execProbe(probe: ProbeDefinition, feature: FeatureVerifierSpec, appUrl: string): Promise<ProbeResult> {
  const t0 = Date.now();
  let r: ProbeResult;
  try {
    switch (probe.category) {
      case "route_exists": case "auth_guard": case "validation_guard": r = await runHttpProbe(appUrl, probe); break;
      case "package_installed": case "module_import": r = await runDependencyProbe(probe, feature); break;
      case "env_present": case "env_valid": case "db_schema_present": case "bucket_present": r = await runConfigProbe(probe, feature); break;
      case "service_reachable": r = await runConnectivityProbe(probe, feature); break;
      case "credential_valid": case "permission_read": case "permission_write": case "permission_execute": r = await runPermissionProbe(probe, feature); break;
      case "stream_start": case "stream_complete": case "response_schema": case "artifact_created": case "job_enqueue": r = await runFunctionalProbe(appUrl, probe); break;
      case "side_effect_confirmed": case "artifact_readback": r = await runSideEffectProbe(probe); break;
      default: r = makeResult(probe, "not_applicable", [{ type: "healthcheck", label: `Category ${probe.category} not implemented`, ok: true }]);
    }
  } catch (err) {
    r = makeResult(probe, "fail", [{ type: "http_response", label: "Probe execution error", ok: false, data: { error: err instanceof Error ? err.message : String(err) } }], { errorMessage: err instanceof Error ? err.message : String(err) });
  }
  return { ...r, durationMs: Date.now() - t0, startedAt: r.startedAt || new Date(t0).toISOString(), finishedAt: nowIso() };
}

function computeCoverage(probes: ProbeResult[]): FeatureCoverage {
  const lvl = (level: string): ProbeStatus => { const m = probes.filter((p) => p.level === level); if (m.length === 0) return "not_applicable"; if (m.every((p) => p.status === "pass")) return "pass"; if (m.some((p) => p.status === "fail")) return "fail"; if (m.some((p) => p.status === "warning")) return "warning"; return "not_applicable"; };
  return { route: lvl("route"), guard: lvl("guard"), dependency: lvl("dependency"), configuration: lvl("configuration"), connectivity: lvl("connectivity"), permission: lvl("permission"), functional: lvl("functional"), integrity: lvl("integrity"), endToEnd: "not_applicable" };
}

function computeFinalStatus(probes: ProbeResult[], spec: FeatureVerifierSpec): VerificationFinalStatus {
  const critFailed = probes.filter((p) => p.severity === "critical" && p.status === "fail").length;
  const reqFailed = probes.filter((p) => { const d = spec.probes.find((x) => x.id === p.probeId); return d?.required && p.status === "fail"; }).length;
  if (spec.passRules.requireAllCritical && critFailed > 0) return "fail";
  if (spec.passRules.requireAllRequired && reqFailed > 0) return "fail";
  if (probes.some((p) => p.status === "pass") && probes.some((p) => p.status === "fail")) return "partial";
  if (probes.some((p) => p.status === "warning")) return "warning";
  if (probes.every((p) => p.status === "pass" || p.status === "not_applicable")) return "pass";
  return "partial";
}

function computeUiBadge(r: FeatureVerificationResult): UiBadge {
  const { coverage, finalStatus } = r;
  if (finalStatus === "pass") return "FULLY_VERIFIED";
  if (coverage.configuration === "fail") return "CONFIG_MISSING";
  if (coverage.permission === "fail") return "PERMISSION_DENIED";
  if (coverage.integrity === "fail" && coverage.functional === "pass") return "INTEGRITY_FAILED";
  if (coverage.route === "fail") return "FAILED";
  if (coverage.route === "pass" && coverage.guard !== "pass" && coverage.configuration !== "pass") return "ROUTE_ONLY";
  if (coverage.route === "pass" && coverage.guard === "pass" && coverage.functional !== "pass") return "GUARD_ONLY";
  const critFailed = r.probes.filter((p) => p.severity === "critical" && p.status === "fail").length;
  return critFailed > 0 ? "FAILED" : "DEGRADED";
}

function buildSummary(result: FeatureVerificationResult, proposals: unknown[]): BuilderVerifierFeatureSummary {
  const { coverage, probes, finalStatus } = result;
  const critFail = probes.filter((p) => p.severity === "critical" && p.status === "fail").map((p) => `${p.probeName}: ${p.actual?.errorMessage ?? p.actual?.errorCode ?? `HTTP ${p.actual?.httpStatus ?? "ERR"}`}`);
  const warns = probes.filter((p) => p.status === "warning" || (p.severity === "high" && p.status === "fail")).map((p) => `${p.probeName}: ${p.actual?.errorMessage ?? "degraded"}`);
  return {
    featureId: result.featureId, featureName: result.featureName,
    uiBadge: computeUiBadge(result), finalStatus, operationalStatus: result.featureOperationalStatus,
    routeExists: coverage.route === "pass",
    authGuardWorks: coverage.guard === "pass",
    validationWorks: probes.some((p) => p.category === "validation_guard" && p.status === "pass"),
    dependencyReady: coverage.dependency === "pass" || coverage.dependency === "not_applicable",
    configurationReady: coverage.configuration === "pass" || coverage.configuration === "not_applicable",
    connectivityReady: coverage.connectivity === "pass" || coverage.connectivity === "not_applicable",
    permissionsReady: coverage.permission === "pass" || coverage.permission === "not_applicable",
    functionalProbePassed: coverage.functional === "pass",
    integrityProbePassed: coverage.integrity === "pass",
    criticalFailures: critFail, warnings: warns,
    evidenceCount: probes.flatMap((p) => p.evidence).length,
    probes, repairProposals: proposals,
  };
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = nowIso();
  const runId = `verify_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const isInternal = !!request.headers.get("x-probe-origin");
  if (!isInternal) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      // Bearer token present — validate it against Supabase (not just check presence)
      try {
        const token = authHeader.slice(7);
        const sb = createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        );
        const { data: { user }, error } = await sb.auth.getUser(token);
        if (!user || error) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
    } else {
      // No bearer token — fall back to cookie-based session auth
      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
    }
  }

  let body: { features?: string; featureIds?: string[] } = {};
  try { body = await request.json() as typeof body; } catch { /* empty body = all */ }

  const featureKey = (body.features ?? "all").toLowerCase();
  const requestedIds = body.featureIds?.length ? body.featureIds : (FEATURE_SET_MAP[featureKey] ?? FEATURE_SET_MAP.all ?? []);
  const uniqueIds = [...new Set(requestedIds)];
  const toRun = uniqueIds.map((id) => FEATURE_REGISTRY[id]).filter(Boolean) as FeatureVerifierSpec[];
  if (toRun.length === 0) return NextResponse.json({ error: `No features found for: ${uniqueIds.join(", ")}` }, { status: 400 });

  const appUrl = request.headers.get("x-probe-origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? (() => { try { const u = new URL(request.url); return `${u.protocol}//${u.host}`; } catch { return "http://localhost:3000"; } })();
  const environment = (process.env.VERCEL_ENV as VerificationRunResult["environment"]) ?? "production";

  const featureResults = await Promise.all(toRun.map(async (feature): Promise<FeatureVerificationResult> => {
    const probeResults = await Promise.all(feature.probes.map((p) => execProbe(p, feature, appUrl)));
    const coverage = computeCoverage(probeResults);
    const finalStatus = computeFinalStatus(probeResults, feature);
    const allLevelsPassed = feature.requiredLevels.every((lvl) => { const s = coverage[lvl as keyof FeatureCoverage]; return s === "pass" || s === "not_applicable"; });
    coverage.endToEnd = allLevelsPassed ? "pass" : "fail";
    const critCount = probeResults.filter((p) => p.severity === "critical").length;
    const critPassed = probeResults.filter((p) => p.severity === "critical" && p.status === "pass").length;
    const reqCount = feature.probes.filter((p) => p.required).length;
    const reqPassed = probeResults.filter((p) => { const d = feature.probes.find((x) => x.id === p.probeId); return d?.required && p.status === "pass"; }).length;
    const reasons = probeResults.filter((p) => p.status === "fail" && p.severity === "critical").map((p) => `${p.probeName}: ${p.actual?.errorMessage ?? `HTTP ${p.actual?.httpStatus ?? "ERR"}`}`);
    return { featureId: feature.id, featureName: feature.name, finalStatus, featureOperationalStatus: finalStatus === "pass" ? "fully_operational" : finalStatus === "partial" || finalStatus === "warning" ? "degraded" : "non_operational", coverage, probes: probeResults, rollup: { requiredProbeCount: reqCount, requiredProbePassedCount: reqPassed, criticalProbeCount: critCount, criticalProbePassedCount: critPassed, reasonsForFailure: reasons.length > 0 ? reasons : undefined }, notes: feature.tags ? [`tags: ${feature.tags.join(", ")}`] : undefined };
  }));

  const finishedAt = nowIso();
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  const passedF = featureResults.filter((f) => f.finalStatus === "pass").length;
  const failedF = featureResults.filter((f) => f.finalStatus === "fail").length;
  const partialF = featureResults.filter((f) => f.finalStatus === "partial").length;
  const warnF = featureResults.filter((f) => f.finalStatus === "warning").length;
  const skipF = featureResults.filter((f) => f.finalStatus === "skipped").length;
  const allP = featureResults.flatMap((f) => f.probes);
  const overallStatus: VerificationFinalStatus = failedF > 0 ? "fail" : partialF > 0 ? "partial" : warnF > 0 ? "warning" : "pass";

  const runResult: VerificationRunResult = {
    runId, specVersion: SPEC_VERSION, startedAt, finishedAt, durationMs, environment, overallStatus,
    summary: { totalFeatures: featureResults.length, passedFeatures: passedF, failedFeatures: failedF, partialFeatures: partialF, warningFeatures: warnF, skippedFeatures: skipF, totalProbes: allP.length, passedProbes: allP.filter((p) => p.status === "pass").length, failedProbes: allP.filter((p) => p.status === "fail").length, warningProbes: allP.filter((p) => p.status === "warning").length, skippedProbes: allP.filter((p) => p.status === "not_applicable").length, criticalFailures: allP.filter((p) => p.severity === "critical" && p.status === "fail").length },
    features: featureResults,
  };

  const repairPlan = planRepairsFromVerification(runResult);
  const byFeature = new Map<string, unknown[]>();
  for (const p of repairPlan.proposals) { const e = byFeature.get(p.featureId) ?? []; e.push(p); byFeature.set(p.featureId, e); }

  const summaries: BuilderVerifierFeatureSummary[] = featureResults.map((r) => buildSummary(r, byFeature.get(r.featureId) ?? []));
  const payload: BuilderVerifierBotPayload = {
    runId, startedAt, finishedAt, environment, overallStatus,
    summary: { fullyVerified: summaries.filter((f) => f.uiBadge === "FULLY_VERIFIED").length, degraded: summaries.filter((f) => f.uiBadge === "DEGRADED").length, failed: summaries.filter((f) => f.uiBadge === "FAILED").length, guardOnly: summaries.filter((f) => f.uiBadge === "GUARD_ONLY").length, routeOnly: summaries.filter((f) => f.uiBadge === "ROUTE_ONLY").length },
    features: summaries,
  };

  try {
    const admin = createAdminClient();
    await admin.from("assistant_memory").insert({ user_id: "00000000-0000-0000-0000-000000000000", memory_type: "pipeline_run", key: runId, value: { runId, environment, overallStatus, summary: payload.summary, failedFeatures: summaries.filter((f) => f.finalStatus !== "pass").map((f) => ({ featureId: f.featureId, badge: f.uiBadge, criticalFailures: f.criticalFailures })), repairProposalsCount: repairPlan.proposals.length, startedAt, finishedAt }, tags: ["verification", featureKey, `status:${overallStatus}`] });
  } catch { /* non-fatal */ }

  return NextResponse.json(payload);
}

export async function GET(): Promise<Response> {
  return NextResponse.json({ specVersion: SPEC_VERSION, totalFeatures: ALL_FEATURES.length, features: ALL_FEATURES.map((f) => ({ id: f.id, name: f.name, description: f.description, probeCount: f.probes.length, requiredLevels: f.requiredLevels, tags: f.tags })), featureSets: Object.entries(FEATURE_SET_MAP).map(([k, ids]) => ({ key: k, featureIds: ids, count: ids.length })) });
}
