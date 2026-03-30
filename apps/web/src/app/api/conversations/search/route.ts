import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';
  if (!q) return NextResponse.json({ data: [] });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // Search conversation titles first (fast, indexed)
  const { data: titleMatches } = await admin
    .from('assistant_conversations')
    .select('id, title, updated_at')
    .eq('user_id', user.id)
    .ilike('title', `%${q}%`)
    .order('updated_at', { ascending: false })
    .limit(10);

  // Search message content for this user's conversations
  const { data: messageMatches } = await admin
    .from('assistant_messages')
    .select(`
      conversation_id,
      content,
      assistant_conversations!inner (
        id,
        title,
        updated_at,
        user_id
      )
    `)
    .ilike('content', `%${q}%`)
    .eq('assistant_conversations.user_id', user.id)
    .limit(20);

  // Merge and deduplicate by conversation id
  const seen = new Set<string>();
  const results: Array<{ id: string; title: string; date: string; preview: string; updatedAt: string }> = [];
  const now = new Date();

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString();
  };

  for (const c of (titleMatches ?? [])) {
    if (seen.has(c.id as string)) continue;
    seen.add(c.id as string);
    results.push({ id: c.id as string, title: c.title as string, date: formatDate(c.updated_at as string), preview: '', updatedAt: c.updated_at as string });
  }

  for (const m of (messageMatches ?? [])) {
    const conv = (m as unknown as { assistant_conversations: { id: string; title: string; updated_at: string } }).assistant_conversations;
    if (!conv || seen.has(conv.id)) continue;
    seen.add(conv.id);
    // Highlight the matching snippet
    const idx = (m.content as string).toLowerCase().indexOf(q.toLowerCase());
    const start = Math.max(0, idx - 40);
    const snippet = (m.content as string).slice(start, start + 120);
    results.push({ id: conv.id, title: conv.title, date: formatDate(conv.updated_at), preview: snippet, updatedAt: conv.updated_at });
  }

  // Sort by most recent
  results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return NextResponse.json({ data: results.slice(0, 20) });
}
