export const maxDuration = 300;
export const runtime = "nodejs";

import type { NextRequest } from "next/server";

const API_BASE = process.env.API_INTERNAL_URL;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<Response> {
  const { id } = params;

  if (!API_BASE) {
    // apps/api not deployed — return a clean SSE error stream
    const body = new ReadableStream({
      start(ctrl) {
        const enc = new TextEncoder();
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: "error", message: "Run streaming service (apps/api) is not deployed. Set API_INTERNAL_URL to enable." })}\n\n`));
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        ctrl.close();
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  try {
    const upstream = await fetch(`${API_BASE}/api/runs/${id}/stream`, {
      headers: { Accept: "text/event-stream" },
    });
    if (!upstream.ok || !upstream.body) {
      const body = new ReadableStream({
        start(ctrl) {
          const enc = new TextEncoder();
          ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: "error", message: `Upstream returned ${upstream.status}` })}\n\n`));
          ctrl.close();
        },
      });
      return new Response(body, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upstream unavailable";
    const body = new ReadableStream({
      start(ctrl) {
        const enc = new TextEncoder();
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`));
        ctrl.close();
      },
    });
    return new Response(body, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }
}
