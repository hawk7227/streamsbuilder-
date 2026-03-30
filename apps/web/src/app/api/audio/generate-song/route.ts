import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";
import { generateSong, extractVocals } from "@/lib/audio/songPipeline";
import { enqueueJob } from "@/lib/jobs/queue";

export const maxDuration = 120;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    prompt?:       string;
    style?:        string;
    title?:        string;
    instrumental?: boolean;
    provider?:     "suno" | "udio" | "auto";
    extractVocals?: boolean;
    async?:        boolean;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.prompt?.trim()) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);
  const workspaceId = selection.current.workspace.id;

  // Async mode — enqueue job and return immediately
  if (body.async) {
    const job = await enqueueJob("song_gen", {
      prompt:       body.prompt,
      style:        body.style,
      title:        body.title,
      instrumental: body.instrumental,
      provider:     body.provider,
      extractVocals: body.extractVocals,
    }, { workspaceId, userId: user.id, priority: 3 });
    return NextResponse.json({ data: { jobId: job.id, status: "pending" } }, { status: 202 });
  }

  // Sync mode — generate and return
  try {
    const result = await generateSong({
      prompt:       body.prompt,
      style:        body.style,
      title:        body.title,
      instrumental: body.instrumental,
      provider:     body.provider ?? "auto",
    });

    // Vocal extraction (non-blocking if URL is ready)
    if (body.extractVocals && result.audioUrl && result.status === "completed") {
      const stems = await extractVocals(result.audioUrl);
      if (stems) result.stems = stems;
    }

    // Save to media_assets
    if (result.audioUrl && result.status === "completed") {
      await admin.from("media_assets").insert({
        workspace_id: workspaceId,
        user_id:      user.id,
        type:         "audio",
        url:          result.audioUrl,
        name:         result.title,
        mime_type:    "audio/mpeg",
        duration_secs: result.duration,
        metadata:     { provider: result.provider, stems: result.stems, prompt: body.prompt },
        tags:         ["song", "generated", result.provider],
      }).then(() => {});
    }

    return NextResponse.json({ data: result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Song generation failed" },
      { status: 500 }
    );
  }
}
