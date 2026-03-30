import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // Get conversations with last message preview via a join
  const { data, error } = await admin
    .from('assistant_conversations')
    .select(`
      id,
      title,
      created_at,
      updated_at,
      assistant_messages (
        content,
        role,
        created_at
      )
    `)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = new Date();

  const formatted = (data ?? []).map((conv) => {
    const messages = (conv.assistant_messages ?? []) as Array<{
      role: string;
      content: string;
      created_at: string;
    }>;
    // Use last assistant message as preview, fallback to last user message
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const lastMsg = lastAssistant ?? messages.at(-1);
    const preview = (lastMsg?.content ?? '').slice(0, 120);

    const updated = new Date(conv.updated_at);
    let date = updated.toLocaleDateString();
    if (updated.toDateString() === now.toDateString()) {
      date = 'Today';
    } else {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      if (updated.toDateString() === yesterday.toDateString()) date = 'Yesterday';
    }

    return {
      id: conv.id as string,
      title: conv.title as string,
      date,
      preview,
      updatedAt: conv.updated_at as string,
      messageCount: messages.length,
    };
  });

  return NextResponse.json({ data: formatted });
}
