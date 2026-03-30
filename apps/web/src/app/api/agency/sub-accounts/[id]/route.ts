import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const admin = createAdminClient();

    // Check if user has enterprise plan
    const { data: profile } = await admin
      .from("profiles")
      .select("plan_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.plan_id !== "enterprise") {
      return NextResponse.json(
        { error: "Agency features require Enterprise plan" },
        { status: 403 }
      );
    }

    // Get the workspace invite to verify ownership
    const { data: invite, error: fetchError } = await admin
      .from("workspace_invites")
      .select("id, agency_user_id, status, workspace_id")
      .eq("id", id)
      .eq("is_agency_sub_account", true)
      .maybeSingle();

    if (fetchError || !invite) {
      return NextResponse.json(
        { error: "Sub-account not found" },
        { status: 404 }
      );
    }

    if (invite.agency_user_id !== user.id) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Delete the workspace and all its data (cascades will handle related data)
    if (invite.workspace_id) {
      // Get workspace members to update their profiles
      const { data: members } = await admin
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", invite.workspace_id);

      // Delete the workspace (this will cascade delete:
      // - workspace_members
      // - workspace_invites
      // - generations
      // - generation_usage
      // And set profiles.current_workspace_id to NULL)
      const { error: workspaceDeleteError } = await admin
        .from("workspaces")
        .delete()
        .eq("id", invite.workspace_id)
        .eq("is_agency_sub_account", true)
        .eq("agency_user_id", user.id);

      if (workspaceDeleteError) {
        return NextResponse.json(
          { error: workspaceDeleteError.message },
          { status: 500 }
        );
      }

      // Update user profiles to remove agency sub-account flags
      // Only if this was their current workspace or if they're agency sub-accounts
      if (members && members.length > 0) {
        const userIds = members.map((m) => m.user_id);
        
        // Check which users have this as their current workspace or are agency sub-accounts
        const { data: allProfiles } = await admin
          .from("profiles")
          .select("id, current_workspace_id, is_agency_sub_account, agency_user_id")
          .in("id", userIds);

        // Filter profiles that are affected
        const affectedProfiles = allProfiles?.filter(
          (profile) =>
            profile.current_workspace_id === invite.workspace_id ||
            (profile.is_agency_sub_account && profile.agency_user_id === user.id)
        ) ?? [];

        if (affectedProfiles && affectedProfiles.length > 0) {
          for (const profile of affectedProfiles) {
            const updates: Record<string, unknown> = {
              updated_at: new Date().toISOString(),
            };

            // If this was their current workspace, set it to null
            if (profile.current_workspace_id === invite.workspace_id) {
              updates.current_workspace_id = null;
            }

            // If they're an agency sub-account for this agency, remove the flags
            if (
              profile.is_agency_sub_account &&
              profile.agency_user_id === user.id
            ) {
              updates.is_agency_sub_account = false;
              updates.agency_user_id = null;
              // Reset plan to free if they were on agency plan
              // (You might want to check if they have other subscriptions first)
              const { data: userProfile } = await admin
                .from("profiles")
                .select("plan_id, stripe_subscription_id")
                .eq("id", profile.id)
                .maybeSingle();

              if (
                userProfile &&
                (userProfile.plan_id === "starter" ||
                  userProfile.plan_id === "professional") &&
                !userProfile.stripe_subscription_id
              ) {
                // Only reset to free if they don't have their own subscription
                updates.plan_id = "free";
              }
            }

            await admin.from("profiles").update(updates).eq("id", profile.id);
          }
        }
      }
    }

    // Delete the invitation (if workspace was deleted, this might already be deleted by cascade)
    // But we'll try to delete it anyway to be safe
    const { error: inviteDeleteError } = await admin
      .from("workspace_invites")
      .delete()
      .eq("id", id)
      .eq("agency_user_id", user.id);

    // If invite was already deleted by cascade, that's fine
    if (inviteDeleteError && !inviteDeleteError.message.includes("does not exist")) {
      return NextResponse.json(
        { error: inviteDeleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete sub-account" },
      { status: 500 }
    );
  }
}
