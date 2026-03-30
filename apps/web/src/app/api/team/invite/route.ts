import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canInviteMembers, normalizeEmail, type WorkspaceRole } from "@/lib/team";
import { getCurrentWorkspaceSelection } from "@/lib/team-server";

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const email = typeof payload?.email === "string" ? normalizeEmail(payload.email) : "";
  const requestedRole = payload?.role as WorkspaceRole | undefined;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  if (!requestedRole || (requestedRole !== "member" && requestedRole !== "admin")) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const selection = await getCurrentWorkspaceSelection(admin, user);
    const membership = selection.current;

    if (!canInviteMembers(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (membership.role === "admin" && requestedRole !== "member") {
      return NextResponse.json(
        { error: "Admins can only invite members" },
        { status: 403 }
      );
    }

    const plan = selection.plan;

    const [{ count: activeCount }, { count: pendingCount }] = await Promise.all([
      admin
        .from("workspace_members")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", membership.workspace.id),
      admin
        .from("workspace_invites")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", membership.workspace.id)
        .eq("status", "pending"),
    ]);

    const totalMembers = (activeCount ?? 0) + (pendingCount ?? 0);
    const teamLimit = plan.limits.teamMembers;

    if (teamLimit !== "unlimited" && totalMembers >= teamLimit) {
      return NextResponse.json(
        { error: "Team member limit reached for your plan" },
        { status: 403 }
      );
    }

    const { data: existingInvite } = await admin
      .from("workspace_invites")
      .select("id")
      .eq("workspace_id", membership.workspace.id)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (existingInvite) {
      return NextResponse.json(
        { error: "This email already has a pending invite" },
        { status: 409 }
      );
    }

    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      const { data: existingMember } = await admin
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", membership.workspace.id)
        .eq("user_id", existingProfile.id)
        .maybeSingle();

      if (existingMember) {
        return NextResponse.json(
          { error: "User is already a team member" },
          { status: 409 }
        );
      }
    }

    const { data: invite, error: inviteError } = await admin
      .from("workspace_invites")
      .insert({
        workspace_id: membership.workspace.id,
        email,
        role: requestedRole,
        invited_by: user.id,
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id, email, role, created_at")
      .single();

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: inviteError?.message ?? "Unable to send invite" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      createdAt: invite.created_at,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send invite" },
      { status: 500 }
    );
  }
}
