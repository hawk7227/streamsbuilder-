/**
 * security.ts — Security utilities
 * SSRF protection, MIME magic bytes validation, rate limiting, abuse prevention.
 */

import { logAction } from "@/lib/governance/ledger";

// ── SSRF protection ────────────────────────────────────────────────────────

const PRIVATE_IP_RANGES = [
  /^127\./,                            // loopback
  /^10\./,                             // RFC 1918
  /^192\.168\./,                       // RFC 1918
  /^172\.(1[6-9]|2\d|3[01])\./,       // RFC 1918
  /^169\.254\./,                       // link-local
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // CGNAT
  /^0\./,                              // current network
  /^::1$/,                             // IPv6 loopback
  /^fc[0-9a-f]{2}:/i,                 // IPv6 ULA
  /^fe[89ab][0-9a-f]:/i,             // IPv6 link-local
  /^localhost$/i,
  /^metadata\.google\.internal$/i,    // GCP metadata
];

const BLOCKED_HOSTNAMES = new Set([
  "metadata.google.internal",
  "169.254.169.254",   // AWS/GCP/Azure metadata
  "100.100.100.200",   // Alibaba metadata
]);

export function isSsrfBlocked(urlOrHostname: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(urlOrHostname).hostname;
  } catch {
    hostname = urlOrHostname;
  }
  if (BLOCKED_HOSTNAMES.has(hostname)) return true;
  return PRIVATE_IP_RANGES.some(r => r.test(hostname));
}

export async function safeFetch(
  url: string,
  options?: RequestInit & { timeoutMs?: number; userId?: string }
): Promise<Response> {
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { throw new Error(`Invalid URL: ${url}`); }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Protocol not allowed: ${parsed.protocol}`);
  }

  if (isSsrfBlocked(url)) {
    if (options?.userId) {
      await logAction({ action: "ssrf_blocked", userId: options.userId, payload: { url }, severity: "warn" });
    }
    throw new Error("URL not allowed: blocked network range");
  }

  const { timeoutMs = 15000, userId: _userId, ...fetchOptions } = options ?? {};
  return fetch(url, { ...fetchOptions, signal: AbortSignal.timeout(timeoutMs) });
}

// ── MIME magic bytes validation ────────────────────────────────────────────

const MAGIC_BYTES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: "image/png",     bytes: [0x89, 0x50, 0x4E, 0x47] },
  { mime: "image/jpeg",    bytes: [0xFF, 0xD8, 0xFF] },
  { mime: "image/gif",     bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/webp",    bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },  // RIFF....WEBP
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },          // %PDF
  { mime: "application/zip", bytes: [0x50, 0x4B, 0x03, 0x04] },          // PK
  { mime: "audio/mpeg",    bytes: [0xFF, 0xFB] },
  { mime: "audio/wav",     bytes: [0x52, 0x49, 0x46, 0x46] },            // RIFF
  { mime: "video/mp4",     bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }, // ftyp at offset 4
];

export function validateMagicBytes(
  buffer: Buffer,
  declaredMime: string
): { valid: boolean; detected?: string; reason?: string } {
  // Text files — no reliable magic bytes, skip
  if (declaredMime.startsWith("text/") || declaredMime === "application/json") {
    return { valid: true };
  }

  for (const sig of MAGIC_BYTES) {
    const offset = sig.offset ?? 0;
    const match  = sig.bytes.every((b, i) => buffer[offset + i] === b);
    if (match) {
      // Found a match — check if it agrees with declared mime
      if (sig.mime === declaredMime ||
          (sig.mime === "application/zip" && declaredMime.includes("openxmlformats")) ||
          (sig.mime === "audio/wav" && declaredMime.includes("wav"))) {
        return { valid: true, detected: sig.mime };
      }
      return { valid: false, detected: sig.mime, reason: `Declared ${declaredMime} but file appears to be ${sig.mime}` };
    }
  }

  // No magic bytes matched — allow if mime is declared (trust content-type for unknowns)
  return { valid: true };
}

// ── Rate limiting (Postgres-backed via ledger) ─────────────────────────────

export interface RateLimitConfig {
  maxPerHour:   number;
  maxPerMinute?: number;
}

const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  image_generated: { maxPerHour: 100, maxPerMinute: 10 },
  video_generated: { maxPerHour: 20,  maxPerMinute: 3 },
  tts_generated:   { maxPerHour: 200, maxPerMinute: 20 },
  stt_transcribed: { maxPerHour: 100, maxPerMinute: 10 },
  song_generated:  { maxPerHour: 10,  maxPerMinute: 2 },
  url_intake:      { maxPerHour: 50,  maxPerMinute: 5 },
  file_uploaded:   { maxPerHour: 100, maxPerMinute: 10 },
};

export function getRateLimitConfig(action: string): RateLimitConfig {
  return DEFAULT_LIMITS[action] ?? { maxPerHour: 200, maxPerMinute: 20 };
}

// ── URL safety check (phishing/malware domains) ────────────────────────────

const BLOCKED_DOMAINS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", // url shorteners — must resolve first
]);

export function isUrlSafe(url: string): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(url);
    if (isSsrfBlocked(url)) return { safe: false, reason: "Private network range" };
    if (BLOCKED_DOMAINS.has(parsed.hostname)) return { safe: false, reason: "URL shortener — resolve first" };
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { safe: false, reason: "Invalid protocol" };
    return { safe: true };
  } catch {
    return { safe: false, reason: "Invalid URL" };
  }
}

// ── Request abuse signals ──────────────────────────────────────────────────

export function detectAbuseSignals(request: Request): {
  suspicious: boolean;
  signals: string[];
} {
  const signals: string[] = [];
  const ua = request.headers.get("user-agent") ?? "";

  if (!ua) signals.push("missing_user_agent");
  if (/bot|crawler|spider|scraper/i.test(ua)) signals.push("bot_user_agent");

  const contentType = request.headers.get("content-type") ?? "";
  if (request.method === "POST" && !contentType) signals.push("missing_content_type");

  return { suspicious: signals.length > 0, signals };
}
