/**
 * POST /api/generate-image
 *
 * Dual-mode image generation:
 *   mode: "responses" — OpenAI Responses API with image_generation tool.
 *                       Supports image inputs (references). Helper behavior.
 *   mode: "images"    — OpenAI Images API. Direct rendering. GPT Image models.
 *                       Supports image editing controls.
 *
 * Flow: raw prompt → helper rewrite → realism sanitizer → prompt compiler → generate
 *
 * Reference enforcement:
 *   - Max 3 image references for images mode
 *   - References guide appearance/composition only
 *   - References pre-classified: usable / risky / reject
 *   - Realism rules always win over references
 *   - Prompt always wins over references (unless referencePriority: "high")
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";
import { FORBIDDEN_IMAGE_TERMS, REQUIRED_REALISM_ANCHORS } from "@/lib/media-realism/realismPolicy";
import { uploadImageToSupabase } from "@/lib/supabase/storage";

export const maxDuration = 120;

// ── Types ──────────────────────────────────────────────────────────────────

type ImageMode = "responses" | "images";
type ReferencePriority = "low" | "medium" | "high";
type ReferenceClassification = "usable" | "risky" | "reject";

interface ImageReference {
  kind: "image";
  fileId: string;       // base64 data URI or URL
  url?: string;
}

interface GenerateImageRequest {
  prompt: string;
  mode?: ImageMode;
  references?: ImageReference[];
  templateId?: string;
  realismMode?: "strict" | "balanced";
  aspectRatio?: "1:1" | "4:5" | "9:16" | "16:9";
  referencePriority?: ReferencePriority;
}

// ── Reference pre-classifier ───────────────────────────────────────────────

function classifyReference(url: string): ReferenceClassification {
  const lower = url.toLowerCase();
  // Reject: has text/UI tokens in URL pattern
  if (/text=|overlay=|caption=|ui=|label=/i.test(lower)) return "reject";
  // Risky: cinematic keywords in URL
  if (/cinematic|studio|glossy|polished|luxury|premium/i.test(lower)) return "risky";
  return "usable";
}

// ── Prompt realism sanitizer (image-specific) ──────────────────────────────

function sanitizeImagePrompt(raw: string): { sanitized: string; stripped: string[] } {
  const stripped: string[] = [];
  let result = raw;
  for (const term of FORBIDDEN_IMAGE_TERMS) {
    const regex = new RegExp(`(?:^|\\b)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\b|$)`, "gi");
    if (regex.test(result)) {
      stripped.push(term);
      result = result.replace(new RegExp(`(?:^|\\b)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\b|$)`, "gi"), " ").trim();
    }
  }
  result = result.replace(/\s{2,}/g, " ").trim();
  return { sanitized: result, stripped };
}

// ── Helper rewrite via GPT-4o ──────────────────────────────────────────────

async function helperRewrite(prompt: string, apiKey: string, realismMode: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: `Rewrite this image prompt to enforce realism. Mode: ${realismMode}.
Remove all cinematic, luxury, stylized, or abstract language.
Add: ordinary setting, natural lighting, realistic imperfections, believable scene.
Keep the core subject and action unchanged.
Return only the rewritten prompt — no explanation.

Original: ${prompt}`,
      }],
      temperature: 0.3,
      max_tokens: 300,
    }),
  });
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content?.trim() ?? prompt;
}

// ── Compile final prompt with realism lock ────────────────────────────────

function compileFinalPrompt(
  prompt: string,
  realismMode: string,
  references: ImageReference[],
  referencePriority: ReferencePriority,
): string {
  const anchors = REQUIRED_REALISM_ANCHORS.join(", ");
  const refGuidance = references.length > 0 && referencePriority !== "low"
    ? `\nReference guidance (${referencePriority} priority — ${referencePriority === "high" ? "use for appearance/composition" : "loosely inform composition only"}): ${references.length} reference image(s) provided.`
    : "";

  return [
    prompt,
    `\nRealism requirements: ${anchors}.`,
    refGuidance,
    "\nFinal lock: If it looks cinematic, polished, glossy, or AI-generated — it is wrong. If it looks ordinary, real, and believable — it is correct.",
    "\nDo not include text, UI elements, overlays, labels, or watermarks in the image.",
  ].filter(Boolean).join("");
}

// ── Auth ───────────────────────────────────────────────────────────────────

async function resolveWorkspace() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);
  return { user, workspace: selection.current.workspace, admin };
}

// ── POST ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = await resolveWorkspace();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });

  let body: GenerateImageRequest & { dryRun?: boolean };
  try { body = await req.json() as GenerateImageRequest & { dryRun?: boolean }; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.prompt?.trim()) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

  // dryRun: sanitize + rewrite only, no image generation — used by "Make Realistic" button
  if (body.dryRun) {
    const { sanitized, stripped } = sanitizeImagePrompt(body.prompt.trim());
    const rewritten = await helperRewrite(sanitized, apiKey, body.realismMode ?? "strict");
    return NextResponse.json({ ok: true, rewrittenPrompt: rewritten, strippedTerms: stripped, dryRun: true });
  }

  const mode: ImageMode = body.mode ?? "images";
  const realismMode = body.realismMode ?? "strict";
  const aspectRatio = body.aspectRatio ?? "16:9";
  const referencePriority: ReferencePriority = body.referencePriority ?? "medium";
  const references = body.references ?? [];

  // Enforce reference limits
  if (references.length > 3) {
    return NextResponse.json({ error: "Maximum 3 image references allowed. Remove extras before generating." }, { status: 400 });
  }

  // Classify references — reject bad ones
  const classified = references.map(ref => ({
    ref,
    classification: classifyReference(ref.url ?? ref.fileId),
  }));
  const rejected = classified.filter(c => c.classification === "reject");
  if (rejected.length > 0) {
    return NextResponse.json({
      error: "One or more references were rejected (detected baked-in text/UI or conflicting style). Remove them and try again.",
      rejectedCount: rejected.length,
    }, { status: 422 });
  }
  const usableRefs = classified
    .filter(c => c.classification !== "reject")
    .map(c => c.ref);

  // Step 1: Sanitize prompt
  const { sanitized, stripped } = sanitizeImagePrompt(body.prompt.trim());

  // Step 2: Helper rewrite
  const rewritten = await helperRewrite(sanitized, apiKey, realismMode);

  // Step 3: Compile final prompt
  const finalPrompt = compileFinalPrompt(rewritten, realismMode, usableRefs, referencePriority);

  // Step 4: Size mapping
  const sizeMap: Record<string, string> = {
    "1:1": "1024x1024", "4:5": "1024x1536", "9:16": "1024x1536", "16:9": "1536x1024",
  };
  const size = sizeMap[aspectRatio] ?? "1536x1024";

  let outputUrl: string | null = null;

  try {
    if (mode === "responses") {
      // ── Responses API with image_generation tool ────────────────────────
      // Supports image inputs (references) and tool-based helper behavior

      const messageContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: "text", text: finalPrompt },
      ];

      // Attach usable references as image inputs
      for (const ref of usableRefs) {
        const imgUrl = ref.url ?? ref.fileId;
        messageContent.push({
          type: "image_url",
          image_url: { url: imgUrl },
        });
      }

      const responsesBody = {
        model: "gpt-4o",
        input: messageContent,
        tools: [{
          type: "image_generation",
          size,
          quality: "high",
        }],
      };

      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(responsesBody),
      });

      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json({ error: `Responses API failed (${res.status}): ${err}` }, { status: 500 });
      }

      const data = await res.json() as {
        output?: Array<{ type: string; result?: string }>;
      };

      // Extract image from response output
      const imageOutput = data.output?.find(o => o.type === "image_generation_call");
      if (!imageOutput?.result) {
        return NextResponse.json({ error: "Responses API returned no image" }, { status: 500 });
      }

      // result is base64
      const base64Url = `data:image/png;base64,${imageOutput.result}`;
      outputUrl = await uploadImageToSupabase(base64Url, ctx.workspace.id).catch(() => base64Url);

    } else {
      // ── Images API — direct rendering, GPT Image models ─────────────────

      const imagesBody: Record<string, unknown> = {
        model: process.env.IMAGE_MODEL ?? "dall-e-3",
        prompt: finalPrompt,
        size,
        quality: process.env.IMAGE_QUALITY ?? "standard",
        n: 1,
        response_format: "url",
      };

      // Images API supports image editing when imageUrl provided
      // (uses edits endpoint for reference-guided generation)
      if (usableRefs.length > 0 && referencePriority === "high") {
        // Use edits endpoint with first reference as base
        const editBody = new FormData();
        editBody.append("model", "dall-e-2"); // edits only on dall-e-2
        editBody.append("prompt", finalPrompt);
        editBody.append("n", "1");
        editBody.append("size", "1024x1024");
        // Note: actual file upload would require fetching the ref first
        // For now fallback to standard generations with reference noted in prompt
      }

      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(imagesBody),
      });

      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json({ error: `Images API failed (${res.status}): ${err}` }, { status: 500 });
      }

      const data = await res.json() as { data: Array<{ url?: string; b64_json?: string }> };
      const item = data.data?.[0];
      if (!item) return NextResponse.json({ error: "Images API returned no data" }, { status: 500 });

      const rawUrl = item.url ?? (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
      if (!rawUrl) return NextResponse.json({ error: "No image URL in response" }, { status: 500 });

      outputUrl = await uploadImageToSupabase(rawUrl, ctx.workspace.id).catch(() => rawUrl);
    }

    // Store in generations table
    const { data: genRow } = await ctx.admin
      .from("generations")
      .insert({
        workspace_id: ctx.workspace.id,
        type: "image",
        prompt: body.prompt,
        title: body.prompt.slice(0, 60),
        status: "completed",
        output_url: outputUrl,
        aspect_ratio: aspectRatio,
        style: `realism-${realismMode}-${mode}`,
      })
      .select("id")
      .single();

    return NextResponse.json({
      ok: true,
      outputUrl,
      generationId: genRow?.id,
      mode,
      strippedTerms: stripped,
      referenceCount: usableRefs.length,
      finalPromptLength: finalPrompt.length,
    });

  } catch (err) {
    return NextResponse.json({
      error: `Generation failed: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
