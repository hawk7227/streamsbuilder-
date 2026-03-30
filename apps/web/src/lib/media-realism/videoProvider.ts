/**
 * videoProvider.ts
 *
 * Real Kling I2V wiring. This file is NOT part of the spec — it is the
 * provider adapter that connects generationClient.ts's contract to the
 * real Kling API.
 *
 * The spec's generateVideoCandidatesFromProvider in generationClient.ts
 * is a stub. pipeline-execution.ts calls it directly. To use the real
 * Kling provider without modifying any spec file, import and call
 * generateRealVideoCandidate from here instead of the stub where needed.
 */

import jwt from "jsonwebtoken";
import type { VideoCandidate } from "./types";
import { getVideoMotionPolicy } from "./realismPolicy";

function klingToken(): string {
  const sk = process.env.KLING_API_KEY;
  const ak = process.env.KLING_ASSESS_API_KEY;
  if (!sk || !ak) throw new Error("KLING_API_KEY or KLING_ASSESS_API_KEY is not set");
  return jwt.sign(
    { iss: ak, exp: Math.floor(Date.now() / 1000) + 1800, nbf: Math.floor(Date.now() / 1000) - 5 },
    sk,
    { header: { alg: "HS256", typ: "JWT" } },
  );
}

/**
 * Submits one Kling I2V task and returns a VideoCandidate.
 * url is empty on return — it is populated when the Kling webhook fires
 * at /api/webhook/video-complete or the cron poller resolves it.
 */
export async function generateRealVideoCandidate(sourceImageUrl: string, attempt: number): Promise<VideoCandidate> {
  const policy = getVideoMotionPolicy();

  const allowed: string[] = [];
  if (policy.allowPushIn) allowed.push("slow gentle push-in");
  if (policy.allowParallax) allowed.push("soft background parallax");
  if (policy.allowBlink) allowed.push("natural blink");
  const motionPrompt = [
    allowed.join(", "),
    `Forbidden: ${policy.forbiddenMotion.join(", ")}.`,
    `Max ${policy.maxDurationSeconds}s. No face drift. No mouth motion. No hand motion. Preserve identity.`,
  ].join(" ");

  const body = {
    model_name: "kling-v2-1",
    image: sourceImageUrl,
    prompt: motionPrompt,
    negative_prompt: policy.forbiddenMotion.join(", "),
    duration: String(policy.maxDurationSeconds),
    mode: "standard",
    aspect_ratio: "16:9",
  };

  const res = await fetch("https://api-singapore.klingai.com/v1/videos/image2video", {
    method: "POST",
    headers: { Authorization: `Bearer ${klingToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kling I2V submit failed (${res.status}): ${text}`);
  }

  const result = await res.json() as { code: number; message?: string; data?: { task_id: string } };
  if (result.code !== 0 || !result.data?.task_id) {
    throw new Error(`Kling I2V rejected: ${result.message ?? "unknown error"}`);
  }

  return {
    id: `vid-${result.data.task_id}`,
    url: "",                  // populated by webhook/cron when Kling completes
    sourceImageUrl,
    promptUsed: motionPrompt,
    attempt,
  };
}
