import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";
import { queryLedger, type LedgerAction, type Severity } from "@/lib/governance/ledger";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const selection = await getCurrentWorkspaceSelection(admin, user);
  const workspaceId = selection.current.workspace.id;

  const { searchParams } = new URL(request.url);
  const action   = searchParams.get("action")   as LedgerAction | undefined;
  const severity = searchParams.get("severity") as Severity | undefined;
  const limit    = Number(searchParams.get("limit") ?? "100");
  const after    = searchParams.get("after") ?? undefined;

  const data = await queryLedger({ workspaceId, action, severity, limit, after });
  return NextResponse.json({ data });
}
