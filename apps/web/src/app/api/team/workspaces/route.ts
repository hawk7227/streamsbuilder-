import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentWorkspaceSelection,
  setCurrentWorkspace,
} from "@/lib/team-server";

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const selection = await getCurrentWorkspaceSelection(admin, user);

    return NextResponse.json({
      currentWorkspaceId: selection.current.workspace.id,
      currentRole: selection.current.role,
      workspaces: selection.memberships.map((entry) => ({
        workspace: entry.workspace,
        role: entry.role,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load workspaces" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const workspaceId =
    typeof payload?.workspaceId === "string" ? payload.workspaceId : "";

  if (!workspaceId) {
    return NextResponse.json(
      { error: "Workspace id required" },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const selection = await setCurrentWorkspace(admin, user, workspaceId);

    return NextResponse.json({
      currentWorkspaceId: selection.current.workspace.id,
      currentRole: selection.current.role,
      workspaces: selection.memberships.map((entry) => ({
        workspace: entry.workspace,
        role: entry.role,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update workspace" },
      { status: 500 }
    );
  }
}
