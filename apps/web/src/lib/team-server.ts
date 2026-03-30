import { DEFAULT_PLAN_KEY, getPlanConfig, type PlanKey } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail, type WorkspaceRole } from "@/lib/team";
import type { User } from "@supabase/supabase-js";

export interface WorkspaceSummary {
  id: string;
  name: string | null;
  ownerId: string;
}

export interface WorkspaceMembership {
  memberId: string;
  role: WorkspaceRole;
  workspace: WorkspaceSummary;
}

export interface WorkspaceMembershipRecord extends WorkspaceMembership {
  createdAt: string | null;
}

export interface WorkspacePlanSummary {
  key: PlanKey;
  name: string;
  limits: {
    teamMembers: number | "unlimited";
  };
}

export interface WorkspaceSelection {
  current: WorkspaceMembership;
  memberships: WorkspaceMembershipRecord[];
  plan: WorkspacePlanSummary;
}

type AdminClient = ReturnType<typeof createAdminClient>;

export const listWorkspaceMemberships = async (
  admin: AdminClient,
  userId: string
): Promise<WorkspaceMembershipRecord[]> => {
  const { data: memberships, error } = await admin
    .from("workspace_members")
    .select("id, role, workspace_id, created_at")
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  if (!memberships || memberships.length === 0) {
    return [];
  }

  const workspaceIds = memberships.map((row) => row.workspace_id);
  const { data: workspaces, error: workspaceError } = await admin
    .from("workspaces")
    .select("id, name, owner_id")
    .in("id", workspaceIds);

  if (workspaceError) {
    throw new Error(workspaceError.message);
  }

  const workspaceMap = new Map(
    (workspaces ?? []).map((workspace) => [workspace.id, workspace])
  );

  return memberships
    .map((row) => {
      const workspace = workspaceMap.get(row.workspace_id);
      if (!workspace) {
        return null;
      }
      return {
        memberId: row.id,
        role: row.role as WorkspaceRole,
        workspace: {
          id: workspace.id,
          name: workspace.name ?? null,
          ownerId: workspace.owner_id,
        },
        createdAt: row.created_at ?? null,
      } as WorkspaceMembershipRecord;
    })
    .filter((entry): entry is WorkspaceMembershipRecord => entry !== null);
};

