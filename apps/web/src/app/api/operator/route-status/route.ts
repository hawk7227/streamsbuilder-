import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ROUTES_TO_CHECK = [
  { path: "/api/ai-assistant",      method: "POST",  detail: "Governed streaming assistant" },
  { path: "/api/files/intake",      method: "POST",  detail: "Upload orchestration" },
  { path: "/api/files/search",      method: "GET",   detail: "File chunk retrieval" },
  { path: "/api/intake/url",        method: "POST",  detail: "Website + YouTube ingestion" },
  { path: "/api/voice/transcribe",  method: "POST",  detail: "Whisper STT" },
  { path: "/api/voice/speak",       method: "GET",   detail: "ElevenLabs / OpenAI TTS" },
  { path: "/api/jobs",              method: "GET",   detail: "Job queue" },
  { path: "/api/operator/health",   method: "GET",   detail: "Provider health checks" },
];

interface RouteHealth {
  path:        string;
  method:      string;
  status:      "healthy" | "degraded" | "unknown";
  detail:      string;
  lastChecked: string;
  latencyMs?:  number;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const now    = new Date().toISOString();

  const results: RouteHealth[] = await Promise.all(
    ROUTES_TO_CHECK.map(async (route) => {
      const t0 = Date.now();
      try {
        // HEAD request — just check the route responds, don't execute its logic
        const res = await fetch(`${origin}${route.path}`, {
          method: "HEAD",
          signal: AbortSignal.timeout(4000),
        });
        // 401/405 both mean the route exists and is reachable (auth or method not allowed)
        const reachable = res.status !== 502 && res.status !== 503 && res.status !== 0;
        return {
          path:        route.path,
          method:      route.method,
          status:      reachable ? "healthy" : "degraded",
          detail:      route.detail,
          lastChecked: now,
          latencyMs:   Date.now() - t0,
        } satisfies RouteHealth;
      } catch {
        return {
          path:        route.path,
          method:      route.method,
          status:      "unknown",
          detail:      route.detail,
          lastChecked: now,
          latencyMs:   Date.now() - t0,
        } satisfies RouteHealth;
      }
    })
  );

  const allHealthy  = results.every(r => r.status === "healthy");
  const anyDegraded = results.some(r => r.status === "degraded");

  return NextResponse.json({
    summary: allHealthy ? "healthy" : anyDegraded ? "degraded" : "partial",
    checkedAt: now,
    data: results,
  });
}
