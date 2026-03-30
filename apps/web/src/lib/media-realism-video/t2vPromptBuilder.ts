/**
 * t2vPromptBuilder.ts
 *
 * Per spec:
 *   sanitizePrompt()          — remove cinematic/artistic/dramatic terms
 *   expandPromptWithRealism() — inject realism anchors per mode
 *
 * No niche assumptions. No business logic.
 * The prompt that enters may be anything.
 * The prompt that exits is always realism-anchored and clean.
 */

import type { ExpandedPrompt, SanitizeResult, T2VInput, T2VRealismMode } from "./types";

// ── Banned terms — sorted longest-first so multi-word phrases
//    match before their component words are stripped independently ──────────

const BANNED_TERMS: readonly string[] = [
  // Multi-word first
  "shallow depth of field",
  "cinematic quality",
  "dramatic lighting",
  "dramatic shadows",
  "4k ultra hd",
  "ultra high definition",
  "ultra hd",
  "hyper-detailed",
  "hyper detailed",
  "film grain",
  "film look",
  "movie still",
  "movie quality",
  "movie-like",
  "fashion photography",
  "studio lighting",
  "studio light",
  "studio quality",
  "professional photography",
  "professional lighting",
  "depth of field",
  "award-winning",
  "award winning",
  "luxury aesthetic",
  "premium look",
  "premium quality",
  "glossy finish",
  "soft focus",
  "color graded",
  "color grade",
  "lut applied",
  "slow motion",
  "vivid colors",
  "vibrant colors",
  "concept art",
  "art style",
  "3d render",
  // Single-word after multi-word
  "cinematic",
  "cinema",
  "dramatic",
  "filmic",
  "editorial",
  "vogue",
  "bokeh",
  "masterpiece",
  "hyperrealistic",
  "cgi",
  "rendered",
  "render",
  "artistic",
  "luxury",
  "glossy",
  "polished",
  "dreamy",
  "ethereal",
  "surreal",
  "slo-mo",
  "epic",
  "stunning",
  "breathtaking",
  "mesmerizing",
  "saturated",
  "beautiful",
  "gorgeous",
  "perfect",
  "flawless",
  "8k",
  // "cg" kept last — short term, verify no false positives
  "cg",
];

// ── Realism anchors per mode ───────────────────────────────────────────────

const REALISM_ANCHORS: Record<T2VRealismMode, readonly string[]> = {
  human_lifestyle: [
    "ordinary real-world setting",
    "natural ambient lighting",
    "natural motion",
    "no stylization",
    "candid unposed",
    "believable everyday scene",
  ],
  product_in_use: [
    "ordinary real-world setting",
    "natural ambient lighting",
    "product in natural hands",
    "no stylization",
    "believable use context",
  ],
  environment_only: [
    "real location",
    "ordinary natural lighting",
    "no stylization",
    "believable real-world place",
    "natural ambient light",
  ],
  workspace: [
    "real office or workspace",
    "ordinary fluorescent or window light",
    "no stylization",
    "natural motion",
    "believable work setting",
  ],
};

// ── Negative prompt sent on every Kling request ────────────────────────────

export const UNIVERSAL_NEGATIVE =
  "cinematic, dramatic lighting, studio lighting, film look, color grade, " +
  "hyperrealistic render, CGI, concept art, luxury aesthetic, premium aesthetic, " +
  "bokeh, shallow depth of field, perfect symmetry, polished, glossy, " +
  "AI-generated look, stylized, slow motion, slo-mo, title cards, text overlays, " +
  "watermarks, subtitles, captions, UI elements, interface elements, " +
  "surreal, ethereal, dreamy, editorial, fashion photography";

// ── sanitizePrompt ─────────────────────────────────────────────────────────

export function sanitizePrompt(rawPrompt: string): SanitizeResult {
  if (!rawPrompt || !rawPrompt.trim()) {
    return { originalPrompt: rawPrompt, sanitizedPrompt: "", strippedTerms: [], warnings: ["Empty prompt"] };
  }

  const strippedTerms: string[] = [];
  const warnings: string[] = [];
  let result = rawPrompt;

  for (const term of BANNED_TERMS) {
    // Escape special regex chars in the term, then replace spaces with \s+
    // so "dramatic lighting" matches "dramatic  lighting" too
    const escapedTerm = term
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // escape regex special chars
      .replace(/\s+/g, "\\s+");               // flexible whitespace
    const regex = new RegExp(`(?:^|\\b|\\s)${escapedTerm}(?:\\b|\\s|$)`, "gi");
    if (regex.test(result)) {
      strippedTerms.push(term);
      // Use a fresh regex for replace (avoid lastIndex state from test())
      const replaceRegex = new RegExp(`(?:^|\\b|\\s)${escapedTerm}(?:\\b|\\s|$)`, "gi");
      result = result.replace(replaceRegex, " ").trim();
    }
  }

  // Normalise residual punctuation/whitespace after removals
  result = result
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .trim();

  if (result.length < 10) {
    // Prompt was entirely cinematic keywords — keep a minimal fallback
    warnings.push("Prompt was heavily stripped — content was almost entirely cinematic/stylized terms");
    result = "a real scene with natural lighting";
  }

  if (strippedTerms.length > 3) {
    warnings.push(`Stripped ${strippedTerms.length} cinematic/stylized terms`);
  }

  return { originalPrompt: rawPrompt, sanitizedPrompt: result, strippedTerms, warnings };
}

// ── expandPromptWithRealism ────────────────────────────────────────────────

export function expandPromptWithRealism(
  sanitized: SanitizeResult,
  mode: T2VRealismMode,
): ExpandedPrompt {
  const anchors = REALISM_ANCHORS[mode];

  const parts = [
    sanitized.sanitizedPrompt,
    anchors.join(", "),
    "If the output looks cinematic, polished, or stylized — it is wrong.",
    "If the output looks ordinary, natural, and real — it is correct.",
  ].filter(s => s.trim().length > 0);

  const finalPrompt = parts.join(". ");

  return {
    sanitized,
    finalPrompt,
    negativePrompt: UNIVERSAL_NEGATIVE,
    injectedAnchors: [...anchors],
  };
}

// ── buildT2VPrompt — single entry point ───────────────────────────────────

export function buildT2VPrompt(input: T2VInput): ExpandedPrompt {
  const sanitized = sanitizePrompt(input.prompt);
  return expandPromptWithRealism(sanitized, input.realismMode);
}
