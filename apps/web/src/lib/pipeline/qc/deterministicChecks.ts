/**
 * deterministicChecks.ts
 *
 * All deterministic (non-AI) quality control functions.
 * Every function here is synchronous and pure — no LLM calls, no API calls.
 * These run BEFORE any AI call in the pipeline.
 *
 * Rule: if a deterministic check can catch it, an AI check must not be the first line of defence.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CopyVariant {
  id: string
  headline: string
  subheadline: string
  bullets: string[]
  cta: string
  microcopy: string
  disclaimer: string
}

export interface CopyOutput {
  variants: CopyVariant[]
}

export interface FieldLengthLimits {
  headlineMaxWords: number
  subheadlineMaxWords: number
  bulletMaxCount: number
  bulletMaxWords: number
  ctaMaxWords: number
  microcopyMaxWords: number
  disclaimerMaxWords: number
}

export interface BannedPhraseHit {
  phrase: string
  field: string
  variantId: string
  context: string // surrounding text for human review
}

export interface BannedPhraseResult {
  passed: boolean
  hits: BannedPhraseHit[]
}

export interface FieldViolation {
  variantId: string
  field: string
  actual: number
  limit: number
  type: 'words' | 'count'
}

export interface FieldLengthResult {
  passed: boolean
  violations: FieldViolation[]
}

export interface GrammarIssue {
  variantId: string
  field: string
  issue: string
  found: string
  suggestion: string
}

export interface GrammarResult {
  passed: boolean
  issues: GrammarIssue[]
}

export interface UnverifiedClaim {
  variantId: string
  field: string
  claim: string
  reason: string
}

export interface FactsAlignmentResult {
  passed: boolean
  aligned: string[]
  unverified: UnverifiedClaim[]
  blocked: UnverifiedClaim[] // specific fact patterns that are always blocked
}

export interface DisclaimerResult {
  passed: boolean
  present: boolean
  hasEligibilityQualifier: boolean
  issues: string[]
}

export interface DifferentiationResult {
  passed: boolean
  allDistinct: boolean
  detectedAngles: string[]
  missingAngles: string[]
  duplicateAngles: string[]
}

export interface OcrScanResult {
  hasText: boolean
  textFound: string[]
  confidence: 'high' | 'medium' | 'low'
  skipped: boolean // true if OCR not available — caller must treat as unverified
}

export interface VideoUrlResult {
  reachable: boolean
  contentType: string
  statusCode: number
  error?: string
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function extractContext(text: string, phrase: string, windowChars = 40): string {
  const lower = text.toLowerCase()
  const idx = lower.indexOf(phrase.toLowerCase())
  if (idx === -1) return text.slice(0, 60)
  const start = Math.max(0, idx - windowChars)
  const end = Math.min(text.length, idx + phrase.length + windowChars)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

function allTextFields(variant: CopyVariant): Array<{ field: string; text: string }> {
  return [
    { field: 'headline', text: variant.headline },
    { field: 'subheadline', text: variant.subheadline },
    { field: 'cta', text: variant.cta },
    { field: 'microcopy', text: variant.microcopy },
    { field: 'disclaimer', text: variant.disclaimer },
    ...variant.bullets.map((b, i) => ({ field: `bullet[${i}]`, text: b })),
  ]
}

// ─── LAYER 1: Banned Phrase Scan ─────────────────────────────────────────────

/**
 * Deterministic string scan for banned phrases across all copy variants.
 * Case-insensitive. Returns all hits with field location and surrounding context.
 * A single hit = immediate block — no LLM can override this.
 */
export function scanBannedPhrases(
  copy: CopyOutput,
  bannedPhrases: string[]
): BannedPhraseResult {
  const hits: BannedPhraseHit[] = []

  for (const variant of copy.variants) {
    for (const { field, text } of allTextFields(variant)) {
      if (!text) continue
      const lower = text.toLowerCase()
      for (const phrase of bannedPhrases) {
        if (lower.includes(phrase.toLowerCase())) {
          hits.push({
            phrase,
            field,
            variantId: variant.id,
            context: extractContext(text, phrase),
          })
        }
      }
    }
  }

  return { passed: hits.length === 0, hits }
}

// ─── LAYER 2: Field Length Enforcement ───────────────────────────────────────

/**
 * Checks every copy field against governance word/count limits.
 * Returns all violations — not just the first one.
 */
