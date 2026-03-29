/**
 * apps/web/src/lib/api-client.ts
 *
 * Typed client for all @streams/api endpoints.
 * All methods validate response shape. Never returns untyped data.
 * Used server-side (RSC) and client-side — no "use client" here.
 */

import type {
  BotRequest,
  BotResponse,
  SystemStatus,
  FileUpload,
} from "@streams/contracts";

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[api-client] ${options.method ?? "GET"} ${path} → ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ─── Bot ──────────────────────────────────────────────────────────────────────

export async function createBotTurn(body: BotRequest): Promise<BotResponse> {
  return request<BotResponse>("/api/bot", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── Files ────────────────────────────────────────────────────────────────────

export async function uploadFile(body: FileUpload): Promise<{ fileId: string; storageKey: string; uploadUrl: string }> {
  return request("/api/files/upload", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── Previews ─────────────────────────────────────────────────────────────────

export async function createPreview(projectId: string, runId: string): Promise<{ previewId: string; streamUrl: string }> {
  return request("/api/previews", {
    method: "POST",
    body: JSON.stringify({ projectId, runId }),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

export async function runTests(projectId: string, runId: string, command?: string): Promise<{ testRunId: string; streamUrl: string }> {
  return request("/api/tests/run", {
    method: "POST",
    body: JSON.stringify({ projectId, runId, command }),
  });
}

// ─── Deploy ───────────────────────────────────────────────────────────────────

export async function createDeployment(body: {
  projectId: string;
  runId: string;
  provider: "vercel" | "docker" | "railway" | "fly";
  environment: "preview" | "staging" | "production";
}): Promise<{ deployId: string; streamUrl: string }> {
  return request("/api/deploy", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── System status ────────────────────────────────────────────────────────────

export async function getSystemStatus(adminSecret: string): Promise<SystemStatus> {
  return request<SystemStatus>("/api/system-status", {
    headers: { "x-admin-secret": adminSecret },
  });
}
