/**
 * apps/web/src/app/api/system-status/route.ts
 *
 * Proxies to apps/api /api/system-status.
 * Passes x-admin-secret from the incoming request header.
 * Returns 503 if system is degraded/down — never swallows non-200 status codes.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env["API_INTERNAL_URL"] ?? "http://localhost:3001";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const adminSecret = req.headers.get("x-admin-secret");

  if (!adminSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upstream = await fetch(`${API_BASE}/api/system-status`, {
    headers: { "x-admin-secret": adminSecret },
    // No cache — always fresh
    cache: "no-store",
  }).catch((err: unknown) => {
    // API is unreachable — return a synthetic down status
    console.error("[system-status proxy] API unreachable:", err);
    return null;
  });

  if (!upstream) {
    return NextResponse.json(
      {
        status: "down",
        timestamp: new Date().toISOString(),
        version: "unknown",
        commit: "unknown",
        services: {
          database: "unknown",
          redis: "unknown",
          s3: "unknown",
          openai: "unknown",
          worker: "unknown",
        },
        queues: {},
      },
      { status: 503 }
    );
  }

  const body: unknown = await upstream.json();
  return NextResponse.json(body, { status: upstream.status });
}
