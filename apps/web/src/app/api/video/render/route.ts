import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";

// POST /api/video/render
// Accepts a JSON2Video project object from VideoEditorSidebar.
// Submits to JSON2Video API, polls for completion, uploads result to Supabase Storage.
// Falls back to direct CDN URL if upload fails (non-fatal).

const JSON2VIDEO_BASE = "https://api.json2video.com/v2";
const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ATTEMPTS = 30; // 2 minutes max

type J2VProject = {
  resolution: string;
  quality: string;
  scenes: unknown[];
  elements?: unknown[];
};

type J2VSubmitResponse = {
  movie: string; // job id
  status?: string;
  error?: boolean;
  message?: string;
};

type J2VStatusResponse = {
  movie: string;
  status: "rendering" | "done" | "error";
  url?: string;
  message?: string;
};

async function waitForRender(movieId: string, apiKey: string): Promise<J2VStatusResponse> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${JSON2VIDEO_BASE}/movies?project=${movieId}`, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`JSON2Video poll failed: ${res.status}`);
    const data = await res.json() as J2VStatusResponse;
    if (data.status === "done" || data.status === "error") return data;
  }
  throw new Error("JSON2Video render timed out after 2 minutes");
}

async function uploadVideoFromUrl(remoteUrl: string, workspaceId: string): Promise<string> {
  const admin = createAdminClient();
  const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const storagePath = `${workspaceId}/${crypto.randomUUID()}.mp4`;
  const { error } = await admin.storage.from("generations")
    .upload(storagePath, buffer, { contentType: "video/mp4", upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data } = admin.storage.from("generations").getPublicUrl(storagePath);
  return data.publicUrl;
}

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

  const { project, generationId } = body as { project?: J2VProject; generationId?: string };

  if (!project || !project.scenes?.length) {
    return NextResponse.json({ error: "project with at least one scene is required" }, { status: 400 });
  }

  const apiKey = process.env.JSON2VIDEO_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "JSON2VIDEO_API_KEY not configured" }, { status: 500 });

  // Submit render job
  const submitRes = await fetch(`${JSON2VIDEO_BASE}/movies`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(project),
    signal: AbortSignal.timeout(15000),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    return NextResponse.json({ error: `JSON2Video submit failed: ${err}` }, { status: 502 });
  }

  const submitted = await submitRes.json() as J2VSubmitResponse;
  if (submitted.error || !submitted.movie) {
    return NextResponse.json({ error: submitted.message ?? "Submission rejected" }, { status: 502 });
  }

  const movieId = submitted.movie;

  // Poll until done (synchronous — video renders are short, 5-30s)
  let result: J2VStatusResponse;
  try {
    result = await waitForRender(movieId, apiKey);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 504 });
  }

  if (result.status === "error" || !result.url) {
    return NextResponse.json({ error: result.message ?? "Render failed" }, { status: 500 });
  }

  // Upload to Supabase Storage for permanence
  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);
  const workspaceId = selection.current.workspace.id;

  let outputUrl: string;
  try {
    outputUrl = await uploadVideoFromUrl(result.url, workspaceId);
  } catch {
    // Non-fatal: fall back to CDN URL
    outputUrl = result.url;
  }

  // If a generationId was passed, update that row; otherwise create a new one
  if (generationId) {
    await admin.from("generations")
      .update({ status: "completed", output_url: outputUrl })
      .eq("id", generationId)
      .eq("workspace_id", workspaceId);
    return NextResponse.json({ generationId, outputUrl });
  }

  const { data: newGen } = await admin.from("generations")
    .insert({
      workspace_id: workspaceId,
      type: "video",
      prompt: "[Rendered via Video Editor]",
      status: "completed",
      output_url: outputUrl,
      provider: "json2video",
      cost_estimate: 0,
      mode: "standard",
    })
    .select("id")
    .single();

  return NextResponse.json({ generationId: newGen?.id ?? null, outputUrl }, { status: 201 });
}
