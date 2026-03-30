/**
 * compositeAsset.ts  — Step 4.5 Typography Layer
 *
 * Text is NEVER generated inside an AI image in this pipeline.
 * All copy is overlaid programmatically here using Satori + Sharp.
 *
 * Flow:
 *  1. Spell-check every text string BEFORE overlay (deterministic)
 *  2. Satori renders the text layout as an SVG (zero external API)
 *  3. Sharp fetches the raw image and composites the SVG on top
 *  4. Returns the composited buffer + audit metadata
 *
 * The raw AI image (text-free) and the composited image are kept separate
 * in the audit record so the original can always be re-composited.
 */

import sharp from 'sharp'
import satori from 'satori'
import type { ActiveGovernance } from '@/lib/pipeline/governance'
import type { IntakeBrief, TargetPlatform } from '@/lib/media-realism/types'
import type { CopyVariant } from '@/lib/pipeline/qc/deterministicChecks'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BrandTokens {
  fontFamily: string
  headlineSizePx: number
  subheadlineSizePx: number
  ctaSizePx: number
  disclaimerSizePx: number
  primaryColor: string       // hex — headline + CTA
  subColor: string           // hex — subheadline
  disclaimerColor: string    // hex — muted
  ctaBgColor: string         // hex — CTA button background
  ctaTextColor: string       // hex — CTA button text
  paddingPx: number          // outer padding
  lineHeightRatio: number    // e.g. 1.3
}

export interface CompositeAssetResult {
  compositeBuffer: Buffer         // final JPEG buffer ready to write/upload
  rawImageUrl: string             // original AI image — text-free
  typographyApplied: boolean
  spellCheckPassed: boolean
  spellCheckIssues: string[]
  fieldsOverlaid: string[]
  widthPx: number
  heightPx: number
  variantId: string
  compositedAt: string
}

export interface CompositeAssetParams {
  rawImageUrl: string             // URL of the text-free AI image (Step 4 output)
  copyVariant: CopyVariant        // the validated copy variant to overlay
  governance: ActiveGovernance
  intakeBrief: IntakeBrief
  outputWidthPx?: number          // default 1200
  outputHeightPx?: number         // default 628 (1.91:1 — Meta standard)
  jpegQuality?: number            // default 90
}

// ─── Brand token defaults ─────────────────────────────────────────────────────

/**
 * Extracts brand tokens from governance styleGuide.
 * Falls back to safe defaults if governance fields are missing.
 */
function extractBrandTokens(governance: ActiveGovernance): BrandTokens {
  // styleGuide lives on the full governance object but is not in ActiveGovernance type
  const sg = (governance as unknown as { styleGuide?: Record<string, string> }).styleGuide ?? {}

  return {
    fontFamily: 'Inter',                          // always Inter — no decorative fonts
    headlineSizePx: 52,
    subheadlineSizePx: 28,
    ctaSizePx: 24,
    disclaimerSizePx: 14,
    primaryColor: sg.primaryColor ?? '#0B1F3A',   // deep navy
    subColor: sg.subColor ?? '#2D4A6E',
    disclaimerColor: '#8A9BB0',                   // always muted — legal text
    ctaBgColor: '#00C4A1',                        // teal accent
    ctaTextColor: '#FFFFFF',
    paddingPx: 48,                                // 48px — brand spacing token
    lineHeightRatio: 1.3,
  }
}

// ─── Platform canvas dimensions ───────────────────────────────────────────────

const PLATFORM_DIMENSIONS: Record<TargetPlatform, { w: number; h: number }> = {
  meta:      { w: 1200, h: 628 },   // 1.91:1 feed
  google:    { w: 1200, h: 628 },
  tiktok:    { w: 1080, h: 1920 },  // 9:16 vertical
  instagram: { w: 1080, h: 1080 },  // 1:1 square
  organic:   { w: 1200, h: 628 },
}

// ─── Spell check ─────────────────────────────────────────────────────────────