const ensurePersonalWorkspace = async (admin: AdminClient, user: User) => {
  // First, check if user already owns a workspace (most efficient check)
  const { data: ownedWorkspace } = await admin
    .from("workspaces")
    .select("id, name, owner_id")
    .eq("owner_id", user.id)
    .maybeSingle();

  // If workspace exists, ensure membership and update name if needed
  if (ownedWorkspace) {
    const ensureMembership = async (workspaceId: string, role: WorkspaceRole) => {
      const { error } = await admin.from("workspace_members").upsert(
        {
          workspace_id: workspaceId,
          user_id: user.id,
          role,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,user_id" }
      );

      if (error) {
        throw new Error(error.message);
      }
    };

    // Get profile to check if workspace name should be updated
    const { data: profile } = await admin
      .from("profiles")
      .select("org_name, full_name, email")
      .eq("id", user.id)
      .maybeSingle();

    const email = user.email ? normalizeEmail(user.email) : null;
    const preferredWorkspaceName =
      profile?.org_name ??
      profile?.full_name ??
      profile?.email?.split("@")[0] ??
      email?.split("@")[0] ??
      "Workspace";

    // Update workspace name if it's different from preferred name
    if (ownedWorkspace.name !== preferredWorkspaceName && preferredWorkspaceName !== "Workspace") {
      await admin
        .from("workspaces")
        .update({
          name: preferredWorkspaceName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ownedWorkspace.id);
    }

    await ensureMembership(ownedWorkspace.id, "owner");
    const memberships = await listWorkspaceMemberships(admin, user.id);
    if (memberships.length === 0) {
      throw new Error("Unable to create workspace membership");
    }
    return memberships;
  }

  // Check existing memberships to see if user already has owner role elsewhere
  let memberships = await listWorkspaceMemberships(admin, user.id);
  const hasOwner = memberships.some((entry) => entry.role === "owner");

  if (hasOwner) {
    return memberships;
  }

  // No workspace exists and no owner membership - create new workspace
  const ensureMembership = async (workspaceId: string, role: WorkspaceRole) => {
    const { error } = await admin.from("workspace_members").upsert(
      {
        workspace_id: workspaceId,
        user_id: user.id,
        role,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,user_id" }
    );

    if (error) {
      throw new Error(error.message);
    }
  };

  const email = user.email ? normalizeEmail(user.email) : null;
  const { data: profile } = await admin
    .from("profiles")
    .select("org_name, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const workspaceName =
    profile?.org_name ??
    profile?.full_name ??
    profile?.email?.split("@")[0] ??
    email?.split("@")[0] ??
    "Workspace";

  // Try to create workspace, but if it fails due to unique constraint (race condition),
  // re-check for existing workspace
  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .insert({
      name: workspaceName,
      owner_id: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id, name, owner_id")
    .single();

  // If workspace creation failed, check if it was created by another concurrent request
  if (workspaceError || !workspace) {
    // Re-check for existing workspace (might have been created by concurrent request)
    const { data: existingWorkspace } = await admin
      .from("workspaces")
      .select("id, name, owner_id")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (existingWorkspace) {
      // Workspace was created by another request, use it
      await ensureMembership(existingWorkspace.id, "owner");
      memberships = await listWorkspaceMemberships(admin, user.id);
      if (memberships.length === 0) {
        throw new Error("Unable to create workspace membership");
      }
      return memberships;
    }

    // If still no workspace and error is not a unique constraint violation, throw
    throw new Error(workspaceError?.message ?? "Unable to create workspace");
  }

  await ensureMembership(workspace.id, "owner");

  memberships = await listWorkspaceMemberships(admin, user.id);
  if (memberships.length === 0) {
    throw new Error("Unable to create workspace membership");
  }
  return memberships;
};

const selectCurrentMembership = (
  memberships: WorkspaceMembershipRecord[],
  currentWorkspaceId?: string | null
) => {
  if (currentWorkspaceId) {
    const match = memberships.find(
      (entry) => entry.workspace.id === currentWorkspaceId
    );
    if (match) {
      return match;
    }
  }

  const ownerMembership = memberships.find((entry) => entry.role === "owner");
  if (ownerMembership) {
    return ownerMembership;
  }

  return memberships
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.createdAt ?? 0).getTime();
      const bTime = new Date(b.createdAt ?? 0).getTime();
      return bTime - aTime;
    })[0];
};

export const getCurrentWorkspaceSelection = async (
  admin: AdminClient,
  user: User
): Promise<WorkspaceSelection> => {
  const memberships = await ensurePersonalWorkspace(admin, user);

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  const current = selectCurrentMembership(
    memberships,
    profile?.current_workspace_id ?? null
  );

  if (!current) {
    throw new Error("No workspace membership found");
  }

  if (profile?.current_workspace_id !== current.workspace.id) {
    await admin
      .from("profiles")
      .update({
        current_workspace_id: current.workspace.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
  }

  const plan = await getWorkspacePlan(admin, current.workspace.ownerId);

  return {
    current: {
      memberId: current.memberId,
      role: current.role,
      workspace: current.workspace,
    },
    memberships,
    plan,
  };
};

export const setCurrentWorkspace = async (
  admin: AdminClient,
  user: User,
  workspaceId: string
): Promise<WorkspaceSelection> => {
  let memberships = await ensurePersonalWorkspace(admin, user);
  let current = memberships.find(
    (entry) => entry.workspace.id === workspaceId
  );

  // If workspace not found in memberships, check if user owns it or is the agency user
  if (!current) {
    const { data: workspace } = await admin
      .from("workspaces")
      .select("id, name, owner_id, is_agency_sub_account, agency_user_id")
      .eq("id", workspaceId)
      .maybeSingle();

    if (!workspace) {
      throw new Error("Workspace not found");
    }

    // Check if user is owner or agency user
    const isOwner = workspace.owner_id === user.id;
    const isAgencyUser = workspace.is_agency_sub_account && workspace.agency_user_id === user.id;

    if (isOwner || isAgencyUser) {
      // Add user as member if they're not already a member
      const { data: existingMember } = await admin
        .from("workspace_members")
        .select("id, role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existingMember) {
        // Add as owner if they own it, otherwise as admin
        const role = isOwner ? "owner" : "admin";
        const { error: memberError } = await admin
          .from("workspace_members")
          .insert({
            workspace_id: workspaceId,
            user_id: user.id,
            role,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (memberError) {
          throw new Error(memberError.message);
        }

        // Reload memberships to include the new one
        memberships = await listWorkspaceMemberships(admin, user.id);
        current = memberships.find(
          (entry) => entry.workspace.id === workspaceId
        );
      } else {
        // User is already a member, just find it
        memberships = await listWorkspaceMemberships(admin, user.id);
        current = memberships.find(
          (entry) => entry.workspace.id === workspaceId
        );
      }
    }

    if (!current) {
      throw new Error("Workspace not found for user");
    }
  }

  await admin
    .from("profiles")
    .update({
      current_workspace_id: workspaceId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  const plan = await getWorkspacePlan(admin, current.workspace.ownerId);

  return {
    current: {
      memberId: current.memberId,
      role: current.role,
      workspace: current.workspace,
    },
    memberships,
    plan,
  };
};

export const ensureWorkspaceMembership = async (
  admin: AdminClient,
  user: User
): Promise<WorkspaceMembership> => {
  const selection = await getCurrentWorkspaceSelection(admin, user);
  return selection.current;
};

export const getWorkspacePlan = async (
  admin: AdminClient,
  ownerId: string
): Promise<WorkspacePlanSummary> => {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("plan_id")
    .eq("id", ownerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const plan = getPlanConfig(profile?.plan_id ?? DEFAULT_PLAN_KEY);
  return {
    key: plan.key,
    name: plan.name,
    limits: {
      teamMembers: plan.limits.teamMembers,
    },
  };
};
