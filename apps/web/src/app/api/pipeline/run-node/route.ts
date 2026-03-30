import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { executeNode, executePipeline } from "../../../../lib/pipeline/pipeline-execution";

export async function POST(request: NextRequest) {
  // Auth gate — pipeline execution calls AI providers and costs money
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      mode?: "runStep" | "runPipeline";
      step?: string;
      type?: string;
      data?: Record<string, unknown>;
      context?: Record<string, unknown>;
      payload?: Record<string, unknown>;
    };

    if (body.mode === "runPipeline") {
      const result = await executePipeline(body.payload as never);
      return NextResponse.json({ ok: true, result });
    }

    const nodeType = body.type ?? body.step;
    if (!nodeType) {
      return NextResponse.json({ success: false, error: "type (or step) is required" }, { status: 400 });
    }

    const node = { type: nodeType, data: body.data ?? body.payload ?? {} };
    const context = body.context ?? {};

    const result = await executeNode(node as never, context);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
