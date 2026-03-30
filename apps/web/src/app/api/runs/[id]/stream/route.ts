export const maxDuration = 300;
export const runtime = "nodejs";

import type { NextRequest } from "next/server";

const API_BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

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
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
