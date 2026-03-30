import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/team";

export async function POST(request: Request) {
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
      .select("id, workspace_id, role, status, email, is_agency_sub_account, agency_user_id, sub_account_plan")
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

    // Handle agency sub-account invitations
    if (invite.is_agency_sub_account && invite.sub_account_plan) {
      // Check if workspace exists, if not create it
      let workspace;
      if (invite.workspace_id) {
        const { data: existingWorkspace } = await admin
          .from("workspaces")
          .select("id, name, agency_user_id, sub_account_plan, owner_id")
          .eq("id", invite.workspace_id)
          .maybeSingle();
        workspace = existingWorkspace;
      }

      if (!workspace) {
        // Create workspace for the agency sub-account
        const { data: profile } = await admin
          .from("profiles")
          .select("org_name, full_name, email, current_workspace_id")
          .eq("id", user.id)
          .maybeSingle();

        const workspaceName =
          profile?.org_name ??
          profile?.full_name ??
          profile?.email?.split("@")[0] ??
          email.split("@")[0] ??
          "Workspace";

        const userHasPersonalWorkspace = !!profile?.current_workspace_id;

        // Determine workspace owner
        // For agency sub-accounts, agency user can own multiple workspaces
        // If user has personal workspace, use agency user as owner
        // If user doesn't have workspace, they can be owner
        const ownerId = userHasPersonalWorkspace
          ? invite.agency_user_id  // Agency user owns it (can own multiple)
          : user.id;                // User owns it (their first workspace)

        // Create the workspace
        const { data: newWorkspace, error: workspaceError } = await admin
          .from("workspaces")
          .insert({
            name: workspaceName,
            owner_id: ownerId,
            is_agency_sub_account: true,
            agency_user_id: invite.agency_user_id,
            sub_account_plan: invite.sub_account_plan,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("id, name, agency_user_id, sub_account_plan, owner_id")
          .single();

        if (workspaceError) {
          return NextResponse.json(
            { error: workspaceError.message },
            { status: 500 }
          );
        }

        workspace = newWorkspace;

        // Update invitation with workspace_id
        await admin
          .from("workspace_invites")
          .update({
            workspace_id: workspace.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", invite.id);
      }

      // Update user's profile with agency sub-account info
      // Automatically switch to the agency workspace
      const { data: userProfile } = await admin
        .from("profiles")
        .select("current_workspace_id")
        .eq("id", user.id)
        .maybeSingle();

      const userHasPersonalWorkspace = !!userProfile?.current_workspace_id;

      await admin
        .from("profiles")
        .update({
          plan_id: invite.sub_account_plan,
          is_agency_sub_account: true,
          agency_user_id: invite.agency_user_id,
          current_workspace_id: workspace.id, // Automatically select the agency workspace
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      // Add user to workspace
      const { data: existingMember } = await admin
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspace.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existingMember) {
        const memberRole = userHasPersonalWorkspace ? "admin" : "owner";
        
        const { error: memberError } = await admin
          .from("workspace_members")
          .insert({
            workspace_id: workspace.id,
            user_id: user.id,
            role: memberRole,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (memberError) {
          return NextResponse.json({ error: memberError.message }, { status: 500 });
        }

        // If user doesn't have a personal workspace, make them owner
        if (!userHasPersonalWorkspace && workspace.owner_id !== user.id) {
          await admin
            .from("workspaces")
            .update({
              owner_id: user.id,
              updated_at: new Date().toISOString(),
            })
            .eq("id", workspace.id);
        }
      }
    } else {
      // Regular workspace invitation (non-agency)
      if (!invite.workspace_id) {
        return NextResponse.json(
          { error: "Workspace ID is missing from invitation" },
          { status: 400 }
        );
      }

      const { data: existingMember } = await admin
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", invite.workspace_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existingMember) {
        const { error: memberError } = await admin.from("workspace_members").insert({
          workspace_id: invite.workspace_id,
          user_id: user.id,
          role: invite.role,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (memberError) {
          return NextResponse.json({ error: memberError.message }, { status: 500 });
        }
      }
    }

    const now = new Date().toISOString();
    await admin
      .from("workspace_invites")
      .update({
        status: "accepted",
        accepted_user_id: user.id,
        accepted_at: now,
        updated_at: now,
      })
      .eq("id", invite.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to accept invite" },
      { status: 500 }
    );
  }
}
