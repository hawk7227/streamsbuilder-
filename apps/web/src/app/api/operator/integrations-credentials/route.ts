import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({
    data: [
      { provider: 'openai',      configured: !!process.env.OPENAI_API_KEY,      scopes: ['chat', 'images', 'speech', 'whisper'] },
      { provider: 'anthropic',   configured: !!process.env.ANTHROPIC_API_KEY,   scopes: ['chat'] },
      { provider: 'elevenlabs',  configured: !!process.env.ELEVENLABS_API_KEY,  scopes: ['tts', 'voices'] },
      { provider: 'kling',       configured: !!process.env.KLING_ACCESS_KEY && !!process.env.KLING_SECRET_KEY, scopes: ['i2v', 'video'] },
      { provider: 'runway',      configured: !!process.env.RUNWAY_API_KEY,      scopes: ['video'] },
      { provider: 'fal',         configured: !!process.env.FAL_KEY,             scopes: ['image', 'video'] },
      { provider: 'stripe',      configured: !!process.env.STRIPE_SECRET_KEY,   scopes: ['payments', 'webhooks'] },
      { provider: 'resend',      configured: !!process.env.RESEND_API_KEY,      scopes: ['email'] },
      { provider: 'supabase',    configured: !!process.env.NEXT_PUBLIC_SUPABASE_URL, scopes: ['database', 'storage', 'auth'] },
      { provider: 'youtube',     configured: true,                               scopes: ['public transcript/oembed — no key required'] },
    ],
  });
}
