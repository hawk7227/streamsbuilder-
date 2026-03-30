import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/team";

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = user.email ? normalizeEmail(user.email) : "";
  if (!email) {
    return NextResponse.json({ error: "User email unavailable" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data: invites, error: inviteError } = await admin
      .from("workspace_invites")
      .select("id, workspace_id, role, invited_by, created_at, is_agency_sub_account, sub_account_plan")
      .eq("email", email)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }

    if (!invites || invites.length === 0) {
      return NextResponse.json({ invites: [] });
    }

    // Filter out invites with null workspace_id that aren't agency sub-accounts
    // (agency sub-accounts can have null workspace_id - workspace created on acceptance)
    const validInvites = invites.filter(
      (invite) => invite.workspace_id || invite.is_agency_sub_account
    );

    const workspaceIds = validInvites
      .map((invite) => invite.workspace_id)
      .filter(Boolean) as string[];
    const inviterIds = validInvites
      .map((invite) => invite.invited_by)
      .filter(Boolean) as string[];

    const [workspacesResult, invitersResult] = await Promise.all([
      workspaceIds.length > 0
        ? admin
            .from("workspaces")
            .select("id, name, owner_id")
            .in("id", workspaceIds)
        : Promise.resolve({ data: [], error: null }),
      inviterIds.length
        ? admin
            .from("profiles")
            .select("id, full_name, email")
            .in("id", inviterIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const { data: workspaces, error: workspaceError } = workspacesResult;
    const { data: inviters } = invitersResult;

    if (workspaceError) {
      return NextResponse.json({ error: workspaceError.message }, { status: 500 });
    }

    const workspaceMap = new Map(
      (workspaces ?? []).map((workspace) => [workspace.id, workspace])
    );
    const inviterMap = new Map(
      (inviters ?? []).map((profile) => [profile.id, profile])
    );

    const formattedInvites = validInvites
      .map((invite) => {
        const workspace = invite.workspace_id
          ? workspaceMap.get(invite.workspace_id)
          : null;
        
        // For agency sub-accounts without workspace, create a placeholder
        const workspaceName = workspace
          ? workspace.name ?? "Workspace"
          : invite.is_agency_sub_account
          ? `Agency Workspace (${invite.sub_account_plan ?? "Unknown"} Plan)`
          : null;

        if (!workspaceName) {
          return null;
        }

        const inviter = invite.invited_by
          ? inviterMap.get(invite.invited_by)
          : null;
        const inviterName =
          inviter?.full_name ??
          inviter?.email?.split("@")[0] ??
          inviter?.email ??
          null;

        return {
          id: invite.id,
          role: invite.role,
          createdAt: invite.created_at ?? null,
          workspace: {
            id: workspace?.id ?? null,
            name: workspaceName,
            ownerId: workspace?.owner_id ?? null,
          },
          invitedBy: inviterName,
          isAgencySubAccount: invite.is_agency_sub_account ?? false,
          subAccountPlan: invite.sub_account_plan ?? null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ invites: formattedInvites });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load invites" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const inviteId = typeof payload?.inviteId === "string" ? payload.inviteId : "";

  if (!inviteId) {
    return NextResponse.json({ error: "Invite id required" }, { status: 400 });
  }

  const email = user.email ? normalizeEmail(user.email) : "";
  if (!email) {
    return NextResponse.json({ error: "User email unavailable" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data: invite, error: inviteError } = await admin
      .from("workspace_invites")
      .select("id, email, status")
      .eq("id", inviteId)
      .maybeSingle();

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: inviteError?.message ?? "Invite not found" },
        { status: 404 }
      );
    }

    if (invite.status !== "pending" || normalizeEmail(invite.email) !== email) {
      return NextResponse.json({ error: "Invite not available" }, { status: 403 });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from("workspace_invites")
      .update({ status: "cancelled", updated_at: now })
      .eq("id", inviteId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to decline invite" },
      { status: 500 }
    );
  }
}
