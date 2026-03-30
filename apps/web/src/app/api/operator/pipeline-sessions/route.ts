import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentWorkspaceSelection } from '@/lib/team-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);
  const workspaceId = selection.current.workspace.id;

  const { data, error } = await admin
    .from('pipeline_jobs')
    .select('id,status,created_at,payload')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(25);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: (data || []).map((row: any) => ({
      id: row.id,
      status: row.status,
      created_at: row.created_at,
      current_step: row.payload?.currentStep || row.payload?.step || null,
      mode: row.payload?.mode || null,
    })),
  });
}
