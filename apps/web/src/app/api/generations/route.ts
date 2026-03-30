import { NextResponse } from "next/server";

export const maxDuration = 60; // DALL-E + optional upload can take up to 30s
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";
import { generateContent } from "@/lib/ai";
import { GenerationType } from "@/lib/ai/types";
import { uploadImageToSupabase } from "@/lib/supabase/storage";
import { compileRealismPrompt } from "@/lib/media-realism/promptCompiler";
import { buildScenePlan } from "@/lib/media-realism/scenePlanner";
import { buildLayoutPlan } from "@/lib/media-realism/layoutPlanner";
import type { ConceptDirection, OverlayIntent, ValidatorImagePolicy } from "@/lib/media-realism/types";

const allowedTypes: GenerationType[] = ["video", "image", "script", "voice", "i2v"];

type AllowedType = (typeof allowedTypes)[number];

const isAllowedType = (value: string): value is GenerationType =>
  allowedTypes.includes(value as GenerationType);

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const limit = Number(searchParams.get("limit") ?? "10");
  const offset = Number(searchParams.get("offset") ?? "0");

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);

  let query = admin
    .from("generations")
    .select(
      "id, type, prompt, title, status, aspect_ratio, duration, quality, style, favorited, output_url, external_id, progress, is_preview, created_at"
    )
    .eq("workspace_id", selection.current.workspace.id)
    .order("created_at", { ascending: false });

  if (type && isAllowedType(type)) {
    query = query.eq("type", type);
  }

  if (Number.isFinite(limit) && limit > 0) {
    const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
    query = query.range(safeOffset, safeOffset + limit - 1);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const type = typeof payload?.type === "string" ? payload.type : "";
  const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";

  if (!type || !isAllowedType(type)) {
    return NextResponse.json({ error: "Invalid generation type" }, { status: 400 });
  }

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);

  let outputUrl = typeof payload?.outputUrl === "string" ? payload.outputUrl : null;
  let externalId = typeof payload?.externalId === "string" ? payload.externalId : null;
  let responseText = null;

  try {
    // Allow caller to override provider (e.g. force openai for instant DALL-E)
    const providerOverride = typeof payload?.provider === "string" ? payload.provider : null;

    // For image type: run through the universal realism engine.
    // scenePlanner → layoutPlanner → promptCompiler — no realism logic in this route.
    let finalPrompt = prompt;
    if (type === "image") {
      const subjectAction = typeof payload?.subjectAction === "string" ? payload.subjectAction : prompt;

      const concept: ConceptDirection = {
        id: typeof payload?.conceptId === "string" ? payload.conceptId : "direct",
        angle: "direct generation",
        hook: subjectAction,
        subjectType: "person",
        action: subjectAction,
        environment: "real home environment",
        realismMode: "home_real",
        desiredMood: "calm, natural, ordinary",
        overlayIntent: {
          headline: "",
          cta: "",
          textDensityHint: "low",
          titleLengthClass: "short",
          ctaLengthClass: "short",
        } satisfies OverlayIntent,
      };

      const validatorPolicy: ValidatorImagePolicy = {
        allowedVisualClaims: [],
        forbiddenVisualClaims: [],
        forbiddenProps: [],
        forbiddenScenes: [],
        noTextInImage: true,
      };

      const scenePlan = buildScenePlan(concept, { status: "pass", issues: [], imagePolicy: validatorPolicy });
      const layoutPlan = buildLayoutPlan(scenePlan, concept.overlayIntent, "1:1");
      finalPrompt = compileRealismPrompt({ scenePlan, layoutPlan, validatorPolicy, overlayIntent: concept.overlayIntent });
      console.log("[MediaRealism] prompt compiled for direct generation | conceptId:", concept.id);
    }

    const generationResult = await generateContent(type as GenerationType, {
      prompt: finalPrompt,
      aspectRatio: payload?.aspectRatio,
      duration: payload?.duration,
      quality: payload?.quality,
      style: providerOverride ?? payload?.style,  // pass provider as style hint
      imageUrl: typeof payload?.imageUrl === "string" ? payload.imageUrl : undefined,
      callBackUrl: typeof payload?.callBackUrl === "string" ? payload.callBackUrl : undefined,
      mode: typeof payload?.mode === "string" ? payload.mode as "standard" | "pro" : "standard",
    }, providerOverride ?? undefined);

    payload.status = generationResult.status;
    if (generationResult.outputUrl) {
      outputUrl = generationResult.outputUrl;
    }
    if (generationResult.externalId) {
      externalId = generationResult.externalId;
    }
    if (generationResult.responseText) {
      responseText = generationResult.responseText;
    }

    // ── Upload image to Supabase Storage (non-blocking) ───────────────
    // Fire-and-forget: upload runs after response is returned so the client
    // gets status="completed" + provider URL immediately without waiting.
    // The DB row is updated in the background once the upload finishes.
    if (type === "image" && generationResult.status === "completed" && outputUrl) {
      const providerUrl = outputUrl; // capture before async closure
      const workspaceId = selection.current.workspace.id;
      // Intentionally NOT awaited — background upload
      void (async () => {
        try {
          const supabaseUrl = await uploadImageToSupabase(providerUrl, workspaceId);
          // Update the DB row once upload completes (best-effort)
          await admin.from("generations").update({ output_url: supabaseUrl }).eq("output_url", providerUrl);
          console.log("[Storage] Image uploaded to Supabase:", supabaseUrl);
        } catch (uploadErr) {
          console.error("[Storage] Background upload failed — provider URL kept:", uploadErr);
        }
      })();
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[Generations] Generation failed:", errorMsg);
    payload.status = "failed";
    payload.generationError = errorMsg; // surfaced to client
  }

  const insertPayload = {
    user_id: user.id,
    workspace_id: selection.current.workspace.id,
    type,
    prompt: responseText ? responseText : prompt, // Save the generated script text in prompt column if script
    title: typeof payload?.title === "string" ? payload.title : null,
    status: payload.status === "failed" ? "failed" : payload.status === "pending" ? "pending" : "completed",
    aspect_ratio:
      typeof payload?.aspectRatio === "string" ? payload.aspectRatio : null,
    duration: typeof payload?.duration === "string" ? payload.duration : null,
    quality: typeof payload?.quality === "string" ? payload.quality : null,
    style: typeof payload?.style === "string" ? payload.style : null,
    output_url: outputUrl,
    external_id: externalId,
    is_preview: typeof payload?.isPreview === "boolean" ? payload.isPreview : false,
    concept_id: typeof payload?.conceptId === "string" ? payload.conceptId : null,
    session_id: typeof payload?.sessionId === "string" ? payload.sessionId : null,
    provider: typeof payload?.provider === "string" ? payload.provider : null,
    mode: typeof payload?.mode === "string" ? payload.mode : "standard",
    cost_estimate: typeof payload?.costEstimate === "number" ? payload.costEstimate : null,
  };

  const { data, error } = await admin
    .from("generations")
    .insert(insertPayload)
    .select(
      "id, type, prompt, title, status, aspect_ratio, duration, quality, style, favorited, output_url, external_id, progress, is_preview, created_at"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data.status === "failed") {
    return NextResponse.json({ data, error: payload.generationError ?? "Generation failed" });
  }
  return NextResponse.json({ data });
}
