"use client";

import Link from "next/link";
// import Image from "next/image";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteConfig } from "@/hooks/useSiteConfig";
import { ALL_PLANS, PLAN_ORDER, type PlanKey } from "@/lib/plans";

export default function Sidebar({
  isOpen,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
}: {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  const { user, signOut, plan, limits, usage, usageLoading, membershipRole } =
    useAuth();
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [checkoutError, setCheckoutError] = useState("");
  const [pendingPlan, setPendingPlan] = useState<PlanKey | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const config = useSiteConfig();

  const isActive = (path: string) => pathname === path;
  const currentPlanKey = plan?.key ?? "free";
  const currentPlanIndex = PLAN_ORDER.indexOf(currentPlanKey);

  const availablePlans = useMemo(() => ALL_PLANS, []);
  const generationLimit = usage?.limit ?? limits?.generationsPerMonth ?? 0;
  const isSettingsLocked = membershipRole === "member";
  const generationsUsed = usage?.used ?? 0;
  const isUnlimited = generationLimit === "unlimited";
  const displayLimit = isUnlimited ? "Unlimited" : generationLimit;
  const usagePercent = isUnlimited
    ? 100
    : typeof generationLimit === "number" && generationLimit > 0
    ? Math.min(100, (generationsUsed / generationLimit) * 100)
    : 0;
  const usageText =
    usageLoading && !usage ? "..." : `${generationsUsed} / ${displayLimit}`;

  const handleCheckout = async (planKey: PlanKey) => {
    setCheckoutError("");
    setPendingPlan(planKey);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey, billing }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to start checkout");
      }

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error("Missing checkout session URL");
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : "Unable to start checkout"
      );
      setPendingPlan(null);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    setCheckoutError("");

    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to open billing portal");
      }

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error("Missing portal URL");
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : "Unable to open billing portal"
      );
      setPortalLoading(false);
    }
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 bottom-0 bg-bg-secondary border-r border-border-color flex flex-col z-50 transition-all duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        style={{ width: isCollapsed ? 48 : 260 }}
      >
        <div className={`border-b border-border-color flex items-center ${isCollapsed ? "justify-center p-2" : "p-5 justify-between"}`}>
          {!isCollapsed && (
            <Link href="/" className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center">
                <img src={config.logoUrl} alt="StreamsAI Logo" className="w-full h-full object-cover" />
              </div>
              <span className="text-xl font-bold">{config.appName}</span>
            </Link>
          )}
          <button
            onClick={onToggleCollapse}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors flex-shrink-0"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              {isCollapsed
                ? <><polyline points="9 18 15 12 9 6" /></>
                : <><polyline points="15 18 9 12 15 6" /></>
              }
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto space-y-6">
          <div>
            <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Create
            </div>
            <div className="space-y-1">
              {[
                {
                  name: "Video",
                  href: "/dashboard/video",
                  icon: (
                    <>
                      <polygon points="23 7 16 12 23 17 23 7" />
                      <rect x="1" y="5" width="15" height="14" rx="2" />
                    </>
                  ),
                },
                {
                  name: "Pipelines",
                  href: "/pipeline",
                  icon: (
                    <>
                      <circle cx="6" cy="6" r="3" />
                      <circle cx="6" cy="18" r="3" />
                      <path d="M20 4L8.12 15.88" />
                      <line x1="14.47" y1="14.48" x2="20" y2="20" />
                      <path d="M8.12 8.12L12 12" />
                    </>
                  ),
                },
                {
                  name: "Copilot",
                  href: "/dashboard/copilot",
                  icon: (
                    <>
                      <path d="M12 2a2 2 0 0 1 2 2c0 .74.4 1.39 1 1.73A2.01 2.01 0 0 1 16 4a2 2 0 0 1 2 2 2 2 0 0 1-1.73 1c-.6.34-1 .99-1 1.73a2 2 0 0 1-2 2 2 2 0 0 1-1.73-1c-.34-.6-.99-1-1.73-1a2 2 0 0 1-2-2c0-.74-.4-1.39-1-1.73A2.01 2.01 0 0 1 8 4a2 2 0 0 1 2-2 2 2 0 0 1 1.73 1c.6-.34 1-.99 1-1.73z" />
                      <path d="M22 22l-5.197-5.197" />
                    </>
                  ),
                },
                {
                  name: "Campaigns",
                  href: "/dashboard/campaigns",
                  icon: (
                    <>
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </>
                  ),
                },
                {
                  name: "Images",
                  href: "/dashboard/image",
                  icon: (
                    <>
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </>
                  ),
                },
                {
                  name: "Voice",
                  href: "/dashboard/voice",
                  icon: (
                    <>
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    </>
                  ),
                },
                {
                  name: "Scripts",
                  href: "/dashboard/script",
                  icon: (
                    <>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </>
                  ),
                },
              ].map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-3 rounded-[10px] text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? "bg-accent-indigo/10 text-accent-indigo"
                      : "text-text-secondary hover:bg-bg-tertiary hover:text-white"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-5 h-5"
                  >
                    {item.icon}
                  </svg>
                  {item.name}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Workspace
            </div>
            <div className="space-y-1">
              {[
                {
                  name: "Dashboard",
                  href: "/dashboard",
                  icon: (
                    <>
                      <rect x="3" y="3" width="7" height="7" />
                      <rect x="14" y="3" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" />
                    </>
                  ),
                },
                {
                  name: "Library",
                  href: "/dashboard/library",
                  icon: (
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  ),
                },
                {
                  name: "Team",
                  href: "/dashboard/team",
                  icon: (
                    <>
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </>
                  ),
                },
                {
                  name: "Agency",
                  href: "/dashboard/agency",
                  icon: (
                   <path d="M3 21h18M5 21V7l8-4 8 4v14M8 21v-14l6-3 6 3v14" />
                  ),
                  requiresAgencyPlan: true,
                },
                {
                  name: "Analytics",
                  href: "/dashboard/analytics",
                  icon: (
                    <>
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </>
                  ),
                },
                {
                  name: "Integrations",
                  href: "/dashboard/integrations",
                  icon: (
                    <>
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </>
                  ), 
                },
                {
                  name: "API",
                  href: "/dashboard/api",
                  icon: null, // Icon handled in render loop
                },
              ]
              .filter((item) => {
                // Hide Agency if user doesn't have agency plan (enterprise)
                if (item.requiresAgencyPlan) {
                  return currentPlanKey === "enterprise";
                }
                return true;
              })
              .map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-3 rounded-[10px] text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? "bg-accent-indigo/10 text-accent-indigo"
                      : "text-text-secondary hover:bg-bg-tertiary hover:text-white"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-5 h-5 flex-shrink-0"
                  >
                    {item.name === "Dashboard" && (
                        <>
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                      </>
                    )}
                     {item.name === "Library" && (
                         <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                     )}
                      {item.name === "Team" && (
                         <>
                         <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                         <circle cx="9" cy="7" r="4" />
                         <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                         <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                       </>
                      )}
                      {item.name === "Campaigns" && (
                           <>
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                              <polyline points="22,6 12,13 2,6" />
                           </>
                      )}
                      {item.name === "Copilot" && (
                           <>
                              <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                              <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                              <path d="M16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                           </>
                      )}
                      {item.name === "Agency" && (
                           <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                      )}
                      {item.name === "Analytics" && (
                          <>
                          <line x1="18" y1="20" x2="18" y2="10" />
                          <line x1="12" y1="20" x2="12" y2="4" />
                          <line x1="6" y1="20" x2="6" y2="14" />
                        </>
                      )}
                       {item.name === "Integrations" && (
                         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                            <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
                            <rect x="9" y="9" width="6" height="6"></rect>
                            <line x1="9" y1="1" x2="9" y2="4"></line>
                            <line x1="15" y1="1" x2="15" y2="4"></line>
                            <line x1="9" y1="20" x2="9" y2="23"></line>
                            <line x1="15" y1="20" x2="15" y2="23"></line>
                            <line x1="20" y1="9" x2="23" y2="9"></line>
                            <line x1="20" y1="14" x2="23" y2="14"></line>
                            <line x1="1" y1="9" x2="4" y2="9"></line>
                            <line x1="1" y1="14" x2="4" y2="14"></line>
                         </svg>
                      )}
                      {item.name === "API" && (
                        <>
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </>
                      )}
                  </svg>
                  {item.name}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Account
            </div>
            <div className="space-y-1">
              {isSettingsLocked ? (
                <div className="flex items-center gap-3 px-3 py-3 rounded-[10px] text-sm font-medium text-text-muted cursor-not-allowed opacity-60">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-5 h-5"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Settings
                </div>
              ) : (
                <Link
                  href="/dashboard/settings"
                  className={`flex items-center gap-3 px-3 py-3 rounded-[10px] text-sm font-medium transition-colors ${
                    isActive("/dashboard/settings")
                      ? "bg-accent-indigo/10 text-accent-indigo"
                      : "text-text-secondary hover:bg-bg-tertiary hover:text-white"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-5 h-5"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Settings
                </Link>
              )}
              <button
                onClick={signOut}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-[10px] text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-white text-left"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="w-5 h-5"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign Out
              </button>
            </div>
          </div>
        </nav>

        <div className="p-4 border-t border-border-color">
          <div className="bg-bg-tertiary rounded-xl p-4 mb-3">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[13px] text-text-secondary">
                Generations Used
              </span>
              {usageLoading && !usage ? (
                <span className="h-3 w-16 bg-bg-secondary rounded animate-pulse" />
              ) : (
                <span className="text-[13px] font-semibold">{usageText}</span>
              )}
            </div>
            <div className="h-1.5 bg-bg-primary rounded-full overflow-hidden">
              {usageLoading && !usage ? (
                <div className="h-full w-1/3 bg-bg-secondary animate-pulse" />
              ) : (
                <div
                  className="h-full bg-gradient-to-r from-accent-indigo to-accent-purple"
                  style={{ width: `${usagePercent}%` }}
                />
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsPlanModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 p-2.5 bg-gradient-to-r from-accent-indigo to-accent-purple text-white rounded-[10px] text-[13px] font-semibold transition-all hover:shadow-[0_4px_15px_rgba(99,102,241,0.3)]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-4 h-4"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            View Plans
          </button>
        </div>
      </aside>

      {isPlanModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <button
            type="button"
            onClick={() => setIsPlanModalOpen(false)}
            className="absolute inset-0 bg-black/60"
            aria-label="Close plan dialog"
          />
          <div className="relative w-full max-w-4xl mx-4 bg-bg-secondary border border-border-color rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border-color">
              <div>
                <h2 className="text-xl font-semibold">Plans & Billing</h2>
                <p className="text-sm text-text-secondary">
                  Choose a plan to upgrade your account
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPlanModalOpen(false)}
                className="text-text-muted hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="inline-flex items-center gap-2 bg-bg-tertiary border border-border-color rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setBilling("monthly")}
                  className={`px-4 py-2 text-sm font-medium rounded-lg ${
                    billing === "monthly"
                      ? "bg-white text-black"
                      : "text-text-secondary hover:text-white"
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBilling("yearly")}
                  className={`px-4 py-2 text-sm font-medium rounded-lg ${
                    billing === "yearly"
                      ? "bg-white text-black"
                      : "text-text-secondary hover:text-white"
                  }`}
                >
                  Yearly
                </button>
              </div>
              {user && currentPlanKey !== "free" && (
                <button
                  type="button"
                  onClick={handlePortal}
                  disabled={portalLoading}
                  className="px-4 py-2 rounded-lg border border-border-color text-sm font-medium text-text-secondary hover:text-white hover:border-border-hover disabled:opacity-60"
                >
                  {portalLoading ? "Opening..." : "Manage Billing"}
                </button>
              )}
            </div>

            {checkoutError && (
              <p className="px-6 text-sm text-accent-red mb-4">{checkoutError}</p>
            )}

            <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {availablePlans.map((planOption) => {
                const price = planOption.prices[billing];
                const isCustom = price === null;
                const isCurrent = planOption.key === currentPlanKey;
                const isUpgrade =
                  PLAN_ORDER.indexOf(planOption.key) > currentPlanIndex;
                const isPending = pendingPlan === planOption.key;
                const canCheckout =
                  !!user && isUpgrade && !isCustom && planOption.key !== "enterprise";

                return (
                  <div
                    key={planOption.key}
                    className={`border rounded-2xl p-4 ${
                      isCurrent
                        ? "border-accent-indigo bg-bg-tertiary"
                        : "border-border-color bg-bg-tertiary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-semibold">{planOption.name}</h3>
                      {isCurrent && (
                        <span className="text-[11px] font-semibold text-accent-indigo">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary mb-3">
                      {planOption.description}
                    </p>
                    <div className="mb-3">
                      {isCustom ? (
                        <span className="text-sm text-text-muted">Custom pricing</span>
                      ) : (
                        <span className="text-2xl font-bold">${price}</span>
                      )}
                      {!isCustom && (
                        <span className="text-xs text-text-muted">/mo</span>
                      )}
                    </div>
                    <ul className="space-y-1.5 text-xs text-text-secondary mb-4">
                      {planOption.features.slice(0, 3).map((feature) => (
                        <li key={feature} className="flex items-center gap-2">
                          <span className="text-accent-emerald">•</span>
                          {feature}
                        </li>
                      ))}
                    </ul>
                    {isCurrent ? (
                      <button
                        type="button"
                        disabled
                        className="w-full py-2 rounded-lg bg-bg-primary text-xs font-semibold text-text-muted cursor-not-allowed"
                      >
                        Current Plan
                      </button>
                    ) : planOption.key === "enterprise" ? (
                      <a
                        href={planOption.ctaHref}
                        className="w-full block text-center py-2 rounded-lg border border-border-color text-xs font-semibold text-text-secondary hover:text-white hover:border-border-hover"
                      >
                        Contact Sales
                      </a>
                    ) : canCheckout ? (
                      <button
                        type="button"
                        onClick={() => handleCheckout(planOption.key)}
                        disabled={isPending}
                        className="w-full py-2 rounded-lg bg-gradient-to-r from-accent-indigo to-accent-purple text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {isPending ? "Redirecting..." : "Upgrade"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePortal}
                        className="w-full py-2 rounded-lg border border-border-color text-xs font-semibold text-text-secondary hover:text-white hover:border-border-hover"
                      >
                        Manage Billing
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
