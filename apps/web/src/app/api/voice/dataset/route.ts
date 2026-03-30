import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";
import { uploadFileWithHash } from "@/lib/supabase/storage";

export const maxDuration = 120;

// ── Validation ────────────────────────────────────────────────────────────

const VALID_AUDIO_MIMES = new Set([
  "audio/wav","audio/x-wav","audio/mpeg","audio/mp3",
  "audio/ogg","audio/flac","audio/aac","audio/mp4","audio/x-m4a",
]);

const MIN_DURATION_SECS = 30;
const MAX_DURATION_SECS = 7200; // 2 hours

function estimateDurationFromSize(bytes: number, mimeType: string): number {
  // Rough estimates: WAV ~10MB/min, MP3 ~1MB/min, FLAC ~5MB/min
  const mbPerMin = mimeType.includes("wav") ? 10 : mimeType.includes("flac") ? 5 : 1;
  return (bytes / (mbPerMin * 1024 * 1024)) * 60;
}

function scoreDatasetQuality(sizeBytes: number, mimeType: string, durationSecs: number): number {
  let score = 50;
  // Duration scoring
  if (durationSecs >= 300)  score += 20;  // 5+ min
  if (durationSecs >= 1800) score += 10;  // 30+ min
  // Format scoring (lossless preferred)
  if (mimeType.includes("wav") || mimeType.includes("flac")) score += 15;
  else if (mimeType.includes("aac")) score += 5;
  // Size/quality ratio (larger = better quality for same duration)
  const bytesPerSec = sizeBytes / Math.max(durationSecs, 1);
  if (bytesPerSec > 50000) score += 5; // high bitrate
  return Math.min(100, score);
}

// ── POST — upload dataset ─────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string) || file?.name || "Untitled Dataset";
  const description = (formData.get("description") as string) || "";

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // MIME validation
  if (!VALID_AUDIO_MIMES.has(file.type)) {
    return NextResponse.json({ error: `Invalid audio format: ${file.type}. Use WAV, MP3, FLAC, or AAC.` }, { status: 415 });
  }

  // Size check (500MB max)
  const MAX_SIZE = 500 * 1024 * 1024;
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large. Max 500MB." }, { status: 413 });

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);
  const workspaceId = selection.current.workspace.id;

  // Estimate duration
  const estimatedDuration = estimateDurationFromSize(file.size, file.type);

  if (estimatedDuration < MIN_DURATION_SECS) {
    return NextResponse.json({
      error: `Audio too short. Minimum ${MIN_DURATION_SECS}s required. Estimated: ${Math.round(estimatedDuration)}s`,
    }, { status: 422 });
  }
  if (estimatedDuration > MAX_DURATION_SECS) {
    return NextResponse.json({ error: "Audio too long. Max 2 hours." }, { status: 422 });
  }

  const qualityScore = scoreDatasetQuality(file.size, file.type, estimatedDuration);
  const buffer = Buffer.from(await file.arrayBuffer());

  // Upload to voice-datasets bucket
  let uploadResult;
  try {
    uploadResult = await uploadFileWithHash(buffer, {
      workspaceId,
      userId:   user.id,
      filename: `${crypto.randomUUID()}-${file.name}`,
      mimeType: file.type,
      isTemp:   false,
      bucket:   "voice-datasets",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 500 });
  }

  // Insert dataset record
  const validationLog = [
    { check: "mime_type",      passed: true,                              value: file.type },
    { check: "min_duration",   passed: estimatedDuration >= MIN_DURATION_SECS, value: `${Math.round(estimatedDuration)}s` },
    { check: "quality_score",  passed: qualityScore >= 50,                value: qualityScore },
    { check: "file_size",      passed: file.size <= MAX_SIZE,             value: `${(file.size/1024/1024).toFixed(1)}MB` },
  ];

  const { data: dataset, error: dbError } = await admin
    .from("voice_datasets")
    .insert({
      workspace_id:  workspaceId,
      user_id:       user.id,
      name,
      description,
      storage_path:  uploadResult.storagePath,
      duration_secs: estimatedDuration,
      format:        file.type,
      quality_score: qualityScore,
      status:        qualityScore >= 60 ? "ready" : "processing",
      validation_log: validationLog,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ data: dataset, qualityScore, estimatedDuration, validationLog }, { status: 201 });
}

// ── GET — list datasets ───────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);
  const workspaceId = selection.current.workspace.id;

  const { data } = await admin
    .from("voice_datasets")
    .select()
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ data: data ?? [] });
}
