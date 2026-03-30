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

  try {
    const body = await request.json();
    const { workspace_id, invite_id, plan } = body;

    if (!plan || (plan !== "starter" && plan !== "professional")) {
      return NextResponse.json(
        { error: "Valid plan is required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const userEmail = user.email ? normalizeEmail(user.email) : null;

    if (!userEmail) {
      return NextResponse.json(
        { error: "User email unavailable" },
        { status: 400 }
      );
    }

    let workspace;
    let invite;

    // If workspace_id is provided, find the workspace
    if (workspace_id) {
      const { data: foundWorkspace, error: workspaceError } = await admin
        .from("workspaces")
        .select("id, name, agency_user_id, sub_account_plan, is_agency_sub_account, owner_id")
        .eq("id", workspace_id)
        .eq("is_agency_sub_account", true)
        .maybeSingle();

      if (workspaceError || !foundWorkspace) {
        return NextResponse.json(
          { error: "Invalid workspace or not an agency sub-account" },
          { status: 404 }
        );
      }

      workspace = foundWorkspace;

      // Find the invitation by workspace_id
      const { data: foundInvite, error: inviteError } = await admin
        .from("workspace_invites")
        .select("id, workspace_id, email, status, agency_user_id, sub_account_plan")
        .eq("workspace_id", workspace_id)
        .eq("is_agency_sub_account", true)
        .eq("email", userEmail)
        .maybeSingle();

      if (inviteError || !foundInvite) {
        return NextResponse.json(
          { error: "Invitation not found" },
          { status: 404 }
        );
      }

      invite = foundInvite;
    } else if (invite_id) {
      // If invite_id is provided, find the invitation first
      const { data: foundInvite, error: inviteError } = await admin
        .from("workspace_invites")
        .select("id, workspace_id, email, status, agency_user_id, sub_account_plan")
        .eq("id", invite_id)
        .eq("is_agency_sub_account", true)
        .eq("email", userEmail)
        .maybeSingle();

      if (inviteError || !foundInvite) {
        return NextResponse.json(
          { error: "Invitation not found" },
          { status: 404 }
        );
      }

      invite = foundInvite;

      // If workspace_id exists, find it
      if (foundInvite.workspace_id) {
        const { data: foundWorkspace, error: workspaceError } = await admin
          .from("workspaces")
          .select("id, name, agency_user_id, sub_account_plan, is_agency_sub_account, owner_id")
          .eq("id", foundInvite.workspace_id)
          .maybeSingle();

        if (!workspaceError && foundWorkspace) {
          workspace = foundWorkspace;
        }
      }
    } else {
      return NextResponse.json(
        { error: "Either workspace_id or invite_id is required" },
        { status: 400 }
      );
    }

    if (invite.status !== "pending") {
      return NextResponse.json(
        { error: "This invitation is no longer valid" },
        { status: 403 }
      );
    }

    // If workspace doesn't exist yet, create it
    if (!workspace) {
      // Get user's profile for workspace name
      const { data: profile } = await admin
        .from("profiles")
        .select("org_name, full_name, email")
        .eq("id", user.id)
        .maybeSingle();

      const workspaceName =
        profile?.org_name ??
        profile?.full_name ??
        profile?.email?.split("@")[0] ??
        userEmail.split("@")[0] ??
        "Workspace";

      // Check if user already has a workspace
      const { data: userProfileCheck } = await admin
        .from("profiles")
        .select("current_workspace_id")
        .eq("id", user.id)
        .maybeSingle();

      const userHasPersonalWorkspace = !!userProfileCheck?.current_workspace_id;

      // Determine owner: if user has personal workspace, agency user owns it
      // (agency users can own multiple workspaces for different clients)
      // If user doesn't have workspace, they can own this one
      const ownerId = userHasPersonalWorkspace
        ? invite.agency_user_id
        : user.id;

      // Create workspace
      const { data: newWorkspace, error: workspaceCreateError } = await admin
        .from("workspaces")
        .insert({
          name: workspaceName,
          owner_id: ownerId,
          is_agency_sub_account: true,
          agency_user_id: invite.agency_user_id,
          sub_account_plan: plan,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id, name, agency_user_id, sub_account_plan, owner_id")
        .single();

      if (workspaceCreateError) {
        return NextResponse.json(
          { error: workspaceCreateError.message },
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

    // Check if user already has a workspace (their personal one)
    const { data: userProfile } = await admin
      .from("profiles")
      .select("id, current_workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    const userHasPersonalWorkspace = !!userProfile?.current_workspace_id;

    // Update user's profile with the sub-account plan
    // Automatically switch to the agency workspace
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        plan_id: plan,
        is_agency_sub_account: true,
        agency_user_id: workspace.agency_user_id,
        current_workspace_id: workspace.id, // Automatically select the agency workspace
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    // Add user to workspace as member
    // If they already have a workspace, add as admin (they can't own two workspaces)
    // If they don't have a workspace, they can become owner
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
        return NextResponse.json(
          { error: memberError.message },
          { status: 500 }
        );
      }

      // If user doesn't have a personal workspace, make them owner of this one
      // and set it as their current workspace
      if (!userHasPersonalWorkspace && workspace.owner_id !== user.id) {
        await admin
          .from("workspaces")
          .update({
            owner_id: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", workspace.id);

        await admin
          .from("profiles")
          .update({
            current_workspace_id: workspace.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
      }
    }

    // Update invitation status to accepted
    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from("workspace_invites")
      .update({
        status: "accepted",
        accepted_user_id: user.id,
        accepted_at: now,
        updated_at: now,
      })
      .eq("id", invite.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      plan: plan,
      workspace_id: workspace.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to accept invitation" },
      { status: 500 }
    );
  }
}
