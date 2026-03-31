export const maxDuration = 300;
export const runtime = "nodejs";

import { type NextRequest, NextResponse } from "next/server";
import { BotRequestSchema } from "@streams/contracts";

const API_BASE = process.env.API_INTERNAL_URL;

export async function POST(req: NextRequest): Promise<NextResponse | Response> {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parse = BotRequestSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parse.error.flatten() },
      { status: 400 }
    );
  }

  // If apps/api is not deployed, fall through to /api/ai-assistant directly
  if (!API_BASE) {
    const { userMessage, conversationId } = parse.data;
    const origin = req.nextUrl.origin;
    try {
      const res = await fetch(`${origin}/api/ai-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") ?? "" },
        body: JSON.stringify({
          messages: [{ role: "user", content: [{ type: "text", text: userMessage }] }],
          context: { projectId: parse.data.projectId },
          conversationId,
        }),
      });
      if (res.headers.get("content-type")?.includes("text/event-stream")) {
        return new Response(res.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        });
      }
      return NextResponse.json(await res.json(), { status: res.status });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Assistant unavailable";
      return NextResponse.json({ error: msg }, { status: 503 });
    }
  }

  // Proxy to apps/api
  try {
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upstream API unavailable";
    return NextResponse.json({ error: `apps/api unreachable: ${msg}` }, { status: 503 });
  }
}
