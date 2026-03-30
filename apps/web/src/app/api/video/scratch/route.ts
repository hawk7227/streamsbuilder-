/**
 * POST /api/video/scratch
 *
 * T2V scratch video production endpoint.
 * Per spec flow:
 *   sanitize → expand → submit 4 candidates → poll until complete →
 *   QC score → reject failures → select best → upload to Supabase →
 *   post-process → update DB row → return result.
 *
 * Rejection loop: up to MAX_ROUNDS (3) full rounds before hard block.
 * DB row created immediately on request so client can track progress.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";
import { buildT2VPrompt } from "@/lib/media-realism-video/t2vPromptBuilder";
import { submitT2VCandidates, pollT2VCandidate } from "@/lib/media-realism-video/generationClient";
import { scoreT2VCandidate, shouldRejectT2VCandidate } from "@/lib/media-realism-video/t2vQc";
import { selectBestT2VCandidate } from "@/lib/media-realism-video/t2vSelector";
import { postProcessT2V } from "@/lib/media-realism-video/t2vPostProcess";
import type {
  T2VInput,
  T2VAspectRatio,
  T2VQuality,
  T2VRealismMode,
  T2VCandidate,
  T2VQcScore,
  T2VResult,
} from "@/lib/media-realism-video/types";

export const maxDuration = 300; // 5 min — T2V generation + polling

const MAX_ROUNDS       = 3;
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS  = 240_000; // 4 min per round

// ── Allowed values for input validation ───────────────────────────────────

const VALID_ASPECT_RATIOS  = new Set<T2VAspectRatio>(["16:9", "9:16", "1:1", "4:5"]);
const VALID_DURATIONS      = new Set<T2VInput["duration"]>(["5", "10"]);
const VALID_QUALITIES      = new Set<T2VQuality>(["720p", "1080p", "4k"]);
const VALID_REALISM_MODES  = new Set<T2VRealismMode>(["human_lifestyle", "product_in_use", "environment_only", "workspace"]);

type ScoredCandidate = { candidate: T2VCandidate; score: T2VQcScore };

// ── Auth / workspace ───────────────────────────────────────────────────────

async function resolveWorkspace() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);
  return { user, workspace: selection.current.workspace, admin };
}

// ── Poll candidates until all complete or timeout ──────────────────────────

async function pollUntilComplete(candidates: T2VCandidate[]): Promise<T2VCandidate[]> {
  const map = new Map<string, T2VCandidate>(candidates.map(c => [c.id, c]));
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const pending = [...map.values()].filter(
      c => c.status === "pending" || c.status === "processing"
    );
    if (pending.length === 0) break;

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    await Promise.allSettled(
      pending.map(async c => {
        const updated = await pollT2VCandidate(c);
        map.set(c.id, updated);
      })
    );
  }

  return [...map.values()];
}

// ── Upload Kling CDN video → Supabase Storage ──────────────────────────────

async function uploadToStorage(cdnUrl: string, workspaceId: string): Promise<string> {
  const res = await fetch(cdnUrl, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`CDN download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const admin = createAdminClient();
  const storagePath = `${workspaceId}/t2v_${crypto.randomUUID()}.mp4`;
  const { error } = await admin.storage
    .from("generations")
    .upload(storagePath, buffer, { contentType: "video/mp4", upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return admin.storage.from("generations").getPublicUrl(storagePath).data.publicUrl;
}

// ── One rejection-loop round ───────────────────────────────────────────────

async function runRound(input: T2VInput, round: number): Promise<{
  allScored: ScoredCandidate[];
  accepted: boolean;
  bestCdnUrl?: string;
  bestScore?: T2VQcScore;
}> {
  const expanded = buildT2VPrompt(input);
  console.info(
    `[T2V] round=${round} stripped=${expanded.sanitized.strippedTerms.length} ` +
    `terms=[${expanded.sanitized.strippedTerms.slice(0, 5).join(", ")}]`
  );

  const candidates = await submitT2VCandidates(expanded, input, 4);
  const resolved   = await pollUntilComplete(candidates);
  const completed  = resolved.filter(c => c.status === "completed" && c.videoUrl);

  if (completed.length === 0) {
    console.warn(`[T2V] round=${round} all candidates timed out or failed`);
    return { allScored: [], accepted: false };
  }

  const scored: ScoredCandidate[] = completed.map(c => ({
    candidate: c,
    score: scoreT2VCandidate(c.videoUrl!),
  }));

  const selection = selectBestT2VCandidate(scored);

  if (!selection.accepted || !selection.acceptedCandidate?.videoUrl) {
    console.warn(`[T2V] round=${round} QC block: ${selection.blockReason}`);
    return { allScored: scored, accepted: false };
  }

  return {
    allScored: scored,
    accepted:     true,
    bestCdnUrl:   selection.acceptedCandidate.videoUrl,
    bestScore:    selection.acceptedScore,
  };
}

// ── POST ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth
  const ctx = await resolveWorkspace();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace, admin } = ctx;

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate required fields
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

  // Validate optional fields against allowed values
  const aspectRatio = (body.aspectRatio ?? "16:9") as T2VAspectRatio;
  if (!VALID_ASPECT_RATIOS.has(aspectRatio)) {
    return NextResponse.json({ error: `aspectRatio must be one of: ${[...VALID_ASPECT_RATIOS].join(", ")}` }, { status: 400 });
  }

  const duration = (body.duration ?? "5") as T2VInput["duration"];
  if (!VALID_DURATIONS.has(duration)) {
    return NextResponse.json({ error: `duration must be "5" or "10"` }, { status: 400 });
  }

  const quality = (body.quality ?? "1080p") as T2VQuality;
  if (!VALID_QUALITIES.has(quality)) {
    return NextResponse.json({ error: `quality must be one of: ${[...VALID_QUALITIES].join(", ")}` }, { status: 400 });
  }

  const realismMode = (body.realismMode ?? "human_lifestyle") as T2VRealismMode;
  if (!VALID_REALISM_MODES.has(realismMode)) {
    return NextResponse.json({ error: `realismMode must be one of: ${[...VALID_REALISM_MODES].join(", ")}` }, { status: 400 });
  }

  const input: T2VInput = { prompt, aspectRatio, duration, quality, realismMode, workspaceId: workspace.id };

  // Create DB row immediately — client can track via generations table
  const { data: genRow, error: genErr } = await admin
    .from("generations")
    .insert({
      workspace_id: workspace.id,
      type:         "video",
      prompt:       input.prompt,
      title:        input.prompt.slice(0, 60),
      status:       "processing",
      aspect_ratio: input.aspectRatio,
      duration:     `${input.duration}s`,
      quality:      input.quality,
      style:        `t2v-realism-${input.realismMode}`,
    })
    .select("id")
    .single();

  if (genErr || !genRow) {
    return NextResponse.json({ error: "Failed to create generation record" }, { status: 500 });
  }

  input.generationId = genRow.id as string;

  // ── Rejection loop ────────────────────────────────────────────────────────
  const allRounds: ScoredCandidate[][] = [];
  let acceptedCdnUrl: string | undefined;
  let acceptedScore:  T2VQcScore | undefined;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    try {
      const result = await runRound(input, round);
      allRounds.push(result.allScored);

      if (result.accepted && result.bestCdnUrl) {
        acceptedCdnUrl = result.bestCdnUrl;
        acceptedScore  = result.bestScore;
        break;
      }
    } catch (err) {
      console.error(`[T2V] round=${round} error: ${err instanceof Error ? err.message : err}`);
      allRounds.push([]);
    }
  }

  // Hard block after MAX_ROUNDS
  if (!acceptedCdnUrl) {
    await admin.from("generations").update({ status: "failed" }).eq("id", genRow.id);
    return NextResponse.json(
      { error: `All ${MAX_ROUNDS} rounds failed realism QC`, generationId: genRow.id },
      { status: 422 },
    );
  }

  // ── Upload CDN → Supabase ─────────────────────────────────────────────────
  let storedUrl: string;
  try {
    storedUrl = await uploadToStorage(acceptedCdnUrl, workspace.id);
  } catch {
    // CDN URL is still valid — fall back rather than failing the request
    storedUrl = acceptedCdnUrl;
  }

  // ── Post-process ──────────────────────────────────────────────────────────
  const postProcess = await postProcessT2V(storedUrl, workspace.id);
  const outputUrl   = postProcess.skipped ? storedUrl : postProcess.outputUrl;

  // ── Finalise DB row ───────────────────────────────────────────────────────
  await admin
    .from("generations")
    .update({ status: "completed", output_url: outputUrl })
    .eq("id", genRow.id);

  // ── Build result ──────────────────────────────────────────────────────────
  const allCandidates = allRounds.flat();
  const rejected      = allCandidates.filter(s => shouldRejectT2VCandidate(s.score));

  const result: T2VResult = {
    accepted:       true,
    videoUrl:       outputUrl,
    qcScore:        acceptedScore,
    expandedPrompt: buildT2VPrompt(input), // audit trail of final prompt
    selectionResult: {
      accepted:           true,
      rejectedCandidates: rejected,
      attempts:           allCandidates.length,
    },
    postProcess,
    totalAttempts: allCandidates.length,
    generationId:  genRow.id as string,
  };

  return NextResponse.json({ ok: true, result });
}
