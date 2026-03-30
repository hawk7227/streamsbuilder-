export const CONSTITUTION_VERSION = "max-capability-enforcement-v1";

export const HARD_RULES = {
  noStatusOnlyCompletion: true,
  noFakeVerification: true,
  noValidatorBypass: true,
  noTemplateGradeOutput: true,
  noImageRealismBypass: true,
  noVideoRealismBypass: true,
  requireStreamingWhenSupported: true,
} as const;

export const STATUS_ONLY_PATTERNS: RegExp[] = [
  /^done\.?$/i,
  /^completed\.?$/i,
  /^finished\.?$/i,
  /^ok\.?$/i,
  /^sure\.?$/i,
  /^alright\.?$/i,
  /^no action needed\.?$/i,
  /^nothing to do\.?$/i,
];

export function isStatusOnly(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return STATUS_ONLY_PATTERNS.some((pattern) => pattern.test(trimmed));
}
