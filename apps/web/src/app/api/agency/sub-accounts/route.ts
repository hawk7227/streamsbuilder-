import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgencyLimits } from "@/lib/plans";
import { normalizeEmail } from "@/lib/team";

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

    // Get all agency sub-account workspaces
    const { data: workspaces, error: workspacesError } = await admin
      .from("workspaces")
      .select("id, name, sub_account_plan, created_at, updated_at")
      .eq("agency_user_id", user.id)
      .eq("is_agency_sub_account", true)
      .order("created_at", { ascending: false });

    if (workspacesError) {
      return NextResponse.json({ error: workspacesError.message }, { status: 500 });
    }

    // Get all agency sub-account invitations
    const { data: invites, error: invitesError } = await admin
      .from("workspace_invites")
      .select("id, workspace_id, email, sub_account_plan, status, created_at, updated_at")
      .eq("agency_user_id", user.id)
      .eq("is_agency_sub_account", true)
      .order("created_at", { ascending: false });

    if (invitesError) {
      return NextResponse.json({ error: invitesError.message }, { status: 500 });
    }

    // Combine workspaces and invites to create sub-accounts list
    const workspaceMap = new Map(
      (workspaces ?? []).map((w) => [w.id, w])
    );

    const subAccounts = (invites ?? []).map((invite) => {
      const workspace = invite.workspace_id ? workspaceMap.get(invite.workspace_id) : null;
      return {
        id: invite.id,
        sub_account_plan: invite.sub_account_plan,
        workspace_id: invite.workspace_id,
        workspace_name: workspace?.name ?? null,
        invitation_email: invite.email,
        status: invite.status,
        created_at: invite.created_at,
        updated_at: invite.updated_at,
      };
    });

    // Count sub-accounts by plan type (excluding cancelled)
    const starterCount = subAccounts.filter(
      (sa) => sa.sub_account_plan === "starter" && sa.status !== "cancelled"
    ).length;
    const professionalCount = subAccounts.filter(
      (sa) => sa.sub_account_plan === "professional" && sa.status !== "cancelled"
    ).length;

    const agencyLimits = getAgencyLimits("enterprise");
    const starterRemaining = agencyLimits
      ? agencyLimits.starterSubAccounts - starterCount
      : 0;
    const professionalRemaining = agencyLimits
      ? agencyLimits.professionalSubAccounts - professionalCount
      : 0;

    return NextResponse.json({
      subAccounts,
      limits: {
        starter: {
          total: agencyLimits?.starterSubAccounts ?? 0,
          used: starterCount,
          remaining: starterRemaining,
        },
        professional: {
          total: agencyLimits?.professionalSubAccounts ?? 0,
          used: professionalCount,
          remaining: professionalRemaining,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch sub-accounts" },
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

    const body = await request.json();
    const { email, plan, workspaceName } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
    }

    if (plan !== "starter" && plan !== "professional") {
      return NextResponse.json(
        { error: "Plan must be 'starter' or 'professional'" },
        { status: 400 }
      );
    }

    const normalizedEmail = normalizeEmail(email);

    // Get agency limits
    const agencyLimits = getAgencyLimits("enterprise");
    if (!agencyLimits) {
      return NextResponse.json(
        { error: "Agency limits not configured" },
        { status: 500 }
      );
    }

    // Count existing sub-accounts by plan type (from workspace_invites)
    const { count: starterCount } = await admin
      .from("workspace_invites")
      .select("id", { count: "exact", head: true })
      .eq("agency_user_id", user.id)
      .eq("is_agency_sub_account", true)
      .eq("sub_account_plan", "starter")
      .neq("status", "cancelled");

    const { count: professionalCount } = await admin
      .from("workspace_invites")
      .select("id", { count: "exact", head: true })
      .eq("agency_user_id", user.id)
      .eq("is_agency_sub_account", true)
      .eq("sub_account_plan", "professional")
      .neq("status", "cancelled");

    // Check limits
    if (plan === "starter" && (starterCount ?? 0) >= agencyLimits.starterSubAccounts) {
      return NextResponse.json(
        { error: `Starter sub-account limit reached (${agencyLimits.starterSubAccounts})` },
        { status: 403 }
      );
    }

    if (
      plan === "professional" &&
      (professionalCount ?? 0) >= agencyLimits.professionalSubAccounts
    ) {
      return NextResponse.json(
        {
          error: `Professional sub-account limit reached (${agencyLimits.professionalSubAccounts})`,
        },
        { status: 403 }
      );
    }

    // Check if email already has a pending invitation
    const { data: existingInvite } = await admin
      .from("workspace_invites")
      .select("id")
      .eq("agency_user_id", user.id)
      .eq("is_agency_sub_account", true)
      .eq("email", normalizedEmail)
      .eq("status", "pending")
      .maybeSingle();

    if (existingInvite) {
      return NextResponse.json(
        { error: "A pending invitation already exists for this email" },
        { status: 409 }
      );
    }

    // Check if user already exists
    const { data: existingUser } = await admin
      .from("profiles")
      .select("id, email, current_workspace_id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    let workspace;
    const workspaceNameToUse = workspaceName || email.split("@")[0] || "Workspace";

    // Always create a NEW workspace for the agency sub-account
    // This will be the client's second workspace (they keep their personal one)
    // Check if agency user already has a workspace
    const { data: agencyWorkspace } = await admin
      .from("workspaces")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (agencyWorkspace) {
      // Agency user already has a workspace - we can't create another with their ID
      // We'll create the workspace when the user accepts the invitation
      workspace = null;
    } else {
      // Agency user doesn't have a workspace - create one with their ID as owner
      // This will be transferred to the client when they accept (if they don't have a workspace)
      // Or the client will be added as admin member if they already have a workspace
      const { data: newWorkspace, error: workspaceError } = await admin
        .from("workspaces")
        .insert({
          name: workspaceNameToUse,
          owner_id: user.id, // Agency user as owner initially
          is_agency_sub_account: true,
          agency_user_id: user.id,
          sub_account_plan: plan,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id, name")
        .single();

      if (workspaceError) {
        return NextResponse.json(
          { error: workspaceError.message },
          { status: 500 }
        );
      }

      workspace = newWorkspace;
    }

    // Create workspace invitation - ALWAYS pending (client must approve)
    // Note: workspace_invites only allows 'admin' or 'member', so we use 'admin'
    // The user will be added as admin member (or owner if they don't have a workspace) when they accept
    const { data: invite, error: inviteError } = await admin
      .from("workspace_invites")
      .insert({
        workspace_id: workspace?.id ?? null, // May be null if workspace will be created on acceptance
        email: normalizedEmail,
        role: "admin", // Use 'admin' since 'owner' is not allowed in workspace_invites
        invited_by: user.id,
        is_agency_sub_account: true,
        agency_user_id: user.id,
        sub_account_plan: plan,
        status: "pending", // Always pending - client must approve
        accepted_user_id: null,
        accepted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id, workspace_id, email, sub_account_plan, status")
      .single();

    if (inviteError) {
      return NextResponse.json(
        { error: inviteError.message },
        { status: 500 }
      );
    }

    // Generate invitation URL
    // For existing users: they can accept via team invitations page
    // For new users: they sign up and accept during signup
    const origin = request.headers.get("origin") ?? new URL(request.url).origin;
    const invitationUrl = existingUser
      ? `${origin}/dashboard/team` // Existing users see it in their invitations
      : workspace
      ? `${origin}/signup?agency_workspace_id=${workspace.id}&plan=${plan}`
      : `${origin}/signup?agency_invite_id=${invite.id}&plan=${plan}`;

    return NextResponse.json({
      subAccount: {
        id: invite.id,
        workspace_id: workspace?.id ?? null,
        workspace_name: workspace?.name ?? workspaceNameToUse,
        invitation_email: invite.email,
        sub_account_plan: invite.sub_account_plan,
        status: invite.status,
        invitation_url: invitationUrl,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create sub-account" },
      { status: 500 }
    );
  }
}
