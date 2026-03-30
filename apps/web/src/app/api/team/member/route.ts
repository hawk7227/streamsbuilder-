import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canAssignRole,
  canInviteMembers,
  canRemoveMember,
  type WorkspaceRole,
} from "@/lib/team";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";

export async function PATCH(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const memberId = typeof payload?.memberId === "string" ? payload.memberId : "";
  const nextRole = payload?.role as WorkspaceRole | undefined;

  if (!memberId) {
    return NextResponse.json({ error: "Member id required" }, { status: 400 });
  }

  if (!nextRole || (nextRole !== "admin" && nextRole !== "member")) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const selection = await getCurrentWorkspaceSelection(admin, user);
    const actor = selection.current;

    if (!canAssignRole(actor.role, nextRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: target, error: targetError } = await admin
      .from("workspace_members")
      .select("id, role, workspace_id, user_id")
      .eq("id", memberId)
      .maybeSingle();

    if (targetError || !target) {
      return NextResponse.json(
        { error: targetError?.message ?? "Member not found" },
        { status: 404 }
      );
    }

    if (target.workspace_id !== actor.workspace.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (target.role === "owner") {
      return NextResponse.json(
        { error: "Owner role cannot be modified" },
        { status: 403 }
      );
    }

    const { error: updateError } = await admin
      .from("workspace_members")
      .update({ role: nextRole, updated_at: new Date().toISOString() })
      .eq("id", memberId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update role" },
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
  const memberId = typeof payload?.memberId === "string" ? payload.memberId : "";
  const memberType = payload?.memberType === "invite" ? "invite" : "member";

  if (!memberId) {
    return NextResponse.json({ error: "Member id required" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const selection = await getCurrentWorkspaceSelection(admin, user);
    const actor = selection.current;

    if (memberType === "invite") {
      if (!canInviteMembers(actor.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const { data: invite, error: inviteError } = await admin
        .from("workspace_invites")
        .select("id, workspace_id")
        .eq("id", memberId)
        .maybeSingle();

      if (inviteError || !invite) {
        return NextResponse.json(
          { error: inviteError?.message ?? "Invite not found" },
          { status: 404 }
        );
      }

      if (invite.workspace_id !== actor.workspace.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const { error: deleteError } = await admin
        .from("workspace_invites")
        .delete()
        .eq("id", memberId);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    const { data: target, error: targetError } = await admin
      .from("workspace_members")
      .select("id, role, workspace_id, user_id")
      .eq("id", memberId)
      .maybeSingle();

    if (targetError || !target) {
      return NextResponse.json(
        { error: targetError?.message ?? "Member not found" },
        { status: 404 }
      );
    }

    if (target.workspace_id !== actor.workspace.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (target.user_id === user.id) {
      return NextResponse.json(
        { error: "You cannot remove your own access" },
        { status: 403 }
      );
    }

    if (target.role === "owner") {
      return NextResponse.json(
        { error: "Owner cannot be removed" },
        { status: 403 }
      );
    }

    if (!canRemoveMember(actor.role, target.role as WorkspaceRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error: deleteError } = await admin
      .from("workspace_members")
      .delete()
      .eq("id", memberId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to remove member" },
      { status: 500 }
    );
  }
}
