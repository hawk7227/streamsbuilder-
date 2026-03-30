import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";

// GET /api/generations/[id] — status polling for pending generations
export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Missing ID" }, { status: 400 });
  }

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);

  const { data, error } = await admin
    .from("generations")
    .select("id, type, status, output_url, progress, provider, external_id, created_at")
    .eq("id", id)
    .eq("workspace_id", selection.current.workspace.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }

  const elapsedSeconds = Math.floor(
    (Date.now() - new Date(data.created_at).getTime()) / 1000
  );

  return NextResponse.json({
    id: data.id,
    status: data.status,
    output_url: data.output_url,
    progress: data.progress,
    provider: data.provider,
    external_id: data.external_id,
    elapsed_seconds: elapsedSeconds,
  });
}

export async function DELETE(
    _request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
        return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    const admin = createAdminClient();
    const selection = await getCurrentWorkspaceSelection(admin, user);

    const { error } = await admin
        .from("generations")
        .delete()
        .eq("id", id)
        .eq("workspace_id", selection.current.workspace.id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}

export async function PATCH(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
        return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    const payload = await request.json().catch(() => ({}));

    // Filter allowed fields to update
    const updates: Record<string, unknown> = {};
    if (typeof payload.favorited === "boolean") {
        updates.favorited = payload.favorited;
    }

    // Nothing to update
    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const admin = createAdminClient();
    const selection = await getCurrentWorkspaceSelection(admin, user);

    const { data, error } = await admin
        .from("generations")
        .update(updates)
        .eq("id", id)
        .eq("workspace_id", selection.current.workspace.id)
        .select(
            "id, type, prompt, title, status, aspect_ratio, duration, quality, style, favorited, output_url, created_at"
        )
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
}
