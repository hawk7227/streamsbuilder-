import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";
import { type WorkspaceRole } from "@/lib/team";

interface TeamMemberResponse {
  id: string;
  kind: "member" | "invite";
  userId: string | null;
  name: string;
  email: string;
  role: WorkspaceRole;
  status: "active" | "pending";
  lastActiveAt: string | null;
  generations: number;
}

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
    const membership = selection.current;

    const { data: memberRows, error: membersError } = await admin
      .from("workspace_members")
      .select("id, user_id, role, created_at")
      .eq("workspace_id", membership.workspace.id);

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 });
    }

    const userIds = (memberRows ?? [])
      .map((row) => row.user_id)
      .filter(Boolean) as string[];

    const profilesResult = userIds.length
      ? await admin
          .from("profiles")
          .select("id, full_name, email, updated_at")
          .in("id", userIds)
      : { data: [], error: null };

    if (profilesResult.error) {
      return NextResponse.json(
        { error: profilesResult.error.message },
        { status: 500 }
      );
    }

    const profileMap = new Map(
      (profilesResult.data ?? []).map((profile) => [profile.id, profile])
    );

    const activeMembers: TeamMemberResponse[] = (memberRows ?? []).map((row) => {
      const profile = profileMap.get(row.user_id);
      const email = profile?.email ?? "";
      const name =
        profile?.full_name ??
        email.split("@")[0] ??
        `Member ${row.user_id.slice(0, 6)}`;

      return {
        id: row.id,
        kind: "member",
        userId: row.user_id,
        name,
        email,
        role: row.role as WorkspaceRole,
        status: "active",
        lastActiveAt: profile?.updated_at ?? row.created_at ?? null,
        generations: 0,
      };
    });

    const { data: inviteRows, error: invitesError } = await admin
      .from("workspace_invites")
      .select("id, email, role, created_at, status")
      .eq("workspace_id", membership.workspace.id)
      .eq("status", "pending");

    if (invitesError) {
      return NextResponse.json({ error: invitesError.message }, { status: 500 });
    }

    const pendingInvites: TeamMemberResponse[] = (inviteRows ?? []).map((row) => ({
      id: row.id,
      kind: "invite",
      userId: null,
      name: row.email.split("@")[0] ?? "Pending member",
      email: row.email,
      role: row.role as WorkspaceRole,
      status: "pending",
      lastActiveAt: row.created_at ?? null,
      generations: 0,
    }));

    const activeCount = activeMembers.length;
    const pendingCount = pendingInvites.length;
    const totalCount = activeCount + pendingCount;

    // Get workspace details including agency info
    const { data: workspaceDetails } = await admin
      .from("workspaces")
      .select("id, is_agency_sub_account, agency_user_id")
      .eq("id", membership.workspace.id)
      .maybeSingle();

    return NextResponse.json({
      role: membership.role,
      workspace: membership.workspace,
      plan: selection.plan,
      currentWorkspaceId: membership.workspace.id,
      isClientWorkspace: workspaceDetails?.is_agency_sub_account === true && workspaceDetails?.agency_user_id === user.id,
      agencyUserId: workspaceDetails?.agency_user_id ?? null,
      counts: {
        active: activeCount,
        pending: pendingCount,
        total: totalCount,
      },
      members: [...activeMembers, ...pendingInvites],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load team" },
      { status: 500 }
    );
  }
}
