import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type MemoryType = 'decision' | 'idea' | 'error' | 'custom' | 'pipeline_run' | 'image_url';

const VALID_TYPES: MemoryType[] = ['decision', 'idea', 'error', 'custom', 'pipeline_run', 'image_url'];

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rawType = String(body.type ?? 'custom');
  const memoryType: MemoryType = VALID_TYPES.includes(rawType as MemoryType)
    ? (rawType as MemoryType)
    : 'custom';

  const content = String(body.content ?? '').trim();
  const title = String(body.title ?? '').trim().slice(0, 200);
  const projectId = String(body.projectId ?? 'streams').trim();
  const conversationId = body.conversationId ? String(body.conversationId) : null;
  const tags = Array.isArray(body.tags) ? (body.tags as string[]).map(String).slice(0, 10) : [projectId];

  if (!content) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('assistant_memory')
    .insert({
      user_id: user.id,
      conversation_id: conversationId,
      memory_type: memoryType,
      key: title || `${memoryType}_${Date.now()}`,
      value: { title, content, projectId },
      tags,
    })
    .select('id, key, memory_type, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId') ?? 'streams';
  const memoryType = searchParams.get('type') ?? undefined;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  let query = admin
    .from('assistant_memory')
    .select('id, memory_type, key, value, tags, created_at')
    .eq('user_id', user.id)
    .contains('tags', [projectId])
    .order('created_at', { ascending: false })
    .limit(50);

  if (memoryType && VALID_TYPES.includes(memoryType as MemoryType)) {
    query = query.eq('memory_type', memoryType);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}
