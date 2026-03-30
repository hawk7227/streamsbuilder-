import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentWorkspaceSelection } from '@/lib/team-server';
import { duplicateFileByType } from '@/lib/files/duplicateByType';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fileId } = await request.json() as { fileId?: string };
  if (!fileId) return NextResponse.json({ error: 'fileId is required' }, { status: 400 });

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);
  const workspaceId = selection.current.workspace.id;
  const duplicate = await duplicateFileByType(fileId, workspaceId, user.id);
  return NextResponse.json({ ok: true, file: duplicate });
}
