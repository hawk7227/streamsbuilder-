// Pure utility — no React, no hooks, safe to call from any context

export type ExtractedCodeLanguage = 'jsx' | 'tsx' | 'html' | 'react' | 'javascript' | 'typescript';

export interface ExtractedArtifact {
  id: string;
  language: ExtractedCodeLanguage;
  code: string;
  componentName: string;
  lineCount: number;
  isComplete: boolean;   // false while still streaming
}

const SUPPORTED_LANGS: ExtractedCodeLanguage[] = ['jsx', 'tsx', 'react', 'html', 'javascript', 'typescript'];

function inferComponentName(code: string, lang: ExtractedCodeLanguage): string {
  // Try to find export default function Name or const Name =
  const exportMatch = code.match(/export\s+default\s+function\s+([A-Z][A-Za-z0-9]*)/);
  if (exportMatch?.[1]) return exportMatch[1];
  const constMatch = code.match(/(?:export\s+(?:default\s+)?)?(?:const|function)\s+([A-Z][A-Za-z0-9]*)/);
  if (constMatch?.[1]) return constMatch[1];
  if (lang === 'html') return 'HTML Document';
  return 'Component';
}

/**
 * Scans the accumulated SSE text buffer for fenced code blocks.
 * Returns the most recently detected artifact (complete or in-progress).
 * Safe to call on every delta — designed to be cheap.
 */
export function extractArtifactFromBuffer(buffer: string): ExtractedArtifact | null {
  // Look for the start of a fenced code block with a supported language
  const openFenceRe = /```(jsx|tsx|react|html|javascript|typescript|js|ts)\n/gi;

  let lastMatch: ExtractedArtifact | null = null;
  let m: RegExpExecArray | null;

  // Reset lastIndex because we're in a loop
  openFenceRe.lastIndex = 0;

  while ((m = openFenceRe.exec(buffer)) !== null) {
    const rawLang = m[1]!.toLowerCase();
    const lang: ExtractedCodeLanguage =
      rawLang === 'js' ? 'javascript' :
      rawLang === 'ts' ? 'typescript' :
      SUPPORTED_LANGS.includes(rawLang as ExtractedCodeLanguage)
        ? (rawLang as ExtractedCodeLanguage)
        : 'jsx';

    const codeStart = m.index + m[0].length;
    const closeFenceIdx = buffer.indexOf('\n```', codeStart);
    const isComplete = closeFenceIdx !== -1;
    const codeEnd = isComplete ? closeFenceIdx : buffer.length;
    const code = buffer.slice(codeStart, codeEnd);

    if (code.trim().length < 10) continue; // skip empty/tiny blocks

    lastMatch = {
      id: `artifact_${m.index}`,
      language: lang,
      code,
      componentName: inferComponentName(code, lang),
      lineCount: code.split('\n').length,
      isComplete,
    };
  }

  return lastMatch;
}
