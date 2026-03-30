/**
 * t2vPostProcess.ts
 *
 * Per spec: re-encode via ffmpeg, inject noise, normalize compression.
 * When ffmpeg is unavailable (serverless), skips gracefully and returns
 * the input URL unchanged with skip reason.
 *
 * When ffmpeg is available:
 *   1. Download video to tmp
 *   2. Re-encode H.264 with crf=23 (compression normalization)
 *   3. Inject subtle film grain (alls=3 — very light, reduces AI sheen)
 *   4. Upload processed video to Supabase Storage
 *   5. Return permanent Supabase URL
 */

import { execFile } from "child_process";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { promisify } from "util";
import path from "path";
import os from "os";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PostProcessResult } from "./types";

const execFileAsync = promisify(execFile);

async function ffmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function downloadToTmp(url: string, tmpPath: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Video download failed: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(tmpPath, buf);
}

async function uploadProcessedVideo(tmpPath: string, workspaceId: string): Promise<string> {
  const buf = readFileSync(tmpPath);
  const admin = createAdminClient();
  const storagePath = `${workspaceId}/t2v_pp_${crypto.randomUUID()}.mp4`;
  const { error } = await admin.storage
    .from("generations")
    .upload(storagePath, buf, { contentType: "video/mp4", upsert: false });
  if (error) throw new Error(`Post-process upload failed: ${error.message}`);
  const { data } = admin.storage.from("generations").getPublicUrl(storagePath);
  return data.publicUrl;
}

function safeTmpCleanup(...paths: string[]): void {
  for (const p of paths) {
    try { unlinkSync(p); } catch { /* ignore — tmp cleanup is best-effort */ }
  }
}

export async function postProcessT2V(
  inputUrl: string,
  workspaceId: string,
): Promise<PostProcessResult> {
  if (!(await ffmpegAvailable())) {
    return {
      inputUrl,
      outputUrl: inputUrl,
      processesApplied: [],
      skipped: true,
      skipReason: "ffmpeg not available in this environment",
    };
  }

  const tmpDir = os.tmpdir();
  const runId = crypto.randomUUID().slice(0, 8);
  const inputFile  = path.join(tmpDir, `t2v_in_${runId}.mp4`);
  const outputFile = path.join(tmpDir, `t2v_out_${runId}.mp4`);
  const processesApplied: string[] = [];

  try {
    await downloadToTmp(inputUrl, inputFile);

    // Re-encode H.264 + inject subtle grain noise + normalize compression
    await execFileAsync("ffmpeg", [
      "-i", inputFile,
      "-vf", "noise=alls=3:allf=t+u",   // alls=3: very light grain
      "-c:v", "libx264",
      "-crf", "23",                        // quality-based normalization
      "-preset", "medium",
      "-c:a", "copy",
      "-y",
      outputFile,
    ], { timeout: 120000 });

    processesApplied.push("reencode_h264", "grain_noise_injection", "compression_normalize");

    const outputUrl = await uploadProcessedVideo(outputFile, workspaceId);

    safeTmpCleanup(inputFile, outputFile);

    return { inputUrl, outputUrl, processesApplied, skipped: false };
  } catch (err) {
    safeTmpCleanup(inputFile, outputFile);
    return {
      inputUrl,
      outputUrl: inputUrl,   // fall back to unprocessed URL
      processesApplied,
      skipped: true,
      skipReason: `Post-processing failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
