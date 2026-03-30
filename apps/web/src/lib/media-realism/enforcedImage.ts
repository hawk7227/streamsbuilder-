import { uploadImageToSupabase } from '@/lib/supabase/storage';
import { runValidators } from '@/lib/enforcement/validatorRunner';
import { validateImagePromptPolicy } from '@/lib/enforcement/validators/image';
import { ASPECT_RATIO_TO_SIZE, FORBIDDEN_IMAGE_TERMS, REQUIRED_REALISM_ANCHORS } from './realismPolicy';
import { generateImageCandidatesFromProvider } from './generationClient';
import { generationConfig } from './generationConfig';

export type ImageMode = 'responses' | 'images';
export type ReferencePriority = 'low' | 'medium' | 'high';

export interface ImageReference {
  kind: 'image';
  fileId: string;
  url?: string;
}

export interface GenerateEnforcedImageInput {
  prompt: string;
  apiKey: string;
  workspaceId: string;
  mode?: ImageMode;
  references?: ImageReference[];
  realismMode?: 'strict' | 'balanced';
  aspectRatio?: keyof typeof ASPECT_RATIO_TO_SIZE;
  referencePriority?: ReferencePriority;
}

export interface PreparedEnforcedImagePrompt {
  finalPrompt: string;
  rewrittenPrompt: string;
  strippedTerms: string[];
  ledger: unknown;
}

export interface GenerateEnforcedImageResult extends PreparedEnforcedImagePrompt {
  outputUrl: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function classifyReference(url: string): 'usable' | 'risky' | 'reject' {
  const lower = url.toLowerCase();
  if (/text=|overlay=|caption=|ui=|label=/i.test(lower)) return 'reject';
  if (/cinematic|studio|glossy|polished|luxury|premium/i.test(lower)) return 'risky';
  return 'usable';
}

function sanitizeImagePrompt(raw: string): { sanitized: string; stripped: string[] } {
  const stripped: string[] = [];
  let result = raw;
  for (const term of FORBIDDEN_IMAGE_TERMS) {
    const escaped = escapeRegExp(term).replace(/\s+/g, '\\s+');
    const regex = new RegExp(`(?:^|\\b|\\s)${escaped}(?:\\b|\\s|$)`, 'gi');
    if (regex.test(result)) {
      stripped.push(term);
      result = result.replace(regex, ' ').trim();
    }
  }
  return { sanitized: result.replace(/\s{2,}/g, ' ').trim(), stripped };
}

function isHumanSubjectPrompt(prompt: string): boolean {
  return /\b(woman|man|person|people|girl|boy|mother|father|doctor|patient|nurse|customer|user|portrait|face|selfie|human)\b/i.test(prompt);
}

async function helperRewrite(prompt: string, apiKey: string, realismMode: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.2,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Rewrite this image prompt for strict real-photo realism.\n\nRules:\n- Keep the core subject, action, and setting.\n- Remove cinematic, luxury, stylized, glamour, beauty, polished, ad-style, and editorial language.\n- If the subject is a person, they must look like a real non-model human, not an idealized or beautified AI face.\n- Force: slight natural asymmetry, visible skin texture, realistic pores, realistic hands, realistic hair flyaways, uneven natural lighting, candid expression, slightly imperfect composition.\n- Avoid: studio portrait, centered glamour framing, flawless skin, polished beauty look, hyper-symmetry, artificial smoothness, commercial ad look.\n- Prefer: phone-camera realism, casual photography, ordinary environment, believable human proportions.\n- Return only the rewritten prompt.\n\nMode: ${realismMode}\nOriginal: ${prompt}`,
      }],
    }),
  });

  if (!response.ok) return prompt;
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content?.trim() || prompt;
}

function compileFinalPrompt(prompt: string, references: ImageReference[], referencePriority: ReferencePriority): string {
  const anchors = REQUIRED_REALISM_ANCHORS.join(', ');
  const refGuidance = references.length > 0 && referencePriority !== 'low'
    ? `Reference guidance (${referencePriority} priority): ${references.length} reference image(s) provided for loose appearance/composition alignment only.`
    : '';

  return [
    prompt,
    `Strict realism anchors: ${anchors}.`,
    refGuidance,
    'Human realism lock: if a person is shown, they must look like a real everyday human being, not a model, not a polished portrait, not a beauty campaign, and not an AI-generated face.',
    'Photo realism lock: this must read as a candid real-world photograph with natural imperfections, uneven lighting, realistic skin texture, realistic hands, and slight facial asymmetry.',
    'Failure conditions: centered glamour portrait, studio beauty lighting, perfect skin, polished ad look, over-symmetry, fake smoothness, CGI/render/illustration feel.',
    'Composition lock: prefer ordinary framing, slightly off-center composition, natural camera feel, believable environment detail.',
    'Do not include text, UI elements, overlays, labels, or watermarks in the image.',
  ].filter(Boolean).join(' ');
}

export async function prepareEnforcedImagePrompt(input: GenerateEnforcedImageInput): Promise<PreparedEnforcedImagePrompt> {
  const references = input.references ?? [];
  const MAX_REFERENCES = 3;
  if (references.length > MAX_REFERENCES) {
    throw new Error(`Maximum ${MAX_REFERENCES} image references allowed.`);
  }

  const rejectedReferences = references.filter((reference) => classifyReference(reference.url ?? reference.fileId) === 'reject');
  if (rejectedReferences.length > 0) {
    throw new Error('One or more references were rejected because they appear to contain baked-in text/UI or incompatible style instructions.');
  }

  const usableReferences = references.filter((reference) => classifyReference(reference.url ?? reference.fileId) !== 'reject');
  const { sanitized, stripped } = sanitizeImagePrompt(input.prompt.trim());
  const rewritten = await helperRewrite(sanitized, input.apiKey, input.realismMode ?? 'strict');
  const finalPrompt = compileFinalPrompt(
    rewritten + (isHumanSubjectPrompt(rewritten) ? ' Real-person lock: show a believable everyday person with natural facial asymmetry, visible skin texture, non-model appearance, and candid real-life camera realism.' : ''),
    usableReferences,
    input.referencePriority ?? 'medium',
  );

  const ledger = runValidators('image', [{
    name: 'image-policy',
    result: validateImagePromptPolicy({
      originalPrompt: input.prompt,
      finalPrompt,
      strippedTerms: stripped,
      referencesUsed: usableReferences.length,
    }),
  }], { mode: input.mode ?? "images", referencesUsed: usableReferences.length });

  const blocking = ledger.issues.find((issue) => issue.severity === 'error');
  if (blocking) throw new Error(blocking.message);

  return { finalPrompt, rewrittenPrompt: rewritten, strippedTerms: stripped, ledger };
}

export async function generateEnforcedImage(input: GenerateEnforcedImageInput): Promise<GenerateEnforcedImageResult> {
  const prepared = await prepareEnforcedImagePrompt(input);
  const size = ASPECT_RATIO_TO_SIZE[input.aspectRatio ?? '16:9'];
  const candidates = await generateImageCandidatesFromProvider({ prompt: prepared.finalPrompt, aspectRatio: input.aspectRatio ?? '1:1', attempts: 1 });
  const generated = candidates[0];
  const outputUrl = generated?.url
    ? await uploadImageToSupabase(generated.url, input.workspaceId).catch(() => generated.url)
    : null;

  if (!outputUrl) throw new Error('Image generation returned no usable output URL');

  return { ...prepared, outputUrl };
}
