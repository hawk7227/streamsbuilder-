import type { AssistantMode } from "./types";

// Phrases that trigger a direct pipeline action (no LLM needed for these)
const ACTION_TERMS = [
  "run pipeline",
  "run step",
  "open step config",
  "select concept",
  "approve output",
  "set niche",
  "generate image for",
  "generate video for",
  "apply this prompt",
  "trigger generation",
  "save to brain",
  "save this to brain",
  "remember this",
];

// Phrases that mean: "I want real evidence, not inference"
// Deliberately tight — "is the" alone is too broad for a mode switch
const VERIFICATION_TERMS = [
  "verify",
  "proof",
  "prove",
  "confirm",
  "audit",
  "working correctly",
  "real proof",
  "health check",
  "status check",
  "what\'s broken",
  "what is broken",
  "check routes",
  "are routes working",
  "is file upload working",
  "is voice working",
  "is the pipeline working",
  "is generation working",
  "is the assistant working",
  "check all routes",
  "verify all",
  "run a check",
  "run checks",
  "run verification",
  "check the system",
];

// Phrases that should run live HTTP probes — bypass the LLM entirely
export const PROBE_TERMS = [
  "check if",
  "check all",
  "verify all",
  "run checks",
  "run a check",
  "run verification",
  "health check",
  "status check",
  "is file upload working",
  "is voice working",
  "is the pipeline working",
  "is generation working",
  "is the assistant working",
  "check the system",
  "check routes",
  "are routes working",
  "what\'s broken",
  "what is broken",
];

const EXECUTION_TERMS = ["return json", "give me schema", "generate a json schema", "schema for", "return valid json"];
const BUILDER_TERMS = ["build", "implement", "fix", "write code", "refactor", "route", "production", "system architecture"];

export function detectModeFromText(text: string): AssistantMode {
  const lower = text.toLowerCase();
  if (ACTION_TERMS.some((term) => lower.includes(term))) return "action";
  if (VERIFICATION_TERMS.some((term) => lower.includes(term))) return "verification";
  if (EXECUTION_TERMS.some((term) => lower.includes(term))) return "execution";
  if (BUILDER_TERMS.some((term) => lower.includes(term))) return "builder";
  return "conversation";
}

// Returns true if the prompt should trigger live HTTP probes directly —
// no LLM call needed, just run the probes and format results.
export function shouldRunProbes(text: string): boolean {
  const lower = text.toLowerCase();
  return PROBE_TERMS.some((term) => lower.includes(term));
}

// Maps probe intent to a feature set key for /api/verify
export function extractFeatureTarget(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("assistant") || lower.includes("chat") || lower.includes("conversation")) return "assistant";
  if (lower.includes("file") || lower.includes("upload")) return "files";
  if (lower.includes("voice") || lower.includes("tts") || lower.includes("stt")) return "voice";
  if (lower.includes("pipeline") || lower.includes("run-node") || lower.includes("session")) return "pipeline";
  if (lower.includes("generat") || lower.includes("image") || lower.includes("video")) return "generation";
  if (lower.includes("intake") || lower.includes("url") || lower.includes("youtube")) return "intake";
  if (lower.includes("operator") || lower.includes("monitor") || lower.includes("metric")) return "operator";
  if (lower.includes("job") || lower.includes("queue")) return "jobs";
  if (lower.includes("song") || lower.includes("audio") || lower.includes("music")) return "song";
  return "all";
}
