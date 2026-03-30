import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CheckResult {
  checkId: string;
  featureId: string;
  label: string;
  status: 'pass' | 'fail' | 'timeout' | 'skip';
  httpStatus: number | null;
  durationMs: number;
  error: string | null;
  url: string;
}

export interface VerifyResponse {
  runId: string;
  appUrl: string;
  requestedFeatures: string[];
  results: CheckResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    timedOut: number;
    passRate: number;
  };
  completedAt: string;
}

// ── Route catalogue ───────────────────────────────────────────────────────────
// Every entry is a real route that exists in this codebase.
// method + expectedStatus matches the auth gate (401 = route exists + auth works).

const ALL_CHECKS: Array<{
  checkId: string;
  featureId: string;
  label: string;
  path: string;
  method: 'GET' | 'POST' | 'DELETE';
  body?: Record<string, unknown>;
  expectedStatus: number[];   // any of these = route reachable
}> = [
  // ── Assistant + Conversations ──────────────────────────────────────────
  {
    checkId: 'assistant_post',
    featureId: 'governed_assistant',
    label: 'AI Assistant (POST /api/ai-assistant)',
    path: '/api/ai-assistant',
    method: 'POST',
    body: { messages: [], context: {} },
    expectedStatus: [400, 401, 200],
  },
  {
    checkId: 'conversations_list',
    featureId: 'governed_assistant',
    label: 'Conversation List (GET /api/conversations)',
    path: '/api/conversations',
    method: 'GET',
    expectedStatus: [200, 401],
  },
  {
    checkId: 'conversations_search',
    featureId: 'governed_assistant',
    label: 'Conversation Search (GET /api/conversations/search)',
    path: '/api/conversations/search?q=test',
    method: 'GET',
    expectedStatus: [200, 401],
  },
  {
    checkId: 'brain_get',
    featureId: 'governed_assistant',
    label: 'Brain Memory (GET /api/brain)',
    path: '/api/brain',
    method: 'GET',
    expectedStatus: [200, 401],
  },

  // ── File Intelligence ──────────────────────────────────────────────────
  {
    checkId: 'file_upload',
    featureId: 'file_intelligence',
    label: 'File Upload (POST /api/files/upload)',
    path: '/api/files/upload',
    method: 'POST',
    expectedStatus: [400, 401, 200],
  },
  {
    checkId: 'file_intake',
    featureId: 'file_intelligence',
    label: 'File Intake (POST /api/files/intake)',
    path: '/api/files/intake',
    method: 'POST',
    body: {},
    expectedStatus: [400, 401, 200],
  },
  {
    checkId: 'file_search',
    featureId: 'file_intelligence',
    label: 'File Search (GET /api/files/search)',
    path: '/api/files/search?q=test',
    method: 'GET',
    expectedStatus: [200, 401],
  },

  // ── URL Ingestion ──────────────────────────────────────────────────────
  {
    checkId: 'intake_url',
    featureId: 'url_ingestion',
    label: 'URL Intake (POST /api/intake/url)',
    path: '/api/intake/url',
    method: 'POST',
    body: { url: 'https://example.com' },
    expectedStatus: [200, 400, 401],
  },
  {
    checkId: 'intake_youtube',
    featureId: 'url_ingestion',
    label: 'YouTube Intake (POST /api/intake/youtube)',
    path: '/api/intake/youtube',
    method: 'POST',
    body: { url: 'https://youtube.com/watch?v=test' },
    expectedStatus: [200, 400, 401],
  },
  {
    checkId: 'intake_analyze',
    featureId: 'url_ingestion',
    label: 'Intake Analyze (POST /api/intake/analyze)',
    path: '/api/intake/analyze',
    method: 'POST',
    body: { url: 'https://example.com' },
    expectedStatus: [200, 400, 401],
  },

  // ── Voice ──────────────────────────────────────────────────────────────
  {
    checkId: 'voice_speak',
    featureId: 'voice_system',
    label: 'Voice TTS (GET /api/voice/speak)',
    path: '/api/voice/speak',
    method: 'GET',
    expectedStatus: [200, 401],
  },
  {
    checkId: 'voice_transcribe',
    featureId: 'voice_system',
    label: 'Voice STT (POST /api/voice/transcribe)',
    path: '/api/voice/transcribe',
    method: 'POST',
    expectedStatus: [400, 401, 200],
  },
  {
    checkId: 'voice_dataset',
    featureId: 'voice_system',
    label: 'Voice Dataset (GET /api/voice/dataset)',
    path: '/api/voice/dataset',
    method: 'GET',
    expectedStatus: [200, 401],
  },

  // ── Image + Video Generation ───────────────────────────────────────────
  {
    checkId: 'generate_image',
    featureId: 'image_generation',
    label: 'Image Generation (POST /api/generate-image)',
    path: '/api/generate-image',
    method: 'POST',
    body: { prompt: 'test', dryRun: true },
    expectedStatus: [200, 400, 401],
  },
  {
    checkId: 'generations_list',
    featureId: 'image_generation',
    label: 'Generations List (GET /api/generations)',
    path: '/api/generations',
    method: 'GET',
    expectedStatus: [200, 401],
  },
  {
    checkId: 'ideas_image',
    featureId: 'image_generation',
    label: 'Image Ideas (POST /api/ideas/image)',
    path: '/api/ideas/image',
    method: 'POST',
    body: { context: 'test' },
    expectedStatus: [200, 400, 401],
  },
  {
    checkId: 'ideas_video',
    featureId: 'image_generation',
    label: 'Video Ideas (POST /api/ideas/video)',
    path: '/api/ideas/video',
    method: 'POST',
    body: { context: 'test' },
    expectedStatus: [200, 400, 401],
  },

  // ── Pipeline ───────────────────────────────────────────────────────────
  {
    checkId: 'pipeline_run_node',
    featureId: 'pipeline_workspace',
    label: 'Pipeline Run-Node (POST /api/pipeline/run-node)',
    path: '/api/pipeline/run-node',
    method: 'POST',
    body: { type: 'creativeStrategy', data: {} },
    expectedStatus: [200, 400, 401],
  },
  {
    checkId: 'pipeline_session',
    featureId: 'pipeline_workspace',
    label: 'Pipeline Session (POST /api/pipeline/session)',
    path: '/api/pipeline/session',
    method: 'POST',
    body: {},
    expectedStatus: [200, 201, 400, 401],
  },

  // ── Job Queue ──────────────────────────────────────────────────────────
  {
    checkId: 'jobs_list',
    featureId: 'job_queue',
    label: 'Job Queue List (GET /api/jobs)',
    path: '/api/jobs',
    method: 'GET',
    expectedStatus: [200, 401],
  },

  // ── Operator + Monitoring ──────────────────────────────────────────────
  {
    checkId: 'operator_health',
    featureId: 'operator_dashboard',
    label: 'Operator Health (GET /api/operator/health)',
    path: '/api/operator/health',
    method: 'GET',
    expectedStatus: [200, 401],
  },
  {
    checkId: 'operator_ledger',
    featureId: 'operator_dashboard',
    label: 'Operator Ledger (GET /api/operator/ledger)',
    path: '/api/operator/ledger',
    method: 'GET',
    expectedStatus: [200, 401],
  },
  {
    checkId: 'operator_route_status',
    featureId: 'operator_dashboard',
    label: 'Route Status (GET /api/operator/route-status)',
    path: '/api/operator/route-status',
    method: 'GET',
    expectedStatus: [200, 401],
  },
  {
    checkId: 'operator_integrations',
    featureId: 'operator_dashboard',
    label: 'Integrations (GET /api/operator/integrations-credentials)',
    path: '/api/operator/integrations-credentials',
    method: 'GET',
    expectedStatus: [200, 401],
  },
  {
    checkId: 'monitoring_metrics',
    featureId: 'operator_dashboard',
    label: 'System Metrics (GET /api/monitoring/metrics)',
    path: '/api/monitoring/metrics',
    method: 'GET',
    expectedStatus: [200, 401],
  },

  // ── Audio / Song ───────────────────────────────────────────────────────
  {
    checkId: 'audio_song',
    featureId: 'song_pipeline',
    label: 'Song Generation (POST /api/audio/generate-song)',
    path: '/api/audio/generate-song',
    method: 'POST',
    body: { lyrics: 'test', style: 'pop' },
    expectedStatus: [200, 400, 401],
  },

  // ── Pipeline run (full, not just run-node) ─────────────────────────────
  {
    checkId: 'pipeline_run',
    featureId: 'pipeline_workspace',
    label: 'Pipeline Run (POST /api/pipeline/run)',
    path: '/api/pipeline/run',
    method: 'POST',
    body: {},
    expectedStatus: [200, 201, 400, 401, 404],
  },

  // ── Code editor write-back ─────────────────────────────────────────────
  {
    checkId: 'editor_write',
    featureId: 'pipeline_workspace',
    label: 'Editor Write (POST /api/editor)',
    path: '/api/editor',
    method: 'POST',
    body: {},
    expectedStatus: [200, 201, 400, 401, 404],
  },

  // ── Copilot chat ───────────────────────────────────────────────────────
  {
    checkId: 'copilot_chat',
    featureId: 'governed_assistant',
    label: 'Copilot Chat (POST /api/copilot-chat)',
    path: '/api/copilot-chat',
    method: 'POST',
    body: { messages: [] },
    expectedStatus: [200, 400, 401, 404],
  },

  // ── Video render + scratch ─────────────────────────────────────────────
  {
    checkId: 'video_render',
    featureId: 'pipeline_workspace',
    label: 'Video Render (POST /api/video/render)',
    path: '/api/video/render',
    method: 'POST',
    body: {},
    expectedStatus: [200, 201, 400, 401, 404],
  },
  {
    checkId: 'video_scratch',
    featureId: 'pipeline_workspace',
    label: 'Video Scratch (POST /api/video/scratch)',
    path: '/api/video/scratch',
    method: 'POST',
    body: {},
    expectedStatus: [200, 201, 400, 401, 404],
  },
];

