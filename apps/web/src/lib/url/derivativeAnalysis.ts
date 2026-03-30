export interface DerivativeAnalysisInput {
  url: string;
  kind: 'website' | 'youtube' | 'document';
  source: Record<string, unknown> | object;
}

export async function analyzeIntakeContent(input: DerivativeAnalysisInput) {
  const content = JSON.stringify(input.source).slice(0, 12000);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      summary: 'OPENAI_API_KEY not set',
      derivativeBrief: '',
      layoutPattern: '',
      keyMessages: [],
      sourceKind: input.kind,
    };
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `Analyze this ${input.kind} intake and return JSON only with keys: summary, keyMessages, layoutPattern, derivativeBrief, callToAction, risks.

Source: ${content}`,
      }],
    }),
  });

  if (!response.ok) throw new Error(`Derivative analysis failed (${response.status})`);
  const data = await response.json() as any;
  const raw = data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(raw);
}