const KNOWN_BRAND_TERMS: Record<string, string> = {
  medazon: 'Medazon',
  streamsai: 'StreamsAI',
  'fnp-c': 'FNP-C',
  aprn: 'APRN',
  msn: 'MSN',
  hipaa: 'HIPAA',
}

const COMMON_TYPOS: Record<string, string> = {
  'guarenteed': 'guaranteed',
  'recieve': 'receive',
  'occured': 'occurred',
  'seperate': 'separate',
  'definately': 'definitely',
  'thier': 'their',
  'accomodate': 'accommodate',
  'begining': 'beginning',
}

/**
 * Deterministic spell check on raw text strings before overlay is applied.
 * Checks brand-term casing and known AI typo patterns.
 * Returns issues list — caller decides whether to block or warn.
 */
export function spellCheckTextStrings(variant: CopyVariant): {
  passed: boolean
  issues: string[]
} {
  const issues: string[] = []
  const fields: Array<{ name: string; text: string }> = [
    { name: 'headline', text: variant.headline },
    { name: 'subheadline', text: variant.subheadline },
    { name: 'cta', text: variant.cta },
    { name: 'microcopy', text: variant.microcopy },
    { name: 'disclaimer', text: variant.disclaimer },
    ...variant.bullets.map((b, i) => ({ name: `bullet[${i}]`, text: b })),
  ]

  for (const { name, text } of fields) {
    if (!text) continue
    const lower = text.toLowerCase()

    // Brand term casing
    for (const [wrongCase, correct] of Object.entries(KNOWN_BRAND_TERMS)) {
      const pattern = new RegExp(`\\b${wrongCase}\\b`, 'i')
      if (pattern.test(lower)) {
        const actualInText = text.match(new RegExp(`\\b${wrongCase}\\b`, 'i'))?.[0] ?? wrongCase
        if (actualInText !== correct) {
          issues.push(`${name}: "${actualInText}" should be "${correct}"`)
        }
      }
    }

    // Known AI typos
    for (const [typo, correction] of Object.entries(COMMON_TYPOS)) {
      if (lower.includes(typo)) {
        issues.push(`${name}: "${typo}" should be "${correction}"`)
      }
    }
  }

  return { passed: issues.length === 0, issues }
}

// ─── Satori SVG layout ───────────────────────────────────────────────────────

/**
 * Builds the Satori-compatible React element tree for text overlay.
 * Text layers in render order: disclaimer (bottom) → subheadline → headline → CTA (top)
 *
 * Layout: text occupies the right 55% of canvas on Meta/Google (space for provider image left).
 * On TikTok/Instagram: full-width centered overlay at bottom third.
 */