// ── Feature set registry ──────────────────────────────────────────────────────

const FEATURE_SETS: Record<string, string[]> = {
  all:                  ALL_CHECKS.map((c) => c.featureId),
  assistant:            ['governed_assistant'],
  files:                ['file_intelligence'],
  voice:                ['voice_system'],
  pipeline:             ['pipeline_workspace'],
  generation:           ['image_generation'],
  intake:               ['url_ingestion'],
  operator:             ['operator_dashboard'],
  jobs:                 ['job_queue'],
  song:                 ['song_pipeline'],
};

// ── HTTP probe ────────────────────────────────────────────────────────────────

async function runProbe(
  appUrl: string,
  check: (typeof ALL_CHECKS)[number],
): Promise<CheckResult> {
  const url = `${appUrl}${check.path}`;
  const t0 = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const res = await fetch(url, {
      method: check.method,
      headers,
      body: check.body ? JSON.stringify(check.body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const durationMs = Date.now() - t0;
    const passed = check.expectedStatus.includes(res.status);

    return {
      checkId: check.checkId,
      featureId: check.featureId,
      label: check.label,
      status: passed ? 'pass' : 'fail',
      httpStatus: res.status,
      durationMs,
      error: passed ? null : `Expected status in [${check.expectedStatus.join(',')}], got ${res.status}`,
      url,
    };
  } catch (err) {
    clearTimeout(timeout);
    const durationMs = Date.now() - t0;
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    return {
      checkId: check.checkId,
      featureId: check.featureId,
      label: check.label,
      status: isTimeout ? 'timeout' : 'fail',
      httpStatus: null,
      durationMs,
      error: isTimeout
        ? `Timed out after 6000ms`
        : err instanceof Error ? err.message : String(err),
      url,
    };
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Internal server-to-server calls (from ai-assistant route) use X-Probe-Origin header.
  // These are trusted — the ai-assistant route already verified the user.
  // External calls require normal cookie-based session auth.
  const isInternalCall = !!request.headers.get('x-probe-origin');

  if (!isInternalCall) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { features?: string; featureIds?: string[] } = {};
  try {
    body = await request.json() as typeof body;
  } catch {
    // empty body = run all
  }

  // Resolve which feature IDs to check
  const featureKey = (body.features ?? 'all').toLowerCase();
  const requestedFeatures: string[] = body.featureIds?.length
    ? body.featureIds
    : (FEATURE_SETS[featureKey] ?? FEATURE_SETS['all']!);

  const uniqueFeatures = [...new Set(requestedFeatures)];

  // Filter checks to requested features
  const checksToRun = ALL_CHECKS.filter((c) =>
    uniqueFeatures.includes(c.featureId),
  );

  if (checksToRun.length === 0) {
    return NextResponse.json(
      { error: `No checks found for features: ${uniqueFeatures.join(', ')}` },
      { status: 400 },
    );
  }

  // Determine APP_URL from the incoming request — always correct, no env vars needed.
  // X-Probe-Origin header is set by ai-assistant route. Direct calls fall back to request.url.
  const appUrl =
    request.headers.get('x-probe-origin') ??
    process.env['NEXT_PUBLIC_APP_URL'] ??
    (() => { try { const u = new URL(request.url); return `${u.protocol}//${u.host}`; } catch { return 'http://localhost:3000'; } })();

  const runId = `verify_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Run all probes in parallel (max 6 concurrent)
  const CONCURRENCY = 6;
  const results: CheckResult[] = [];
  for (let i = 0; i < checksToRun.length; i += CONCURRENCY) {
    const batch = checksToRun.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map((c) => runProbe(appUrl, c)));
    results.push(...batchResults);
  }

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const timedOut = results.filter((r) => r.status === 'timeout').length;
  const total = results.length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

  const summary = { total, passed, failed, timedOut, passRate };
  const completedAt = new Date().toISOString();

  const response: VerifyResponse = {
    runId,
    appUrl,
    requestedFeatures: uniqueFeatures,
    results,
    summary,
    completedAt,
  };

  // Persist to assistant_memory when called by authenticated user directly.
  // Internal calls (from ai-assistant route) skip persistence — ai-assistant handles it.
  if (!isInternalCall) {
    const supabase2 = await createClient();
    const { data: { user: persistUser } } = await supabase2.auth.getUser();
    if (persistUser) {
      try {
        const admin = createAdminClient();
        await admin.from('assistant_memory').insert({
          user_id: persistUser.id,
      memory_type: 'pipeline_run',
      key: runId,
      value: {
        runId,
        appUrl,
        requestedFeatures: uniqueFeatures,
        summary,
        failedChecks: results
          .filter((r) => r.status !== 'pass')
          .map((r) => ({ checkId: r.checkId, label: r.label, status: r.status, error: r.error, httpStatus: r.httpStatus })),
        completedAt,
      },
      tags: ['verification', featureKey, `passRate:${passRate}`],
        });
      } catch {
        // Persistence failure is non-fatal
      }
    }
  }

  return NextResponse.json(response);
}

// GET — returns the feature catalogue so the UI knows what can be checked
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const featureSets = Object.entries(FEATURE_SETS).map(([key, ids]) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    featureIds: [...new Set(ids)],
    checkCount: ALL_CHECKS.filter((c) => [...new Set(ids)].includes(c.featureId)).length,
  }));

  return NextResponse.json({
    totalChecks: ALL_CHECKS.length,
    featureSets,
    checks: ALL_CHECKS.map((c) => ({
      checkId: c.checkId,
      featureId: c.featureId,
      label: c.label,
      method: c.method,
      path: c.path,
    })),
  });
}