export function checkFieldLengths(
  copy: CopyOutput,
  limits: FieldLengthLimits
): FieldLengthResult {
  const violations: FieldViolation[] = []

  for (const variant of copy.variants) {
    const check = (field: string, text: string, limit: number, type: 'words' | 'count' = 'words') => {
      const actual = type === 'words' ? wordCount(text) : 1
      if (actual > limit) {
        violations.push({ variantId: variant.id, field, actual, limit, type })
      }
    }

    check('headline', variant.headline, limits.headlineMaxWords)
    check('subheadline', variant.subheadline, limits.subheadlineMaxWords)
    check('cta', variant.cta, limits.ctaMaxWords)
    check('microcopy', variant.microcopy, limits.microcopyMaxWords)
    check('disclaimer', variant.disclaimer, limits.disclaimerMaxWords)

    // Bullet count
    if (variant.bullets.length > limits.bulletMaxCount) {
      violations.push({
        variantId: variant.id,
        field: 'bullets',
        actual: variant.bullets.length,
        limit: limits.bulletMaxCount,
        type: 'count',
      })
    }

    // Each bullet word count
    for (let i = 0; i < variant.bullets.length; i++) {
      const wc = wordCount(variant.bullets[i])
      if (wc > limits.bulletMaxWords) {
        violations.push({
          variantId: variant.id,
          field: `bullet[${i}]`,
          actual: wc,
          limit: limits.bulletMaxWords,
          type: 'words',
        })
      }
    }
  }

  return { passed: violations.length === 0, violations }
}

// ─── LAYER 3: Grammar & Spelling ─────────────────────────────────────────────

