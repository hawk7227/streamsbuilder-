import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PROVIDER_CHECKS: Record<string, { url: string; authHeader?: () => string | null }> = {
  OpenAI:     { url: "https://api.openai.com/v1/models",         authHeader: () => process.env.OPENAI_API_KEY ? `Bearer ${process.env.OPENAI_API_KEY}` : null },
  ElevenLabs: { url: "https://api.elevenlabs.io/v1/voices",      authHeader: () => process.env.ELEVENLABS_API_KEY ?? null },
  Kling:      { url: "https://api-singapore.klingai.com/v1/images/generations", authHeader: () => null },
  Runway:     { url: "https://api.runwayml.com/v1/tasks",        authHeader: () => process.env.RUNWAY_API_KEY ? `Bearer ${process.env.RUNWAY_API_KEY}` : null },
  Anthropic:  { url: "https://api.anthropic.com/v1/messages",    authHeader: () => process.env.ANTHROPIC_API_KEY ?? null },
  Supabase:   { url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, authHeader: () => null },
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const providerName = searchParams.get("provider");

  if (providerName) {
    // Single provider check
    const check = PROVIDER_CHECKS[providerName];
    if (!check) return NextResponse.json({ ok: false, error: "Unknown provider" });

    const t0 = Date.now();
    try {
      const headers: Record<string, string> = {};
      const auth = check.authHeader?.();
      if (auth) {
        if (providerName === "ElevenLabs") headers["xi-api-key"] = auth;
        else if (providerName === "Anthropic") headers["x-api-key"] = auth;
        else headers["Authorization"] = auth;
      }
      const res = await fetch(check.url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(5000),
      });
      // 401 means key missing but service is up — still "online"
      const ok = res.status !== 0 && res.status !== 503 && res.status !== 502;
      return NextResponse.json({ ok, latencyMs: Date.now() - t0, status: res.status });
    } catch (e) {
      return NextResponse.json({ ok: false, latencyMs: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // All providers
  const results = await Promise.all(
    Object.entries(PROVIDER_CHECKS).map(async ([name, check]) => {
      const t0 = Date.now();
      try {
        const headers: Record<string, string> = {};
        const auth = check.authHeader?.();
        if (auth) {
          if (name === "ElevenLabs") headers["xi-api-key"] = auth;
          else if (name === "Anthropic") headers["x-api-key"] = auth;
          else headers["Authorization"] = auth;
        }
        const res = await fetch(check.url, { method: "GET", headers, signal: AbortSignal.timeout(5000) });
        const ok = res.status !== 0 && res.status !== 503 && res.status !== 502;
        return { name, ok, latencyMs: Date.now() - t0, status: res.status };
      } catch (e) {
        return { name, ok: false, latencyMs: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
      }
    })
  );

  return NextResponse.json({ data: results });
}
