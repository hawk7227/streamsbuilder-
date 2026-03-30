import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadImageToSupabase } from "@/lib/supabase/storage";
import { scoreT2VCandidate } from "@/lib/media-realism-video/t2vQc";

// POST /api/webhook/video-complete
// Receives Kling and Runway completion callbacks.
// Downloads from CDN → uploads to Supabase Storage → updates generation row.
// Realtime subscription on browser receives the update automatically.
// Returns 200 always (idempotent) so providers don't retry indefinitely.

type KlingTaskResult = {
  videos?: { url: string; duration?: number }[];
  images?: { url: string }[];
};

type WebhookPayload = {
  task_id?: string;
  task_status?: string;
  task_result?: KlingTaskResult;
  // Runway shape
  id?: string;
  status?: string;
  output?: string[];
};

async function uploadVideoToSupabase(
  remoteUrl: string,
  workspaceId: string
): Promise<string> {
  const res = await fetch(remoteUrl);
  if (!res.ok) throw new Error(`Failed to download video: ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "video/mp4";
  const ext = contentType.includes("webm") ? "webm" : "mp4";
  const name = crypto.randomUUID();
  const storagePath = `${workspaceId}/${name}.${ext}`;
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from("generations")
    .upload(storagePath, buffer, { contentType, upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data } = admin.storage.from("generations").getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function POST(request: Request) {
  let payload: WebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const taskId = payload.task_id ?? payload.id;
  if (!taskId) {
    return NextResponse.json({ success: true, message: "No task_id, ignoring" });
  }

  const admin = createAdminClient();

  const { data: generation } = await admin
    .from("generations")
    .select("id, workspace_id, status, type")
    .eq("external_id", taskId)
    .maybeSingle();

  if (!generation) {
    return NextResponse.json({ success: true, message: "Generation not found, ignoring" });
  }

  if (generation.status === "completed" || generation.status === "failed") {
    return NextResponse.json({ success: true, message: "Already processed" });
  }

  const isKlingSuccess =
    payload.task_status === "succeed" &&
    ((payload.task_result?.videos?.length ?? 0) > 0 ||
     (payload.task_result?.images?.length ?? 0) > 0);

  const isRunwaySuccess =
    payload.status === "SUCCEEDED" && (payload.output?.length ?? 0) > 0;

  const isFailure =
    payload.task_status === "failed" || payload.status === "FAILED";

  if (isFailure) {
    await admin.from("generations").update({ status: "failed" }).eq("id", generation.id);
    return NextResponse.json({ success: true, generationId: generation.id, status: "failed" });
  }

  if (!isKlingSuccess && !isRunwaySuccess) {
    return NextResponse.json({ success: true, message: "Still processing" });
  }

  let cdnUrl: string | null = null;
  if (isKlingSuccess) {
    cdnUrl =
      payload.task_result?.videos?.[0]?.url ??
      payload.task_result?.images?.[0]?.url ??
      null;
  } else if (isRunwaySuccess) {
    cdnUrl = payload.output?.[0] ?? null;
  }

  if (!cdnUrl) {
    return NextResponse.json({ error: "No output URL in payload" }, { status: 400 });
  }

  let outputUrl: string;
  try {
    if (generation.type === "video") {
      outputUrl = await uploadVideoToSupabase(cdnUrl, generation.workspace_id as string);
    } else {
      outputUrl = await uploadImageToSupabase(cdnUrl, generation.workspace_id as string);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin.from("generations").update({ status: "failed" }).eq("id", generation.id);
    return NextResponse.json({ error: `Upload failed: ${msg}` }, { status: 500 });
  }

  // Run QC scoring for video completions — stores score for diagnostics
  let qcPassed: boolean | null = null;
  if (generation.type === "video") {
    try {
      const qcScore = scoreT2VCandidate(outputUrl);
      qcPassed = qcScore.passed;
      await admin
        .from("generations")
        .update({ status: "completed", output_url: outputUrl, progress: Math.round(qcScore.totalScore * 100) })
        .eq("id", generation.id);
    } catch {
      // QC failure doesn't block delivery — video is stored, QC is advisory
      await admin
        .from("generations")
        .update({ status: "completed", output_url: outputUrl })
        .eq("id", generation.id);
    }
  } else {
    await admin
      .from("generations")
      .update({ status: "completed", output_url: outputUrl })
      .eq("id", generation.id);
  }

  return NextResponse.json({ success: true, generationId: generation.id, outputUrl, qcPassed });
}
