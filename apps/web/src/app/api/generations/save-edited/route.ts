import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";
import { uploadImageToSupabase } from "@/lib/supabase/storage";

// POST /api/generations/save-edited
// Accepts a canvas data URI from ImageEditorSidebar.
// Uploads to Supabase Storage, creates a new generation row linked to the original.
// Replaces the old alert("Image saved to node output!") flow.

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { originalGenerationId, editedDataUri } = body as {
    originalGenerationId?: string;
    editedDataUri?: string;
  };

  if (!originalGenerationId || typeof originalGenerationId !== "string") {
    return NextResponse.json({ error: "originalGenerationId is required" }, { status: 400 });
  }
  if (!editedDataUri || typeof editedDataUri !== "string") {
    return NextResponse.json({ error: "editedDataUri is required" }, { status: 400 });
  }
  if (!editedDataUri.startsWith("data:image/")) {
    return NextResponse.json({ error: "editedDataUri must be a valid image data URI" }, { status: 400 });
  }

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);
  const workspaceId = selection.current.workspace.id;

  // Fetch original generation to copy metadata
  const { data: original, error: fetchError } = await admin
    .from("generations")
    .select("prompt, type, aspect_ratio, concept_id, session_id, mode")
    .eq("id", originalGenerationId)
    .eq("workspace_id", workspaceId)
    .single();

  if (fetchError || !original) {
    return NextResponse.json({ error: "Original generation not found" }, { status: 404 });
  }

  // Upload edited image to Supabase Storage
  let outputUrl: string;
  try {
    outputUrl = await uploadImageToSupabase(editedDataUri, workspaceId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Upload failed: ${msg}` }, { status: 500 });
  }

  // Create new generation row for the edited version
  const { data: newGen, error: insertError } = await admin
    .from("generations")
    .insert({
      workspace_id: workspaceId,
      type: original.type ?? "image",
      prompt: `[Edited] ${original.prompt ?? ""}`.trim(),
      status: "completed",
      output_url: outputUrl,
      aspect_ratio: original.aspect_ratio ?? "16:9",
      concept_id: original.concept_id ?? null,
      session_id: original.session_id ?? null,
      mode: original.mode ?? "standard",
      provider: "canvas_edit",
      cost_estimate: 0,
    })
    .select("id, output_url, created_at")
    .single();

  if (insertError || !newGen) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to create generation" }, { status: 500 });
  }

  return NextResponse.json({
    newGenerationId: newGen.id,
    outputUrl: newGen.output_url,
  }, { status: 201 });
}
