/**
 * context.ts — Chat Context Engine
 * Injects file chunks, URL content, and session memory into assistant context.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { buildFileContext } from "@/lib/files/retrieval";

// ── Session memory ─────────────────────────────────────────────────────────

export interface ContextMemory {
  fileContext:   string;
  urlContext:    string;
  projectMemory: string;
}

// ── Get recent URL intakes for workspace ───────────────────────────────────

async function getRecentUrlContext(workspaceId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("ledger_logs")
    .select("payload, created_at")
    .eq("workspace_id", workspaceId)
    .eq("action", "url_intake")
    .order("created_at", { ascending: false })
    .limit(5);

  if (!data?.length) return "";

  const entries = data.map(row => {
    const p = row.payload as Record<string, unknown>;
    return `URL: ${p.url}\nTitle: ${p.title ?? ""}\nSummary: ${String(p.summary ?? "").slice(0, 300)}`;
  });

  return `### Recent URL intakes:\n\n${entries.join("\n\n---\n\n")}`;
}

// ── Get project memory ─────────────────────────────────────────────────────

async function getProjectMemory(workspaceId: string): Promise<string> {
  const admin = createAdminClient();

  // Pull recent pipeline runs and decisions from assistant_memory
  const { data } = await admin
    .from("assistant_memory")
    .select("memory_type, key, value, updated_at")
    .order("updated_at", { ascending: false })
    .limit(15);

  if (!data?.length) return "";

  const entries = data
    .filter(m => ["pipeline_run","decision","image_url"].includes(m.memory_type))
    .map(m => `[${m.memory_type}] ${m.key}: ${JSON.stringify(m.value).slice(0, 200)}`);

  return entries.length ? `### Project memory:\n\n${entries.join("\n")}` : "";
}

// ── Build full context ─────────────────────────────────────────────────────

export async function buildChatContext(
  query: string,
  workspaceId: string,
  options?: {
    includeFiles?: boolean;
    includeUrls?:  boolean;
    includeMemory?: boolean;
    maxChars?:     number;
  }
): Promise<ContextMemory> {
  const {
    includeFiles  = true,
    includeUrls   = true,
    includeMemory = true,
    maxChars      = 12000,
  } = options ?? {};

  const [fileContext, urlContext, projectMemory] = await Promise.all([
    includeFiles  ? buildFileContext(workspaceId, query, 6) : Promise.resolve(""),
    includeUrls   ? getRecentUrlContext(workspaceId) : Promise.resolve(""),
    includeMemory ? getProjectMemory(workspaceId)    : Promise.resolve(""),
  ]);

  return { fileContext, urlContext, projectMemory };
}

// ── Format context for injection into system prompt ────────────────────────

export function formatContextForPrompt(ctx: ContextMemory): string {
  const parts: string[] = [];
  if (ctx.fileContext)   parts.push(ctx.fileContext);
  if (ctx.urlContext)    parts.push(ctx.urlContext);
  if (ctx.projectMemory) parts.push(ctx.projectMemory);
  return parts.join("\n\n---\n\n");
}

// ── Log URL intake to ledger ───────────────────────────────────────────────

export async function logUrlIntake(
  workspaceId: string,
  userId: string,
  data: { url: string; title?: string; summary?: string; type?: string }
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("ledger_logs").insert({
    workspace_id: workspaceId,
    user_id:      userId,
    action:       "url_intake",
    entity_type:  "url",
    entity_id:    data.url,
    payload:      data,
    severity:     "info",
  });
}
