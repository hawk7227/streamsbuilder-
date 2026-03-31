import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getSiteConfig } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { prompt?: string; maxTokens?: number };
    const { prompt, maxTokens = 100 } = body;

    if (!prompt) return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OpenAI API key is not configured' }, { status: 500 });

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: getSiteConfig().marketingCopywriterPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    });

    const content = completion.choices[0]?.message?.content ?? '';
    return NextResponse.json({ content });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to generate content';
    console.error('OpenAI API error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
