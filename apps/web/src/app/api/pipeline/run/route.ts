import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runPipelineProduction, executeNode } from "../../../../lib/pipeline/pipeline-orchestrator";
import type { IntakeBrief } from "../../../../lib/media-realism/types";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // Auth gate — accept cookie session OR internal tool call from streams-assistant
  const isInternalCall = request.headers.get("x-streams-tool-call") === "1";
  if (!isInternalCall) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { mode?: "runPipeline" | "runStep"; step?: string; payload?: Record<string, unknown> };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.mode && !body.step) {
    return NextResponse.json({ ok: false, error: "mode or step is required" }, { status: 400 });
  }

  try {
    if (body.mode === "runPipeline") {
      const result = await runPipelineProduction(body.payload as unknown as IntakeBrief);
      return NextResponse.json({ ok: true, result });
    }

    const step = body.step;
    if (!step) return NextResponse.json({ ok: false, error: "step is required" }, { status: 400 });

    const result = await executeNode(step as never, body.payload ?? {});
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
