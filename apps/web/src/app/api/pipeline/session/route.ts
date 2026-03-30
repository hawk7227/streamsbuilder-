import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";

// POST /api/pipeline/session
// Upserts session state. Pass id to update existing, omit to create new.
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

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);
  const workspaceId = selection.current.workspace.id;

  const {
    id,
    niche_id,
    selected_concept_id,
    prompts,
    step_states,
    outputs,
    pipeline_status,
    current_step_id,
  } = body as Record<string, unknown>;

  if (id && typeof id === "string") {
    // Update existing session — only patch fields that are provided
    const updates: Record<string, unknown> = {};
    if (niche_id !== undefined) updates.niche_id = niche_id;
    if (selected_concept_id !== undefined) updates.selected_concept_id = selected_concept_id;
    if (prompts !== undefined) updates.prompts = prompts;
    if (step_states !== undefined) updates.step_states = step_states;
    if (outputs !== undefined) updates.outputs = outputs;
    if (pipeline_status !== undefined) updates.pipeline_status = pipeline_status;
    if (current_step_id !== undefined) updates.current_step_id = current_step_id;

    const { data, error } = await admin
      .from("pipeline_sessions")
      .update(updates)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select("id, niche_id, selected_concept_id, prompts, step_states, outputs, pipeline_status, current_step_id, updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  // Create new session
  const { data, error } = await admin
    .from("pipeline_sessions")
    .insert({
      workspace_id: workspaceId,
      niche_id: niche_id ?? null,
      selected_concept_id: selected_concept_id ?? null,
      prompts: prompts ?? {},
      step_states: step_states ?? {
        strategy: "queued", copy: "queued", validator: "queued",
        imagery: "queued", i2v: "queued", assets: "queued", qa: "queued",
      },
      outputs: outputs ?? { script: null, image: null, video: null },
      pipeline_status: pipeline_status ?? "idle",
      current_step_id: current_step_id ?? null,
    })
    .select("id, niche_id, selected_concept_id, prompts, step_states, outputs, pipeline_status, current_step_id, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
