/**
 * runway.ts — Runway Gen4 provider
 *
 * Supports:
 *   video (T2V) — Gen4 Turbo via /v1/tasks (async, poll via cron/webhook)
 *   i2v         — Gen4 I2V via /v1/tasks (async)
 *
 * API reference: https://docs.dev.runwayml.com
 * Version header: X-Runway-Version: 2024-11-06
 */

import { AIProvider, GenerationOptions, GenerationResult, GenerationType } from "../types";
import { getSiteConfig } from "../../config";

const RUNWAY_BASE = "https://api.runwayml.com";
const RUNWAY_VERSION = "2024-11-06";

function getApiKey(): string {
  const config = getSiteConfig();
  const key = config.apiKeys?.RUNWAY_API_KEY ?? process.env.RUNWAY_API_KEY;
  if (!key) throw new Error("RUNWAY_API_KEY is not set");
  return key;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-Runway-Version": RUNWAY_VERSION,
  };
}

// Runway ratio format: "1280:720" | "720:1280" | "1104:832" | "832:1104" | "960:960"
function toRunwayRatio(aspectRatio?: string): string {
  switch (aspectRatio) {
    case "9:16":  return "720:1280";
    case "1:1":   return "960:960";
    case "4:5":   return "832:1040";
    default:      return "1280:720";   // 16:9
  }
}

export class RunwayProvider implements AIProvider {
  async generate(type: GenerationType, options: GenerationOptions): Promise<GenerationResult> {
    if (type === "video") return this.generateVideo(options);
    if (type === "i2v")   return this.generateI2V(options);
    throw new Error(`RunwayProvider does not support type: ${type}`);
  }

  // ── Text-to-Video ──────────────────────────────────────────────────────
  private async generateVideo(options: GenerationOptions): Promise<GenerationResult> {
    const apiKey = getApiKey();
    const ratio  = toRunwayRatio(options.aspectRatio);

    const rawDuration = parseInt((options.duration ?? "5").replace("s", ""), 10);
    // Runway Gen4 Turbo supports 5 or 10 seconds
    const duration = rawDuration >= 10 ? 10 : 5;

    const body: Record<string, unknown> = {
      model: "gen4_turbo",
      promptText: options.prompt ?? "",
      ratio,
      duration,
    };
    if (options.callBackUrl) body.callbackUrl = options.callBackUrl;

    const res = await fetch(`${RUNWAY_BASE}/v1/tasks`, {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Runway T2V failed (${res.status}): ${text}`);
    }

    const result = await res.json() as { id?: string };
    if (!result.id) throw new Error("Runway T2V: no task id in response");

    return { status: "pending", externalId: result.id };
  }

  // ── Image-to-Video ─────────────────────────────────────────────────────
  private async generateI2V(options: GenerationOptions): Promise<GenerationResult> {
    if (!options.imageUrl) throw new Error("imageUrl is required for Runway I2V");

    const apiKey = getApiKey();
    const ratio  = toRunwayRatio(options.aspectRatio);

    const rawDuration = parseInt((options.duration ?? "5").replace("s", ""), 10);
    const duration = rawDuration >= 10 ? 10 : 5;

    const body: Record<string, unknown> = {
      model: "gen4_turbo",
      promptImage: options.imageUrl,
      promptText: options.prompt ?? "Subtle natural motion. Preserve identity. No face drift.",
      ratio,
      duration,
    };
    if (options.callBackUrl) body.callbackUrl = options.callBackUrl;

    const res = await fetch(`${RUNWAY_BASE}/v1/tasks`, {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Runway I2V failed (${res.status}): ${text}`);
    }

    const result = await res.json() as { id?: string };
    if (!result.id) throw new Error("Runway I2V: no task id in response");

    return { status: "pending", externalId: result.id };
  }
}