async function buildTextSvg(params: {
  variant: CopyVariant
  tokens: BrandTokens
  canvasW: number
  canvasH: number
  platform: TargetPlatform
}): Promise<string> {
  const { variant, tokens, canvasW, canvasH, platform } = params

  const isVertical = platform === 'tiktok'
  const isCentered = platform === 'instagram' || platform === 'tiktok'

  // Text zone dimensions
  const textZoneW = isCentered ? canvasW - tokens.paddingPx * 2 : Math.round(canvasW * 0.52)
  const textZoneX = isCentered ? tokens.paddingPx : Math.round(canvasW * 0.46)
  const textZoneY = isVertical
    ? Math.round(canvasH * 0.60)
    : Math.round(canvasH * 0.12)
  const textZoneH = isVertical
    ? Math.round(canvasH * 0.36)
    : Math.round(canvasH * 0.76)

  // Satori requires font data — use system fallback weight descriptors
  // In production, load actual Inter font buffers here
  const fontData = await loadFontData()

  const element = {
    type: 'div',
    props: {
      style: {
        position: 'absolute' as const,
        left: textZoneX,
        top: textZoneY,
        width: textZoneW,
        height: textZoneH,
        display: 'flex',
        flexDirection: 'column' as const,
        justifyContent: 'flex-start' as const,
        gap: 12,
        fontFamily: tokens.fontFamily,
      },
      children: [
        // Headline
        {
          type: 'div',
          props: {
            style: {
              fontSize: tokens.headlineSizePx,
              fontWeight: 700,
              color: tokens.primaryColor,
              lineHeight: tokens.lineHeightRatio,
              letterSpacing: '-0.02em',
            },
            children: variant.headline,
          },
        },
        // Subheadline
        {
          type: 'div',
          props: {
            style: {
              fontSize: tokens.subheadlineSizePx,
              fontWeight: 400,
              color: tokens.subColor,
              lineHeight: tokens.lineHeightRatio,
              marginTop: 4,
            },
            children: variant.subheadline,
          },
        },
        // CTA button
        {
          type: 'div',
          props: {
            style: {
              display: 'inline-flex' as const,
              alignItems: 'center' as const,
              justifyContent: 'center' as const,
              backgroundColor: tokens.ctaBgColor,
              color: tokens.ctaTextColor,
              fontSize: tokens.ctaSizePx,
              fontWeight: 600,
              paddingTop: 14,
              paddingBottom: 14,
              paddingLeft: 28,
              paddingRight: 28,
              borderRadius: 12,
              marginTop: 16,
              width: 'fit-content',
            },
            children: variant.cta,
          },
        },
        // Disclaimer — always last, always muted
        {
          type: 'div',
          props: {
            style: {
              fontSize: tokens.disclaimerSizePx,
              fontWeight: 400,
              color: tokens.disclaimerColor,
              lineHeight: 1.4,
              marginTop: 'auto',
              opacity: 0.8,
            },
            children: variant.disclaimer,
          },
        },
      ],
    },
  }

  const svg = await satori(element as Parameters<typeof satori>[0], {
    width: canvasW,
    height: canvasH,
    fonts: fontData,
  })

  return svg
}

// ─── Font loader ──────────────────────────────────────────────────────────────

/** Loads font data for Satori. Uses a minimal embedded fallback. */
async function loadFontData(): Promise<Parameters<typeof satori>[1]['fonts']> {
  // Attempt to load Inter from the public directory if available
  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    const interPath = path.join(process.cwd(), 'public', 'fonts', 'Inter-Regular.ttf')
    const interBold = path.join(process.cwd(), 'public', 'fonts', 'Inter-Bold.ttf')

    const [regularBuf, boldBuf] = await Promise.all([
      fs.readFile(interPath).catch(() => null),
      fs.readFile(interBold).catch(() => null),
    ])

    const fonts: Parameters<typeof satori>[1]['fonts'] = []
    if (regularBuf) fonts.push({ name: 'Inter', data: regularBuf, weight: 400, style: 'normal' })
    if (boldBuf)    fonts.push({ name: 'Inter', data: boldBuf,    weight: 700, style: 'normal' })
    if (fonts.length > 0) return fonts
  } catch {
    // Font files not available — fall through to embedded fallback
  }

  // Minimal embedded fallback: a 1-glyph TTF that satisfies Satori's requirement
  // In production, always ship Inter fonts in /public/fonts/
  // This fallback produces visible but non-Inter text
  const fallbackPath = await getFallbackFontBuffer()
  return [{ name: 'Inter', data: fallbackPath, weight: 400, style: 'normal' }]
}

async function getFallbackFontBuffer(): Promise<Buffer> {
  // Try any system TTF that might exist
  const fs = await import('fs/promises')
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/System/Library/Fonts/Arial.ttf',
  ]
  for (const candidate of candidates) {
    try {
      const buf = await fs.readFile(candidate)
      return buf
    } catch {
      continue
    }
  }
  // Last resort: return an empty 1-byte buffer — Satori will error gracefully
  return Buffer.alloc(1)
}

// ─── Main composite function ──────────────────────────────────────────────────

/**
 * Composes text onto a raw AI image using Satori + Sharp.
 *
 * Steps:
 *  1. Spell-check all text strings
 *  2. Fetch raw image and resize to target canvas dimensions
 *  3. Render text layout to SVG via Satori
 *  4. Convert SVG to PNG buffer via Sharp
 *  5. Composite PNG overlay onto resized image
 *  6. Return JPEG buffer + full audit metadata
 */
