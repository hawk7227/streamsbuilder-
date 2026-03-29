/**
 * packages/ui
 *
 * Design token source of truth. Every spacing, radius, shadow, and motion
 * value used across apps/web is derived from here — never hardcoded at use site.
 *
 * Locked scales — no arbitrary values, no overrides, no exceptions.
 */

// ─── Spacing — 4px base grid ──────────────────────────────────────────────────

export const spacing = {
  1:  "4px",
  2:  "8px",
  3:  "12px",
  4:  "16px",
  5:  "20px",
  6:  "24px",
  8:  "32px",
  10: "40px",
  12: "48px",
  16: "64px",
  20: "80px",
  24: "96px",
} as const;

export type SpacingKey = keyof typeof spacing;

// ─── Border radius ────────────────────────────────────────────────────────────

export const radius = {
  sm:   "8px",
  md:   "12px",
  lg:   "16px",
  xl:   "20px",
  "2xl":"24px",
  full: "999px",
} as const;

export type RadiusKey = keyof typeof radius;

// ─── Shadows ──────────────────────────────────────────────────────────────────

export const shadow = {
  sm: "0 4px 14px rgba(0,0,0,0.06)",
  md: "0 10px 30px rgba(0,0,0,0.08)",
  lg: "0 18px 60px rgba(0,0,0,0.10)",
} as const;

export type ShadowKey = keyof typeof shadow;

// ─── Motion — transform + opacity only, 150–220ms ────────────────────────────

export const motion = {
  fast:   "150ms",
  base:   "180ms",
  slow:   "220ms",
  easing: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

export const transitions = {
  default: `transform ${motion.base} ${motion.easing}, opacity ${motion.base} ${motion.easing}`,
  fast:    `transform ${motion.fast} ${motion.easing}, opacity ${motion.fast} ${motion.easing}`,
  slow:    `transform ${motion.slow} ${motion.easing}, opacity ${motion.slow} ${motion.easing}`,
} as const;

// ─── Typography scale ─────────────────────────────────────────────────────────

export const fontSize = {
  xs:   "11px",
  sm:   "13px",
  base: "15px",
  md:   "17px",
  lg:   "20px",
  xl:   "24px",
  "2xl":"30px",
  "3xl":"36px",
} as const;

export const fontWeight = {
  regular: "400",
  medium:  "500",
  semibold:"600",
} as const;

export const lineHeight = {
  tight:  "1.25",
  base:   "1.5",
  relaxed:"1.7",
} as const;

// ─── Status colors (semantic, not arbitrary) ──────────────────────────────────

export const statusColor = {
  ok:       { bg: "#f0fdf4", text: "#15803d", border: "#86efac" },
  degraded: { bg: "#fffbeb", text: "#92400e", border: "#fcd34d" },
  down:     { bg: "#fef2f2", text: "#991b1b", border: "#fca5a5" },
  unknown:  { bg: "#f9fafb", text: "#374151", border: "#d1d5db" },
} as const;

// ─── CSS variable map — emitted into :root by apps/web global CSS ─────────────

export function buildCSSVariables(): string {
  const lines: string[] = [":root {"];

  for (const [k, v] of Object.entries(spacing)) {
    lines.push(`  --spacing-${k}: ${v};`);
  }
  for (const [k, v] of Object.entries(radius)) {
    lines.push(`  --radius-${k}: ${v};`);
  }
  for (const [k, v] of Object.entries(shadow)) {
    lines.push(`  --shadow-${k}: ${v};`);
  }
  for (const [k, v] of Object.entries(fontSize)) {
    lines.push(`  --font-size-${k}: ${v};`);
  }
  lines.push(`  --motion-fast: ${motion.fast};`);
  lines.push(`  --motion-base: ${motion.base};`);
  lines.push(`  --motion-slow: ${motion.slow};`);
  lines.push(`  --motion-easing: ${motion.easing};`);
  lines.push(`  --transition-default: ${transitions.default};`);
  lines.push(`  --transition-fast: ${transitions.fast};`);
  lines.push("}");

  return lines.join("\n");
}
