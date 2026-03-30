/**
 * processor.ts — Server-side audio processing
 * Uses ffmpeg (system binary on DO, @ffmpeg/ffmpeg in browser).
 * Operations: silence trim, gain normalize, noise gate, format convert.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const execFileAsync = promisify(execFile);

// ── Check ffmpeg availability ──────────────────────────────────────────────

let ffmpegAvailable: boolean | null = null;

async function checkFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

// ── Temp file helpers ──────────────────────────────────────────────────────

async function writeTmp(buffer: Buffer, ext: string): Promise<string> {
  const p = path.join(tmpdir(), `audio_${crypto.randomUUID()}.${ext}`);
  await writeFile(p, buffer);
  return p;
}

async function cleanup(...paths: string[]): Promise<void> {
  await Promise.allSettled(paths.map(p => unlink(p)));
}

// ── Process result ─────────────────────────────────────────────────────────

export interface AudioProcessResult {
  audio:      Buffer;
  mimeType:   string;
  format:     string;
  processed:  boolean;
  operations: string[];
  fallback?:  string; // set if ffmpeg unavailable
}

// ── Silence trim ───────────────────────────────────────────────────────────

export async function trimSilence(
  buffer: Buffer,
  ext = "mp3"
): Promise<AudioProcessResult> {
  if (!await checkFfmpeg()) {
    return { audio: buffer, mimeType: `audio/${ext}`, format: ext, processed: false, operations: [], fallback: "ffmpeg not available" };
  }

  const inPath  = await writeTmp(buffer, ext);
  const outPath = path.join(tmpdir(), `trimmed_${crypto.randomUUID()}.${ext}`);

  try {
    await execFileAsync("ffmpeg", [
      "-i", inPath,
      "-af", "silenceremove=start_periods=1:start_silence=0.5:start_threshold=-50dB:stop_periods=1:stop_silence=1:stop_threshold=-50dB",
      "-y", outPath,
    ]);
    const result = await readFile(outPath);
    return { audio: result, mimeType: `audio/${ext}`, format: ext, processed: true, operations: ["silence_trim"] };
  } finally {
    await cleanup(inPath, outPath);
  }
}

// ── Gain normalisation ─────────────────────────────────────────────────────

export async function normalizeGain(
  buffer: Buffer,
  targetLufs = -16,
  ext = "mp3"
): Promise<AudioProcessResult> {
  if (!await checkFfmpeg()) {
    return { audio: buffer, mimeType: `audio/${ext}`, format: ext, processed: false, operations: [], fallback: "ffmpeg not available" };
  }

  const inPath  = await writeTmp(buffer, ext);
  const outPath = path.join(tmpdir(), `normalized_${crypto.randomUUID()}.${ext}`);

  try {
    await execFileAsync("ffmpeg", [
      "-i", inPath,
      "-af", `loudnorm=I=${targetLufs}:LRA=11:TP=-1.5`,
      "-y", outPath,
    ]);
    const result = await readFile(outPath);
    return { audio: result, mimeType: `audio/${ext}`, format: ext, processed: true, operations: ["gain_normalize"] };
  } finally {
    await cleanup(inPath, outPath);
  }
}

// ── Noise gate ─────────────────────────────────────────────────────────────

export async function applyNoiseGate(
  buffer: Buffer,
  threshold = -40,
  ext = "mp3"
): Promise<AudioProcessResult> {
  if (!await checkFfmpeg()) {
    return { audio: buffer, mimeType: `audio/${ext}`, format: ext, processed: false, operations: [], fallback: "ffmpeg not available" };
  }

  const inPath  = await writeTmp(buffer, ext);
  const outPath = path.join(tmpdir(), `gated_${crypto.randomUUID()}.${ext}`);

  try {
    await execFileAsync("ffmpeg", [
      "-i", inPath,
      "-af", `agate=threshold=${Math.pow(10, threshold/20)}:ratio=10:attack=10:release=200`,
      "-y", outPath,
    ]);
    const result = await readFile(outPath);
    return { audio: result, mimeType: `audio/${ext}`, format: ext, processed: true, operations: ["noise_gate"] };
  } finally {
    await cleanup(inPath, outPath);
  }
}

// ── Full chain: trim + gate + normalize ────────────────────────────────────

export async function processAudioFull(
  buffer: Buffer,
  ext = "mp3",
  options?: {
    trimSilence?:    boolean;
    normalizeGain?:  boolean;
    noiseGate?:      boolean;
    targetLufs?:     number;
  }
): Promise<AudioProcessResult> {
  const {
    trimSilence:   doTrim      = true,
    normalizeGain: doNormalize = true,
    noiseGate:     doGate      = false,
    targetLufs                 = -16,
  } = options ?? {};

  if (!await checkFfmpeg()) {
    return { audio: buffer, mimeType: `audio/${ext}`, format: ext, processed: false, operations: [], fallback: "ffmpeg not available on this server" };
  }

  const filters: string[] = [];
  if (doTrim)      filters.push("silenceremove=start_periods=1:start_silence=0.5:start_threshold=-50dB");
  if (doGate)      filters.push("agate=threshold=0.003:ratio=10:attack=10:release=200");
  if (doNormalize) filters.push(`loudnorm=I=${targetLufs}:LRA=11:TP=-1.5`);

  if (!filters.length) return { audio: buffer, mimeType: `audio/${ext}`, format: ext, processed: false, operations: [] };

  const inPath  = await writeTmp(buffer, ext);
  const outPath = path.join(tmpdir(), `processed_${crypto.randomUUID()}.${ext}`);

  try {
    await execFileAsync("ffmpeg", [
      "-i", inPath,
      "-af", filters.join(","),
      "-y", outPath,
    ]);
    const result = await readFile(outPath);
    const ops: string[] = [];
    if (doTrim)      ops.push("silence_trim");
    if (doGate)      ops.push("noise_gate");
    if (doNormalize) ops.push("gain_normalize");
    return { audio: result, mimeType: `audio/${ext}`, format: ext, processed: true, operations: ops };
  } catch (e) {
    console.error("[audio-processor] ffmpeg failed:", e);
    return { audio: buffer, mimeType: `audio/${ext}`, format: ext, processed: false, operations: [], fallback: String(e) };
  } finally {
    await cleanup(inPath, outPath);
  }
}

// ── Format conversion ──────────────────────────────────────────────────────

export async function convertAudio(
  buffer: Buffer,
  fromExt: string,
  toExt: "mp3" | "wav" | "ogg" | "flac"
): Promise<AudioProcessResult> {
  if (!await checkFfmpeg()) {
    return { audio: buffer, mimeType: `audio/${fromExt}`, format: fromExt, processed: false, operations: [], fallback: "ffmpeg not available" };
  }

  const inPath  = await writeTmp(buffer, fromExt);
  const outPath = path.join(tmpdir(), `converted_${crypto.randomUUID()}.${toExt}`);

  try {
    await execFileAsync("ffmpeg", ["-i", inPath, "-y", outPath]);
    const result = await readFile(outPath);
    return { audio: result, mimeType: `audio/${toExt}`, format: toExt, processed: true, operations: [`convert_${fromExt}_to_${toExt}`] };
  } finally {
    await cleanup(inPath, outPath);
  }
}
