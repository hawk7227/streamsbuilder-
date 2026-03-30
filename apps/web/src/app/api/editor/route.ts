import { NextRequest } from 'next/server'


export const runtime = 'nodejs'
export const maxDuration = 60

function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!r.ok) {
    const body = await r.text()
    throw new Error(`Anthropic ${r.status}: ${body}`)
  }
  const data = await r.json()
  return data.content?.find((b: { type: string }) => b.type === 'text')?.text ?? ''
}

function extractReturnBlock(src: string): string {
  // Find ALL top-level `  return (` occurrences (2-space indent = component body)
  // We want the LAST one — that's the main page component's return
  const lines = src.split('\n');
  let lastReturnLine = -1;

  for (let i = 0; i < lines.length; i++) {
    // Match `  return (` with exactly 2 spaces (top-level component return)
    if (/^  return\s*\(/.test(lines[i])) {
      lastReturnLine = i;
    }
  }

  if (lastReturnLine === -1) {
    // Fallback: find any return (
    const m = src.match(/return\s*\(\s*([\s\S]+)/);
    if (!m) return src.slice(0, 8000);
    return m[1].slice(0, 8000);
  }

  // Extract from that line forward, find balanced parens
  const after = lines.slice(lastReturnLine).join('\n');
  const startParen = after.indexOf('(');
  if (startParen === -1) return src.slice(0, 8000);

  const content = after.slice(startParen + 1);
  let depth = 1, i = 0;
  while (i < content.length && depth > 0) {
    if (content[i] === '(') depth++;
    else if (content[i] === ')') depth--;
    i++;
  }
  const jsx = content.slice(0, i - 1).trim();
  return jsx.length > 200 ? jsx : src.slice(0, 8000);
}

export async function POST(req: NextRequest): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return err('ANTHROPIC_API_KEY not configured on server', 503)

  let body: { action: string; tsx?: string; changes?: { prop: string; value: string; elText: string }[] }
  try {
    body = await req.json()
  } catch {
    return err('Invalid JSON')
  }

  // ── ACTION: tsx-to-html ───────────────────────────────────────────────────
  if (body.action === 'tsx-to-html') {
    const tsx = body.tsx?.trim()
    if (!tsx) return err('tsx is required')

    const jsxBlock = extractReturnBlock(tsx);
    const hasTailwind = /className=/.test(tsx);

    const prompt = `You are converting a React JSX snippet to plain static HTML for visual preview in a mobile iframe.

INPUT JSX (the main return block of a React checkout page):
\`\`\`
${jsxBlock.slice(0, 12000)}
\`\`\`

CONVERSION RULES:
1. Output a COMPLETE HTML document starting with <!DOCTYPE html>
2. In <head> include:
   - <meta charset="UTF-8">
   - <meta name="viewport" content="width=device-width, initial-scale=1.0">
   - <script src="https://cdn.tailwindcss.com"></script>
   - <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
   - <style>*, *::before, *::after { box-sizing: border-box; } body { margin: 0; padding: 0; font-family: Inter, system-ui, sans-serif; height: 100dvh; overflow: hidden; }</style>
3. Attribute conversion: className → class, htmlFor → for
4. Inline style conversion: style={{ fontSize: "14px", color: "#fff" }} → style="font-size: 14px; color: #fff;"
5. Replace ALL JSX expressions in curly braces with realistic values:
   - {currentStep} → 1
   - {totalSteps} → 5  
   - {price} or prices → $189
   - {patientName} → Sarah Johnson
   - Boolean conditionals: render the DEFAULT/INITIAL state (step 1, not loading)
   - If you see isLoading, loading, Processing — render the NON-loading state instead
6. Remove: onClick={}, onChange={}, onSubmit={}, ref={}, key={} 
7. Keep: class, style, id, type, placeholder, name, value, disabled, href
8. Self-close void elements: <input />, <br />, <img />, <hr />

CRITICAL RULES:
- Output ONLY the final HTML document. Zero JSX syntax. Zero TypeScript.
- No markdown code fences. No explanation text.
- The rendered page MUST show actual UI content (not a spinner, not blank, not "Processing upload")`

    try {
      const html = await callClaude(prompt, apiKey)
      const clean = html.replace(/^```html?\n?/i, '').replace(/\n?```$/, '').trim()
      // Validate it looks like HTML (not raw JSX/TSX source)
      const looksLikeHtml = clean.includes('<!DOCTYPE') || clean.includes('<html') || clean.includes('<div') || clean.includes('<section')
      const looksLikeTsx = clean.startsWith('"use client"') || clean.includes('import {') || clean.includes('export default')
      if (looksLikeTsx || !looksLikeHtml) {
        return err('Conversion returned source code instead of HTML — model did not follow instructions', 502)
      }
      return new Response(JSON.stringify({ html: clean }), {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (e) {
      return err(`Conversion failed: ${e instanceof Error ? e.message : e}`, 502)
    }
  }

  // ── ACTION: write-back ────────────────────────────────────────────────────
  if (body.action === 'write-back') {
    const tsx = body.tsx?.trim()
    const changes = body.changes
    if (!tsx) return err('tsx is required')
    if (!changes?.length) return err('changes is required')

    const changeDesc = changes
      .map(c =>
        c.prop === '__text__'
          ? `- Set text content to: "${c.value}" (on element containing: "${c.elText}")`
          : `- Set CSS property "${c.prop}" to "${c.value}" (on element containing text: "${c.elText}")`
      )
      .join('\n')

    const prompt = `Apply these visual edits to the TSX source. Modify ONLY the affected style/className/text values — do not restructure, reformat, or change anything else.

Changes to apply:
${changeDesc}

TSX source:
\`\`\`tsx
${tsx.slice(0, 14000)}
\`\`\`

Return ONLY the complete updated TSX file, no explanation, no markdown fences.`

    try {
      const updated = await callClaude(prompt, apiKey)
      const clean = updated.replace(/^```tsx?\n?/i, '').replace(/\n?```$/, '').trim()
      // Sanity check — must still look like TSX
      if (!clean.includes('export default') && !clean.includes('use client') && !clean.includes('return (')) {
        return err('Write-back produced invalid TSX', 502)
      }
      return new Response(JSON.stringify({ tsx: clean }), {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (e) {
      return err(`Write-back failed: ${e instanceof Error ? e.message : e}`, 502)
    }
  }

  return err(`Unknown action: ${body.action}`)
}