export async function composeAssetWithTypography(
  params: CompositeAssetParams
): Promise<CompositeAssetResult> {
  const {
    rawImageUrl,
    copyVariant,
    governance,
    intakeBrief,
    jpegQuality = 90,
  } = params

  const platform = intakeBrief.targetPlatform
  const dims = PLATFORM_DIMENSIONS[platform] ?? PLATFORM_DIMENSIONS.organic
  const canvasW = params.outputWidthPx ?? dims.w
  const canvasH = params.outputHeightPx ?? dims.h

  // Step 1: Spell-check before overlay
  const spellCheck = spellCheckTextStrings(copyVariant)

  const tokens = extractBrandTokens(governance)
  const fieldsOverlaid: string[] = []

  // Step 2: Fetch and resize the raw image
  let baseImageBuffer: Buffer
  try {
    const response = await fetch(rawImageUrl)
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching image`)
    const arrayBuffer = await response.arrayBuffer()
    baseImageBuffer = await sharp(Buffer.from(arrayBuffer))
      .resize(canvasW, canvasH, { fit: 'cover', position: 'center' })
      .jpeg({ quality: jpegQuality })
      .toBuffer()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown fetch error'
    throw new Error(`[CompositeAsset] Failed to fetch/resize raw image: ${msg}`)
  }

  // Step 3: Render text SVG via Satori
  let svgString: string
  try {
    svgString = await buildTextSvg({
      variant: copyVariant,
      tokens,
      canvasW,
      canvasH,
      platform,
    })
    fieldsOverlaid.push('headline', 'subheadline', 'cta', 'disclaimer')
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Satori error'
    throw new Error(`[CompositeAsset] Text SVG render failed: ${msg}`)
  }

  // Step 4: Convert SVG to PNG buffer
  let overlayBuffer: Buffer
  try {
    overlayBuffer = await sharp(Buffer.from(svgString))
      .png()
      .toBuffer()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sharp SVG error'
    throw new Error(`[CompositeAsset] SVG→PNG conversion failed: ${msg}`)
  }

  // Step 5: Composite overlay onto base image
  let compositeBuffer: Buffer
  try {
    compositeBuffer = await sharp(baseImageBuffer)
      .composite([{ input: overlayBuffer, top: 0, left: 0 }])
      .jpeg({ quality: jpegQuality })
      .toBuffer()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sharp composite error'
    throw new Error(`[CompositeAsset] Image composite failed: ${msg}`)
  }

  return {
    compositeBuffer,
    rawImageUrl,
    typographyApplied: true,
    spellCheckPassed: spellCheck.passed,
    spellCheckIssues: spellCheck.issues,
    fieldsOverlaid,
    widthPx: canvasW,
    heightPx: canvasH,
    variantId: copyVariant.id,
    compositedAt: new Date().toISOString(),
  }
}

/**
 * Convenience: composes all 3 variants from a copy set.
 * Returns one CompositeAssetResult per variant.
 * Used by the assetLibrary step when it needs all three campaign assets.
 */
export async function composeAllVariants(params: {
  rawImageUrl: string
  variants: CopyVariant[]
  governance: ActiveGovernance
  intakeBrief: IntakeBrief
  outputWidthPx?: number
  outputHeightPx?: number
  jpegQuality?: number
}): Promise<CompositeAssetResult[]> {
  const results: CompositeAssetResult[] = []
  for (const variant of params.variants) {
    const result = await composeAssetWithTypography({
      rawImageUrl: params.rawImageUrl,
      copyVariant: variant,
      governance: params.governance,
      intakeBrief: params.intakeBrief,
      outputWidthPx: params.outputWidthPx,
      outputHeightPx: params.outputHeightPx,
      jpegQuality: params.jpegQuality,
    })
    results.push(result)
  }
  return results
}
