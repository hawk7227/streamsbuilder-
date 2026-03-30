"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import {
  DEFAULT_PLAN_KEY,
  getPlanConfig,
  getPlanLimits,
  type PlanConfig,
  type PlanKey,
  type PlanLimitValue,
  type PlanLimits,
} from "@/lib/plans";
import type { WorkspaceRole } from "@/lib/team";

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  org_name: string | null;
  plan_id: PlanKey | null;
  current_workspace_id?: string | null;
  created_at: string;
  updated_at: string;
}

type ProfileUpdate = Partial<
  Pick<Profile, "full_name" | "avatar_url" | "org_name" | "plan_id">
>;

interface UsageSummary {
  used: number;
  limit: PlanLimitValue;
  remaining: PlanLimitValue;
  periodStart: string;
  periodEnd: string;
}

interface WorkspaceSummary {
  id: string;
  name: string | null;
  ownerId: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  plan: PlanConfig | null;
  limits: PlanLimits | null;
  usage: UsageSummary | null;
  workspace: WorkspaceSummary | null;
  membershipRole: WorkspaceRole | null;
  loading: boolean;
  profileLoading: boolean;
  usageLoading: boolean;
  workspaceLoading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshUsage: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  incrementUsage: (
    amount?: number
  ) => Promise<{ error: string | null; usage: UsageSummary | null }>;
  updateProfile: (updates: ProfileUpdate) => Promise<{
    error: string | null;
    profile: Profile | null;
  }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [membershipRole, setMembershipRole] = useState<WorkspaceRole | null>(null);
  const [workspacePlanKey, setWorkspacePlanKey] = useState<PlanKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const loadedProfileUserId = useRef<string | null>(null);
  const profileSelect =
    "id, email, full_name, avatar_url, org_name, plan_id, current_workspace_id, created_at, updated_at";

  const ensureProfile = async (currentUser: User, force = false) => {
    if (!force && loadedProfileUserId.current === currentUser.id && profile) {
      return;
    }

    setProfileLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select(profileSelect)
      .eq("id", currentUser.id)
      .maybeSingle();

    if (error) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    if (!data) {
      const { data: createdProfile, error: createError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: currentUser.id,
            email: currentUser.email ?? null,
            full_name:
              currentUser.user_metadata?.full_name ??
              currentUser.user_metadata?.name ??
              null,
            plan_id: DEFAULT_PLAN_KEY,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .select(profileSelect)
        .single();

      if (!createError) {
        setProfile(createdProfile as Profile);
      }
    } else {
      let nextProfile = data as Profile;
      if (!nextProfile.plan_id) {
        const { data: updatedProfile, error: updateError } = await supabase
          .from("profiles")
          .update({
            plan_id: DEFAULT_PLAN_KEY,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentUser.id)
          .select(profileSelect)
          .single();

        if (!updateError && updatedProfile) {
          nextProfile = updatedProfile as Profile;
        }
      }
      setProfile(nextProfile);
    }

    loadedProfileUserId.current = currentUser.id;
    setProfileLoading(false);
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        void ensureProfile(session.user);
      } else {
        setProfile(null);
        setUsage(null);
        setWorkspace(null);
        setMembershipRole(null);
        setWorkspacePlanKey(null);
        setWorkspaceLoading(false);
        loadedProfileUserId.current = null;
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        void ensureProfile(session.user, true);
      } else {
        setProfile(null);
        setUsage(null);
        setWorkspace(null);
        setMembershipRole(null);
        setWorkspacePlanKey(null);
        setWorkspaceLoading(false);
        loadedProfileUserId.current = null;
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setUsage(null);
    setWorkspace(null);
    setMembershipRole(null);
    setWorkspacePlanKey(null);
    setWorkspaceLoading(false);
    loadedProfileUserId.current = null;
    router.push("/");
  };

  const refreshSession = async () => {
    const { data: { session } } = await supabase.auth.refreshSession();
    setSession(session);
    setUser(session?.user ?? null);
    if (session?.user) {
      await ensureProfile(session.user, true);
    } else {
      setProfile(null);
      setUsage(null);
      setWorkspace(null);
      setMembershipRole(null);
      setWorkspacePlanKey(null);
      setWorkspaceLoading(false);
      loadedProfileUserId.current = null;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await ensureProfile(user, true);
    }
  };

  const refreshUsage = useCallback(async () => {
    if (!user) {
      setUsage(null);
      return;
    }

    setUsageLoading(true);

    try {
      const response = await fetch("/api/usage", { method: "GET" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to load usage");
      }

      setUsage(data as UsageSummary);
    } catch {
      setUsage(null);
    } finally {
      setUsageLoading(false);
    }
  }, [user]);

  const refreshWorkspace = useCallback(async () => {
    if (!user) {
      setWorkspace(null);
      setMembershipRole(null);
      setWorkspacePlanKey(null);
      setWorkspaceLoading(false);
      return;
    }

    setWorkspaceLoading(true);
    try {
      const response = await fetch("/api/team/ensure", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to load workspace");
      }

      setWorkspace((data?.workspace ?? null) as WorkspaceSummary | null);
      setMembershipRole((data?.role ?? null) as WorkspaceRole | null);
      setWorkspacePlanKey((data?.plan?.key ?? null) as PlanKey | null);
    } catch {
      setWorkspace(null);
      setMembershipRole(null);
      setWorkspacePlanKey(null);
    } finally {
      setWorkspaceLoading(false);
    }
  }, [user]);

  const incrementUsage = useCallback(
    async (amount = 1) => {
      if (!user) {
        return { error: "No active session", usage: null };
      }

      try {
        const response = await fetch("/api/usage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount }),
        });
        const data = await response.json();

        if (!response.ok) {
          if (data?.usage) {
            setUsage(data.usage as UsageSummary);
          }
          return { error: data?.error ?? "Unable to update usage", usage: null };
        }

        setUsage(data as UsageSummary);
        return { error: null, usage: data as UsageSummary };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unable to update usage",
          usage: null,
        };
      }
    },
    [user]
  );

  useEffect(() => {
    if (!user) {
      setUsage(null);
      return;
    }

    void refreshUsage();
  }, [user, profile?.plan_id, workspace?.id, refreshUsage]);

  useEffect(() => {
    if (!user) {
      setWorkspace(null);
      setMembershipRole(null);
      setWorkspacePlanKey(null);
      setWorkspaceLoading(false);
      return;
    }

    void refreshWorkspace();
  }, [user, refreshWorkspace]);

  const updateProfile = async (updates: ProfileUpdate) => {
    if (!user) {
      return { error: "No active session", profile: null };
    }

    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email: user.email ?? null,
          ...updates,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select(profileSelect)
      .single();

    if (error) {
      return { error: error.message, profile: null };
    }

    setProfile(data as Profile);
    return { error: null, profile: data as Profile };
  };

  const effectivePlanKey =
    workspacePlanKey ?? profile?.plan_id ?? DEFAULT_PLAN_KEY;
  const plan = user ? getPlanConfig(effectivePlanKey) : null;
  const limits = plan ? getPlanLimits(plan.key) : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        plan,
        limits,
        usage,
        workspace,
        membershipRole,
        loading,
        profileLoading,
        usageLoading,
        workspaceLoading,
        signOut,
        refreshSession,
        refreshProfile,
        refreshUsage,
        refreshWorkspace,
        incrementUsage,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
