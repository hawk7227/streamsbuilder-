/**
 * /api/pipeline/run — Production pipeline route.
 *
 * Uses runPipelineProduction from pipeline-orchestrator:
 * - AI-generated concepts (no hardcoded telehealth angles)
 * - AI-generated copy (no mechanical extraction)
 * - Config-driven validator (no niche lock)
 * - All 3 concepts generate images in parallel
 * - Real Kling I2V
 * - Real Satori compositor + Supabase upload
 */

import { NextRequest, NextResponse } from "next/server";
import { runPipelineProduction, executeNode } from "../../../../lib/pipeline/pipeline-orchestrator";
import type { IntakeBrief } from "../../../../lib/media-realism/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      mode?: "runPipeline" | "runStep";
      step?: string;
      payload?: Record<string, unknown>;
    };

    if (body.mode === "runPipeline") {
      const result = await runPipelineProduction(body.payload as unknown as IntakeBrief);
      return NextResponse.json({ ok: true, result });
    }

    if (!body.step) {
      return NextResponse.json({ ok: false, error: "step is required" }, { status: 400 });
    }

    const result = await executeNode(body.step as never, body.payload ?? {});
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