// Known homophone / common AI failure patterns
const GRAMMAR_RULES: Array<{
  pattern: RegExp
  issue: string
  suggestion: string
}> = [
  { pattern: /\bthier\b/gi, issue: 'misspelling', suggestion: '"their"' },
  { pattern: /\byour'e\b/gi, issue: 'apostrophe error', suggestion: '"you\'re"' },
  { pattern: /\bits'\b(?=\s+(?:a|an|the|not|been|going|time|never|about|just|only|that|this|very|all|here|there|where|been))/gi, issue: 'homophone', suggestion: '"it\'s" (contraction) vs "its" (possessive)' },
  { pattern: /\beffect\b(?=\s+(?:your|our|the|a|an|this|that|these|those|my|their|his|her|its|your|our))/gi, issue: 'possible homophone — check affect vs effect', suggestion: 'verify "affect" (verb) vs "effect" (noun)' },
  { pattern: /\bthen\b(?=\s+(?:you|we|they|he|she|it|your|our|their|my))/gi, issue: 'possible than/then confusion', suggestion: 'verify "than" (comparison) vs "then" (time)' },
  { pattern: /\b(medazon|streamsai|fnp-c|aprn|msn)\b/gi, issue: 'brand term — verify casing', suggestion: 'check brand capitalization standards' },
  // Urgency language that is also a compliance risk
  { pattern: /\b(now guaranteed|see a doctor now|instant access|same.day guaranteed)\b/gi, issue: 'urgency guarantee language', suggestion: 'remove urgency/guarantee framing per governance' },
]

/**
 * Lightweight deterministic grammar check using curated rule patterns.
 * Not AI — uses regex rules for known LLM failure modes.
 */
export function checkGrammarAndSpelling(copy: CopyOutput): GrammarResult {
  const issues: GrammarIssue[] = []

  for (const variant of copy.variants) {
    for (const { field, text } of allTextFields(variant)) {
      if (!text) continue
      for (const rule of GRAMMAR_RULES) {
        const match = text.match(rule.pattern)
        if (match) {
          issues.push({
            variantId: variant.id,
            field,
            issue: rule.issue,
            found: match[0],
            suggestion: rule.suggestion,
          })
        }
      }
    }
  }

  return { passed: issues.length === 0, issues }
}

// ─── LAYER 4: Approved Facts Alignment ───────────────────────────────────────

// Patterns that indicate a factual claim in copy — things that sound like stats or guarantees
const FACTUAL_CLAIM_PATTERNS: RegExp[] = [
  /\d+[\+%]\s*(?:patients?|providers?|states?|years?|minutes?|hours?|days?)/gi,
  /(?:all\s+\d+|licensed in|board.certified|certified in|available in)\s+[\w\s]+/gi,
  /(?:over|more than|up to|at least|exactly)\s+\d+/gi,
  /(?:same.day|24\/7|around.the.clock|always available)/gi,
  /\$[\d,]+(?:\s*flat|per visit|per month|fee)?/gi,
  /(?:accepted|covered)\s+(?:by|in|under)\s+[\w\s]+/gi,
]

// Always-blocked claim patterns regardless of approved facts
const ALWAYS_BLOCKED_CLAIM_PATTERNS: RegExp[] = [
  /\b(all 50 states|nationwide guaranteed|every state)\b/gi,
  /\b(board.certified in all|licensed in all)\b/gi,
  /\b(100% covered|fully covered|insurance guaranteed)\b/gi,
  /\b(see results in|results guaranteed|guaranteed results)\b/gi,
]

/**
 * Extracts factual-sounding claims from copy and checks they map to approved facts.
 * Unverified claims → softFail. Always-blocked patterns → block.
 */
export function checkApprovedFactsAlignment(
  copy: CopyOutput,
  approvedFacts: string[]
): FactsAlignmentResult {
  const aligned: string[] = []
  const unverified: UnverifiedClaim[] = []
  const blocked: UnverifiedClaim[] = []
  const approvedLower = approvedFacts.map(f => f.toLowerCase())

  for (const variant of copy.variants) {
    for (const { field, text } of allTextFields(variant)) {
      if (!text) continue

      // Check always-blocked patterns first
      for (const pattern of ALWAYS_BLOCKED_CLAIM_PATTERNS) {
        const matches = text.match(pattern)
        if (matches) {
          for (const match of matches) {
            blocked.push({
              variantId: variant.id,
              field,
              claim: match,
              reason: 'This claim pattern is always blocked regardless of approved facts',
            })
          }
        }
      }

      // Extract factual claims and check against approved facts
      for (const pattern of FACTUAL_CLAIM_PATTERNS) {
        const matches = text.match(pattern)
        if (matches) {
          for (const match of matches) {
            const matchLower = match.toLowerCase()
            const isApproved = approvedLower.some(fact =>
              fact.includes(matchLower) || matchLower.includes(fact.slice(0, 20))
            )
            if (isApproved) {
              if (!aligned.includes(match)) aligned.push(match)
            } else {
              unverified.push({
                variantId: variant.id,
                field,
                claim: match,
                reason: 'No matching approved fact found for this claim',
              })
            }
          }
        }
      }
    }
  }

  return {
    passed: blocked.length === 0 && unverified.length === 0,
    aligned,
    unverified,
    blocked,
  }
}

// ─── LAYER 5: Disclaimer Compliance ──────────────────────────────────────────

// Eligibility qualifier patterns — at least one must be present
const ELIGIBILITY_QUALIFIERS: RegExp[] = [
  /eligib/i,
  /where available/i,
  /subject to (?:provider|clinical|review)/i,
  /not available in all/i,
  /clinically appropriate/i,
  /provider review/i,
  /may vary/i,
  /terms (?:and conditions )?apply/i,
  /individual results/i,
]

const BANNED_DISCLAIMER_CONTENT: RegExp[] = [
  /guaranteed/i,
  /always available/i,
  /no questions/i,
]

/**
 * Validates disclaimer presence and content across all variants.
 * Telehealth: disclaimer is MANDATORY and must contain eligibility qualifier.
 */
export function checkDisclaimerCompliance(copy: CopyOutput): DisclaimerResult {
  const issues: string[] = []
  let allPresent = true
  let allHaveQualifier = true

  for (const variant of copy.variants) {
    const disclaimer = variant.disclaimer?.trim() ?? ''

    if (!disclaimer || disclaimer.length < 5) {
      allPresent = false
      issues.push(`Variant ${variant.id}: disclaimer missing or too short`)
      continue
    }

    const hasQualifier = ELIGIBILITY_QUALIFIERS.some(p => p.test(disclaimer))
    if (!hasQualifier) {
      allHaveQualifier = false
      issues.push(
        `Variant ${variant.id}: disclaimer lacks eligibility qualifier (e.g. "where eligible", "subject to provider review")`
      )
    }

    for (const pattern of BANNED_DISCLAIMER_CONTENT) {
      if (pattern.test(disclaimer)) {
        issues.push(`Variant ${variant.id}: disclaimer contains banned content matching /${pattern.source}/i`)
      }
    }
  }

  return {
    passed: issues.length === 0,
    present: allPresent,
    hasEligibilityQualifier: allHaveQualifier,
    issues,
  }
}

// ─── LAYER 6: Variant Differentiation ────────────────────────────────────────

// Required objection angles and their keyword signals
const OBJECTION_ANGLES = [
  {
    name: 'access',
    keywords: ['convenient', 'from home', 'online', 'anywhere', 'no travel', 'private', 'easy', 'schedule', 'flexible', 'remote', 'digital'],
  },
  {
    name: 'trust',
    keywords: ['licensed', 'provider', 'qualified', 'certified', 'professional', 'board', 'secure', 'safe', 'hipaa', 'clinical', 'care'],
  },
  {
    name: 'value',
    keywords: ['affordable', 'cost', 'price', 'fee', 'flat', 'transparent', 'no hidden', 'simple pricing', 'worth', 'value', '$'],
  },
]

/**
 * Checks that each copy variant addresses a distinct patient objection angle.
 * Required angles: access, trust/credibility, value/cost.
 * If all 3 variants address the same angle → softFail.
 */
export function checkVariantDifferentiation(copy: CopyOutput): DifferentiationResult {
  const variantAngles: string[] = []

  for (const variant of copy.variants) {
    const searchText = [
      variant.headline,
      variant.subheadline,
      ...variant.bullets,
    ].join(' ').toLowerCase()

    const detected = OBJECTION_ANGLES
      .filter(angle => angle.keywords.some(kw => searchText.includes(kw)))
      .map(angle => angle.name)

    // Assign primary angle (first match) per variant
    variantAngles.push(detected[0] ?? 'unknown')
  }

  const requiredAngles = OBJECTION_ANGLES.map(a => a.name)
  const detectedSet = new Set(variantAngles)
  const missingAngles = requiredAngles.filter(a => !detectedSet.has(a))
  const duplicateAngles = variantAngles.filter((a, i) => variantAngles.indexOf(a) !== i && a !== 'unknown')

  return {
    passed: missingAngles.length === 0 && duplicateAngles.length === 0,
    allDistinct: new Set(variantAngles).size === copy.variants.length,
    detectedAngles: variantAngles,
    missingAngles,
    duplicateAngles: [...new Set(duplicateAngles)],
  }
}

// ─── Image Prompt QC ─────────────────────────────────────────────────────────

const MANDATORY_IMAGE_NEGATIVE_ELEMENTS = [
  'no text',
  'no words',
  'no letters',
  'no signs',
  'no labels',
  'no captions',
  'no watermarks',
  'no distorted hands',
  'no extra fingers',
  'no fused fingers',
  'no floating limbs',
  'no extra limbs',
  'no missing limbs',
  'no dead eyes',
  'no plastic skin',
  'no uncanny valley',
  'no stock photography',
  'no before/after',
]

const MANDATORY_IMAGE_POSITIVE_ANCHORS = [
  'natural expression',
  'natural lighting',
  'real person',
]

/**
 * Builds the complete mandatory negative prompt for image generation.
 * This string MUST be appended to every image prompt — no exceptions.
 */
export function buildImageNegativePrompt(additionalForbidden: string[] = []): string {
  const all = [...MANDATORY_IMAGE_NEGATIVE_ELEMENTS, ...additionalForbidden]
  return all.join(', ')
}

/**
 * Verifies that all mandatory negative prompt elements are present in the final prompt.
 * Returns false (and which elements are missing) if any are absent.
 */
export function checkImageNegativePromptPresent(prompt: string): {
  passed: boolean
  missingElements: string[]
} {
  const lower = prompt.toLowerCase()
  const missingElements = MANDATORY_IMAGE_NEGATIVE_ELEMENTS.filter(
    el => !lower.includes(el.toLowerCase())
  )
  return { passed: missingElements.length === 0, missingElements }
}

/**
 * Verifies that mandatory positive anatomy anchors are in the prompt.
 */
export function checkImagePositiveAnchorsPresent(prompt: string): {
  passed: boolean
  missingAnchors: string[]
} {
  const lower = prompt.toLowerCase()
  const missingAnchors = MANDATORY_IMAGE_POSITIVE_ANCHORS.filter(
    a => !lower.includes(a.toLowerCase())
  )
  return { passed: missingAnchors.length === 0, missingAnchors }
}

// ─── OCR Scan (Async — real impl uses vision API or heuristic) ───────────────

/**
 * Scans an image URL for visible text.
 * Production: calls a vision API or OCR service.
 * Test/fallback: returns skipped=true (caller must treat as unverified, not passed).
 *
 * A result with hasText=true means the image must be regenerated.
 * A result with skipped=true means OCR was unavailable — do not auto-approve.
 */
export async function scanImageForText(imageUrl: string): Promise<OcrScanResult> {
  // In production this would call a real OCR endpoint.
  // We implement the contract here — the real provider is injected at runtime.
  // Returning skipped=true forces the caller to flag for human review rather than auto-pass.
  if (!imageUrl || imageUrl.startsWith('http') === false) {
    return { hasText: false, textFound: [], confidence: 'low', skipped: true }
  }

  // Placeholder: real implementation would call vision API
  // For now: skipped=true — pipeline will flag for human review
  return { hasText: false, textFound: [], confidence: 'low', skipped: true }
}

// ─── Video URL Validation ─────────────────────────────────────────────────────

/**
 * Validates that a video URL is reachable and returns an expected content type.
 * Uses HEAD request — does not download the video.
 */
export async function validateVideoUrl(videoUrl: string): Promise<VideoUrlResult> {
  if (!videoUrl) {
    return { reachable: false, contentType: '', statusCode: 0, error: 'Empty URL' }
  }

  try {
    const response = await fetch(videoUrl, { method: 'HEAD' })
    const contentType = response.headers.get('content-type') ?? ''
    return {
      reachable: response.ok,
      contentType,
      statusCode: response.status,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    }
  } catch (err) {
    return {
      reachable: false,
      contentType: '',
      statusCode: 0,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}
