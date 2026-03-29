/**
 * apps/web/src/app/api/bot/route.ts
 *
 * Next.js App Router route handler — proxies to apps/api Express server.
 * maxDuration=300 is MANDATORY. Without it, Vercel kills streaming at 10s.
 */

export const maxDuration = 300;
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { BotRequestSchema } from "@streams/contracts";

const API_BASE = process.env["API_INTERNAL_URL"] ?? "http://localhost:3001";

export async function POST(req: NextRequest): Promise<NextResponse | Response> {
  const body: unknown = await req.json().catch(() => null);

  const parse = BotRequestSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parse.error.flatten() },
      { status: 400 }
    );
  }

  // For helper/builder modes: stream directly back to the client
  // For runtime/deploy modes: returns 202 + streamUrl immediately
  const upstream = await fetch(`${API_BASE}/api/bot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parse.data),
  });

  // If upstream returns SSE stream, pass it through
  if (upstream.headers.get("content-type")?.includes("text/event-stream")) {
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  // Otherwise it's a 202 JSON response
  const json: unknown = await upstream.json();
  return NextResponse.json(json, { status: upstream.status });
}
