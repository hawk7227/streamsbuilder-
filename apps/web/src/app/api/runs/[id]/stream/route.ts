/**
 * apps/web/src/app/api/runs/[id]/stream/route.ts
 *
 * SSE proxy — pipes the upstream Redis pub/sub stream to the browser client.
 * maxDuration=300 is MANDATORY. Without it, Vercel closes the SSE connection
 * at 10 seconds, silently killing in-progress run streams.
 */

export const maxDuration = 300;
export const runtime = "nodejs";

import { NextRequest } from "next/server";

const API_BASE = process.env["API_INTERNAL_URL"] ?? "http://localhost:3001";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<Response> {
  const { id } = params;

  const upstream = await fetch(`${API_BASE}/api/runs/${id}/stream`, {
    headers: { Accept: "text/event-stream" },
  });

  return new Response(upstream.body, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx/Vercel buffering
    },
  });
}
