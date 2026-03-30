import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentWorkspaceSelection } from '@/lib/team-server';
import { ingestUrl } from '@/lib/url/intakeRouter';
import { logUrlIntake } from '@/lib/context/context';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { url } = await request.json() as { url?: string };
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);
  const workspaceId = selection.current.workspace.id;

  const result = await ingestUrl(url);
  await logUrlIntake(workspaceId, user.id, {
    url,
    title: String((result.source as any).title || ''),
    summary: String((result.analysis as any).summary || ''),
    type: result.kind,
  });

  return NextResponse.json({ ok: true, ...result });
}
