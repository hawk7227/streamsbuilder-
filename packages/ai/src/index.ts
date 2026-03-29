/**
 * packages/ai
 *
 * AI orchestration layer. Owns:
 * - Request classification and routing
 * - Prompt assembly (layered system prompts)
 * - Tool registry (definitions, mode allowlists, side-effect levels)
 * - Response orchestration (streaming, tool call dispatch)
 *
 * Does NOT own raw SDK clients — those live in @streams/integrations.
 */

import type { OpenAIIntegration } from "@streams/integrations";
import type { BotRequest, RunMode, ToolDefinition } from "@streams/contracts";

// ─── Request router ───────────────────────────────────────────────────────────

export type RequestClass =
  | "helper_request"
  | "code_debug_request"
  | "architecture_request"
  | "runtime_request"
  | "test_request"
  | "deploy_request"
  | "media_pipeline_request";

const DEPLOY_PATTERNS = /\b(deploy|release|ship|publish|rollout|production)\b/i;
const RUNTIME_PATTERNS = /\b(run|execute|build|compile|bundle|preview)\b/i;
const TEST_PATTERNS = /\b(test|spec|coverage|lint|typecheck|ci)\b/i;
const ARCH_PATTERNS = /\b(architect|design|structure|schema|model|contract|system)\b/i;
const DEBUG_PATTERNS = /\b(bug|error|fix|debug|crash|broken|failing|exception)\b/i;

export function classifyRequest(message: string): RequestClass {
  if (DEPLOY_PATTERNS.test(message)) return "deploy_request";
  if (RUNTIME_PATTERNS.test(message)) return "runtime_request";
  if (TEST_PATTERNS.test(message)) return "test_request";
  if (ARCH_PATTERNS.test(message)) return "architecture_request";
  if (DEBUG_PATTERNS.test(message)) return "code_debug_request";
  return "helper_request";
}

export function resolveRunMode(
  request: BotRequest,
  classification: RequestClass
): RunMode {
  if (request.mode !== "auto") return request.mode;
  switch (classification) {
    case "deploy_request": return "deploy";
    case "runtime_request": return "runtime";
    case "test_request": return "runtime";
    case "architecture_request": return "builder";
    case "code_debug_request": return "builder";
    default: return "helper";
  }
}

// ─── Prompt layers ────────────────────────────────────────────────────────────

const CORE_SYSTEM_PROMPT = `
You are Streams — a production-grade AI assistant for software engineering.
You maintain strict truthfulness about what you have and have not executed.
You never claim to have run CI, deployed, or executed code unless a tool result confirms it.
Required truth line: "My output depends on the tools and runtime access available in this workspace.
When direct execution is unavailable, I provide exact implementation-ready output and clearly mark
what still requires runtime verification."
`.trim();

const MODE_PROMPTS: Record<RunMode, string> = {
  helper: "Focus on clear, concise explanations and small, targeted code generation.",
  builder: `
You are in Production Builder mode.
Generate complete, production-ready systems: full file trees, typed contracts, worker queues,
API schemas, and deployment configs. Every output must be immediately implementable.
`.trim(),
  runtime: `
You are in Runtime mode.
Plan execution, validate artifact expectations, reason about exact build and test outcomes.
Always specify exact commands, expected outputs, and failure modes.
`.trim(),
  deploy: `
You are in Deploy mode.
Perform preflight validation, environment checks, CI gate verification, and rollout planning.
Never confirm a deployment succeeded without a confirmed health check result.
`.trim(),
};

export function buildSystemPrompt(mode: RunMode): string {
  return [CORE_SYSTEM_PROMPT, MODE_PROMPTS[mode]].join("\n\n");
}

// ─── Tool registry ────────────────────────────────────────────────────────────

const TOOL_REGISTRY = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
  TOOL_REGISTRY.set(tool.id, tool);
}

export function getToolsForMode(mode: RunMode): ToolDefinition[] {
  return Array.from(TOOL_REGISTRY.values()).filter((t) =>
    t.modeAllowlist.includes(mode)
  );
}

export function getTool(id: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.get(id);
}

// ─── Built-in tool definitions ────────────────────────────────────────────────

const allModes: RunMode[] = ["helper", "builder", "runtime", "deploy"];
const builderAndUp: RunMode[] = ["builder", "runtime", "deploy"];

registerTool({
  id: "read_file", name: "readFile",
  description: "Read a file from the project repository",
  schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  modeAllowlist: allModes,
  sideEffectLevel: "read", timeoutMs: 5_000, queueRequired: false, auditRequired: false,
});

registerTool({
  id: "write_file", name: "writeFile",
  description: "Write or update a file in the project repository",
  schema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
  modeAllowlist: builderAndUp,
  sideEffectLevel: "write", timeoutMs: 10_000, queueRequired: false, auditRequired: true,
});

registerTool({
  id: "list_files", name: "listFiles",
  description: "List files in a project directory",
  schema: { type: "object", properties: { directory: { type: "string" } }, required: ["directory"] },
  modeAllowlist: allModes,
  sideEffectLevel: "read", timeoutMs: 5_000, queueRequired: false, auditRequired: false,
});

registerTool({
  id: "grep_project", name: "grepProject",
  description: "Search for a pattern across project files",
  schema: { type: "object", properties: { pattern: { type: "string" }, directory: { type: "string" } }, required: ["pattern"] },
  modeAllowlist: allModes,
  sideEffectLevel: "read", timeoutMs: 10_000, queueRequired: false, auditRequired: false,
});

registerTool({
  id: "run_command", name: "runCommand",
  description: "Execute a sandboxed command via the worker queue",
  schema: { type: "object", properties: { command: { type: "string" }, jobType: { type: "string" } }, required: ["command", "jobType"] },
  modeAllowlist: ["runtime", "deploy"],
  sideEffectLevel: "execute", timeoutMs: 300_000, queueRequired: true, auditRequired: true,
});

registerTool({
  id: "create_preview_build", name: "createPreviewBuild",
  description: "Trigger a preview build job via the worker queue",
  schema: { type: "object", properties: { projectId: { type: "string" } }, required: ["projectId"] },
  modeAllowlist: ["runtime", "deploy"],
  sideEffectLevel: "execute", timeoutMs: 300_000, queueRequired: true, auditRequired: true,
});

registerTool({
  id: "run_tests", name: "runTests",
  description: "Run project test suite via the worker queue",
  schema: { type: "object", properties: { projectId: { type: "string" }, command: { type: "string" } }, required: ["projectId"] },
  modeAllowlist: ["runtime", "deploy"],
  sideEffectLevel: "execute", timeoutMs: 180_000, queueRequired: true, auditRequired: true,
});

registerTool({
  id: "deploy_production", name: "deployProduction",
  description: "Trigger a production deployment via the worker queue",
  schema: { type: "object", properties: { projectId: { type: "string" }, provider: { type: "string" } }, required: ["projectId", "provider"] },
  modeAllowlist: ["deploy"],
  sideEffectLevel: "deploy", timeoutMs: 300_000, queueRequired: true, auditRequired: true,
});

// ─── Response orchestrator ────────────────────────────────────────────────────

export interface OrchestratorContext {
  openai: OpenAIIntegration;
  projectContext: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
}

export function buildOrchestratorMessages(
  ctx: OrchestratorContext,
  request: BotRequest,
  mode: RunMode
): Array<{ role: string; content: string }> {
  return [
    { role: "system", content: buildSystemPrompt(mode) },
    { role: "system", content: `Project context:\n${ctx.projectContext}` },
    ...ctx.conversationHistory,
    { role: "user", content: request.userMessage },
  ];
}
