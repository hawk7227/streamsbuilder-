export type WorkspaceRole = "owner" | "admin" | "member";

export const WORKSPACE_ROLES: WorkspaceRole[] = ["owner", "admin", "member"];

export const canManageSettings = (role: WorkspaceRole | null | undefined) =>
  role === "owner" || role === "admin";

export const canInviteMembers = (role: WorkspaceRole | null | undefined) =>
  role === "owner" || role === "admin";

export const canAssignRole = (
  role: WorkspaceRole | null | undefined,
  nextRole: WorkspaceRole
) => {
  if (!role) return false;
  if (role === "owner") {
    return nextRole === "admin" || nextRole === "member";
  }
  if (role === "admin") {
    return nextRole === "member";
  }
  return false;
};

export const canRemoveMember = (
  role: WorkspaceRole | null | undefined,
  targetRole: WorkspaceRole
) => {
  if (!role) return false;
  if (role === "owner") {
    return true;
  }
  if (role === "admin") {
    return targetRole === "member";
  }
  return false;
};

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
