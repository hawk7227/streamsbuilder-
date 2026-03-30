import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";

// GET /api/niches — list all custom niches for this workspace
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);

  const { data, error } = await admin
    .from("workspace_niches")
    .select("id, name, pipeline_type, brand_tone, approved_facts, banned_phrases, ruleset_version, created_at")
    .eq("workspace_id", selection.current.workspace.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// POST /api/niches — create a new custom niche
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

  const { name, pipeline_type, brand_tone, approved_facts, banned_phrases,
          strategy_prompt, copy_prompt, validator_prompt, image_prompt,
          image_to_video, qa_instruction } = body as Record<string, unknown>;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!pipeline_type || typeof pipeline_type !== "string") {
    return NextResponse.json({ error: "pipeline_type is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);

  const { data, error } = await admin
    .from("workspace_niches")
    .insert({
      workspace_id: selection.current.workspace.id,
      name,
      pipeline_type,
      brand_tone: brand_tone ?? null,
      approved_facts: Array.isArray(approved_facts) ? approved_facts : [],
      banned_phrases: Array.isArray(banned_phrases) ? banned_phrases : [],
      strategy_prompt: strategy_prompt ?? null,
      copy_prompt: copy_prompt ?? null,
      validator_prompt: validator_prompt ?? null,
      image_prompt: image_prompt ?? null,
      image_to_video: image_to_video ?? null,
      qa_instruction: qa_instruction ?? null,
      ruleset_version: `${pipeline_type}-custom-v1`,
      created_by: user.id,
    })
    .select("id, name, pipeline_type, brand_tone, approved_facts, banned_phrases, ruleset_version, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data }, { status: 201 });
}
