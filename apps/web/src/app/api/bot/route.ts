export const maxDuration = 300;
export const runtime = "nodejs";

import { type NextRequest, NextResponse } from "next/server";
import { BotRequestSchema } from "@streams/contracts";

const API_BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest): Promise<NextResponse | Response> {
  const body: unknown = await req.json().catch(() => null);

  const parse = BotRequestSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parse.error.flatten() },
      { status: 400 }
    );
  }

  const upstream = await fetch(`${API_BASE}/api/bot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parse.data),
  });

  if (upstream.headers.get("content-type")?.includes("text/event-stream")) {
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  const json: unknown = await upstream.json();
  return NextResponse.json(json, { status: upstream.status });
}
