/**
 * generationClient.ts — media-realism-video
 *
 * Submits N T2V candidates to Kling in parallel.
 * Wraps KlingProvider JWT auth without modifying the provider class.
 * Per spec: generate 4 candidates, poll/webhook resolves them.
 */

import jwt from "jsonwebtoken";
import type { ExpandedPrompt, T2VAspectRatio, T2VCandidate, T2VInput } from "./types";

// ── Auth ───────────────────────────────────────────────────────────────────

function klingToken(): string {
  const sk = process.env.KLING_API_KEY;
  const ak = process.env.KLING_ASSESS_API_KEY;
  if (!sk || !ak) throw new Error("KLING_API_KEY or KLING_ASSESS_API_KEY is not set");
  return jwt.sign(
    {
      iss: ak,
      exp: Math.floor(Date.now() / 1000) + 1800,
      nbf: Math.floor(Date.now() / 1000) - 5,
    },
    sk,
    { header: { alg: "HS256", typ: "JWT" } },
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function aspectRatioToKling(ar: T2VAspectRatio): string {
  // Kling T2V accepts: "16:9", "9:16", "1:1"
  // 4:5 has no Kling equivalent — use 9:16 (portrait)
  return ar === "4:5" ? "9:16" : ar;
}

// ── Submit one candidate ───────────────────────────────────────────────────

async function submitOneCandidate(
  token: string,
  expanded: ExpandedPrompt,
  input: T2VInput,
  attempt: number,
): Promise<T2VCandidate> {
  const body = {
    model_name: "kling-v2-6",
    prompt: expanded.finalPrompt,
    negative_prompt: expanded.negativePrompt,
    duration: input.duration,
    mode: "standard",
    aspect_ratio: aspectRatioToKling(input.aspectRatio),
  };

  const res = await fetch("https://api-singapore.klingai.com/v1/videos/text2video", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),   // 30s submit timeout
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Kling T2V submit failed (${res.status}): ${text}`);
  }

  const result = await res.json() as { code: number; message?: string; data?: { task_id: string } };

  if (result.code !== 0 || !result.data?.task_id) {
    throw new Error(`Kling T2V rejected: ${result.message ?? "unknown error"}`);
  }

  return {
    id: `t2v-${attempt}-${crypto.randomUUID().slice(0, 8)}`,
    externalId: result.data.task_id,
    attempt,
    promptUsed: expanded.finalPrompt,
    status: "pending",
  };
}

// ── submitT2VCandidates ────────────────────────────────────────────────────

/**
 * Per spec: generate N candidates in parallel (default 4).
 * Uses a single auth token for all submissions in the batch.
 * Partial success is OK — if 3/4 succeed, those 3 go to QC.
 * Throws only if ALL submissions fail.
 */
export async function submitT2VCandidates(
  expanded: ExpandedPrompt,
  input: T2VInput,
  n = 4,
): Promise<T2VCandidate[]> {
  // Generate one token for the batch — all submissions use same credentials
  const token = klingToken();

  const results = await Promise.allSettled(
    Array.from({ length: n }, (_, i) => submitOneCandidate(token, expanded, input, i + 1))
  );

  const successful = results
    .filter((r): r is PromiseFulfilledResult<T2VCandidate> => r.status === "fulfilled")
    .map(r => r.value);

  if (successful.length === 0) {
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map(r => r.reason instanceof Error ? r.reason.message : String(r.reason));
    throw new Error(`All ${n} candidate submissions failed: ${errors.join("; ")}`);
  }

  return successful;
}

// ── pollT2VCandidate ───────────────────────────────────────────────────────

/**
 * Poll a single candidate's status from Kling.
 * Returns updated candidate — caller retries until status is completed/failed.
 */
export async function pollT2VCandidate(candidate: T2VCandidate): Promise<T2VCandidate> {
  const token = klingToken();

  const res = await fetch(
    `https://api-singapore.klingai.com/v1/videos/text2video/${candidate.externalId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    },
  );

  if (!res.ok) {
    // Non-fatal — leave as processing, caller will retry
    return { ...candidate, status: "processing" };
  }

  const data = await res.json() as {
    data: {
      task_status: string;
      task_result?: { videos?: Array<{ url: string; duration?: number }> };
    };
  };

  const t = data.data;
  if (t.task_status === "failed") return { ...candidate, status: "failed" };
  if (t.task_status !== "succeed") return { ...candidate, status: "processing" };

  const video = t.task_result?.videos?.[0];
  return {
    ...candidate,
    status: "completed",
    videoUrl: video?.url,
    durationSeconds: video?.duration,
  };
}
