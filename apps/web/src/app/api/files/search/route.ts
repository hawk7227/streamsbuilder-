import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentWorkspaceSelection } from '@/lib/team-server';
import { searchWorkspaceFiles, buildFileContext } from '@/lib/files/retrieval';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);
  const workspaceId = selection.current.workspace.id;
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() || '';
  const format = searchParams.get('format') || 'matches';
  if (!q) return NextResponse.json({ error: 'q is required' }, { status: 400 });

  if (format === 'context') {
    const context = await buildFileContext(workspaceId, q);
    return NextResponse.json({ ok: true, context });
  }

  const matches = await searchWorkspaceFiles(workspaceId, q);
  return NextResponse.json({ ok: true, matches });
}
