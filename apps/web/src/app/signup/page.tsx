"use client";

import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

function SignupForm() {
  const searchParams = useSearchParams();
  const agencyWorkspaceId = searchParams.get("agency_workspace_id");
  const agencyInviteId = searchParams.get("agency_invite_id");
  const agencyPlan = searchParams.get("plan");
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    orgName: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const supabase = createClient();
  const router = useRouter();
  const { user, updateProfile } = useAuth();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://coral-app-rpgt7.ondigitalocean.app/").replace(/\/$/, "");

  useEffect(() => {
    if (user) {
      router.push("/dashboard");
    }
  }, [user, router]);

  const handleOAuthSignup = async (provider: "google" | "github") => {
    setIsLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${appUrl}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If OTP is already sent, verify it
    if (isOtpSent) {
      setIsLoading(true);
      setError("");

      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: formData.email,
        token: otp,
        type: "email",
      });

      if (verifyError) {
        setError(verifyError.message);
        setIsLoading(false);
        return;
      }

      // After OTP verification, move to step 2
      setIsOtpSent(false);
      setStep(2);
      setIsLoading(false);
      return;
    }

    // Step 1: Create account with password
    if (step === 1) {
      if (!formData.fullName || !formData.email || !formData.password) {
        setError("Please fill in all required fields");
        return;
      }

      if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match");
        return;
      }

      if (formData.password.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }

      setIsLoading(true);
      setError("");

      // Sign up with email and password
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${appUrl}/auth/callback`,
          data: {
            full_name: formData.fullName,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setIsLoading(false);
        return;
      }

      // Check if email confirmation is required
      // If user is created but email is not confirmed, show OTP input
      if (data.user && !data.session) {
        // Email confirmation required - Supabase has already sent confirmation email
        // Show OTP input form for user to verify their email
        setIsOtpSent(true);
        setIsLoading(false);
      } else if (data.session) {
        // User is already logged in (email confirmation disabled)
        // Move to step 2
        setStep(2);
        setIsLoading(false);
      } else {
        setError("Failed to create account. Please try again.");
        setIsLoading(false);
      }
    }
  };

  const handleWorkspaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    if (!formData.orgName || formData.orgName.trim().length === 0) {
      setError("Please enter a workspace name");
      setIsLoading(false);
      return;
    }

    if (user) {
      // If this is an agency invitation, accept it first
      if ((agencyWorkspaceId || agencyInviteId) && agencyPlan) {
        try {
          const response = await fetch("/api/agency/accept-invitation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              ...(agencyWorkspaceId ? { workspace_id: agencyWorkspaceId } : {}),
              ...(agencyInviteId ? { invite_id: agencyInviteId } : {}),
              plan: agencyPlan,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            setError(data?.error ?? "Failed to accept agency invitation");
            setIsLoading(false);
            return;
          }

          // Update profile with full name and workspace name
          const { error: profileError } = await updateProfile({
            full_name: formData.fullName,
            org_name: formData.orgName.trim(),
          });

          if (profileError) {
            setError(profileError);
            setIsLoading(false);
            return;
          }

          // Agency invitation handled, proceed to dashboard
          router.push("/dashboard");
          return;
        } catch (error) {
          setError("Failed to accept agency invitation. Please try again.");
          setIsLoading(false);
          return;
        }
      }

      // Regular signup flow
      // Update profile with full name and workspace name
      const { error: profileError } = await updateProfile({
        full_name: formData.fullName,
        org_name: formData.orgName.trim(),
      });

      if (profileError) {
        setError(profileError);
        setIsLoading(false);
        return;
      }

      // Create workspace with the provided name
      try {
        const response = await fetch("/api/team/ensure", { method: "POST" });
        const data = await response.json();

        if (!response.ok) {
          setError(data?.error ?? "Failed to create workspace");
          setIsLoading(false);
          return;
        }

        // Workspace created successfully, proceed to dashboard
        router.push("/dashboard");
      } catch (error) {
        setError("Failed to create workspace. Please try again.");
        setIsLoading(false);
      }
    } else {
      setError("Please verify your email first");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-bg-primary text-text-primary font-sans">
      {/* Form Panel */}
      <div className="flex-1 flex flex-col justify-center p-12 max-w-[560px] animate-fade-in mx-auto lg:mx-0 w-full">
        <Link href="/" className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-accent-indigo to-accent-purple rounded-xl flex items-center justify-center text-white">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-6 h-6"
            >
              <path d="M12 3l1.912 5.813a2 2 0 001.272 1.272L21 12l-5.816 1.915a2 2 0 00-1.272 1.272L12 21l-1.912-5.813a2 2 0 00-1.272-1.272L3 12l5.816-1.915a2 2 0 001.272-1.272L12 3z" />
            </svg>
          </div>
          <span className="text-2xl font-bold">StreamsAI</span>
        </Link>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-10">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                step === 1
                  ? "bg-accent-indigo text-white"
                  : "bg-accent-emerald text-white"
              }`}
            >
              {step > 1 ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                "1"
              )}
            </div>
          </div>
          <div
            className={`w-[60px] h-0.5 transition-all ${
              step > 1 ? "bg-accent-emerald" : "bg-border-color"
            }`}
          />
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                step === 2
                  ? "bg-accent-indigo text-white"
                  : "bg-bg-secondary border border-border-color text-text-muted"
              }`}
            >
              2
            </div>
          </div>
        </div>

        {step === 1 ? (
          <div className="animate-fade-in">
            {(agencyWorkspaceId || agencyInviteId) && agencyPlan && (
              <div className="mb-6 p-4 bg-accent-indigo/10 border border-accent-indigo/20 rounded-xl">
                <p className="text-sm text-accent-indigo font-medium">
                  🎉 You've been invited to join as a {agencyPlan === "starter" ? "Starter" : "Professional"} plan member!
                </p>
              </div>
            )}
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-2">Create your account</h1>
              <p className="text-text-secondary">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="text-accent-indigo font-medium hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </div>

            <div className="flex gap-3 mb-8">
              <button
                onClick={() => handleOAuthSignup("google")}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-2.5 py-3.5 px-5 bg-bg-secondary border border-border-color rounded-xl font-medium text-sm transition-all hover:bg-bg-tertiary hover:border-border-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google
              </button>
              <button
                onClick={() => handleOAuthSignup("github")}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-2.5 py-3.5 px-5 bg-bg-secondary border border-border-color rounded-xl font-medium text-sm transition-all hover:bg-bg-tertiary hover:border-border-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5 text-white"
                >
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                GitHub
              </button>
            </div>

            <div className="flex items-center gap-4 mb-8">
              <div className="flex-1 h-px bg-border-color"></div>
              <span className="text-xs uppercase tracking-wider text-text-muted font-medium">
                or
              </span>
              <div className="flex-1 h-px bg-border-color"></div>
            </div>

            {!isOtpSent ? (
              <form onSubmit={handleSignup} className="flex flex-col gap-6">
                {error && (
                  <div className="flex items-center gap-2.5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="w-5 h-5 flex-shrink-0"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-secondary">
                    Full name
                  </label>
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) =>
                      setFormData({ ...formData, fullName: e.target.value })
                    }
                    className="w-full px-4 py-3.5 bg-bg-secondary border border-border-color rounded-xl text-text-primary text-[15px] focus:outline-none focus:border-accent-indigo focus:ring-4 focus:ring-accent-indigo/10 transition-all placeholder:text-text-muted"
                    placeholder="John Doe"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-secondary">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="w-full px-4 py-3.5 bg-bg-secondary border border-border-color rounded-xl text-text-primary text-[15px] focus:outline-none focus:border-accent-indigo focus:ring-4 focus:ring-accent-indigo/10 transition-all placeholder:text-text-muted"
                    placeholder="you@company.com"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-secondary">
                    Password
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    className="w-full px-4 py-3.5 bg-bg-secondary border border-border-color rounded-xl text-text-primary text-[15px] focus:outline-none focus:border-accent-indigo focus:ring-4 focus:ring-accent-indigo/10 transition-all placeholder:text-text-muted"
                    placeholder="••••••••"
                    required
                    disabled={isLoading}
                    minLength={6}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-secondary">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) =>
                      setFormData({ ...formData, confirmPassword: e.target.value })
                    }
                    className="w-full px-4 py-3.5 bg-bg-secondary border border-border-color rounded-xl text-text-primary text-[15px] focus:outline-none focus:border-accent-indigo focus:ring-4 focus:ring-accent-indigo/10 transition-all placeholder:text-text-muted"
                    placeholder="••••••••"
                    required
                    disabled={isLoading}
                    minLength={6}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 bg-gradient-to-r from-accent-indigo to-accent-purple text-white rounded-xl font-bold text-base transition-all hover:shadow-[0_8px_30px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none mt-2 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Creating account...
                    </>
                  ) : (
                    <>
                      Create Account
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="w-5 h-5"
                      >
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignup} className="flex flex-col gap-6">
                {/* OTP Verification Form - this will be shown when isOtpSent is true */}
                {/* The actual verification happens in handleSendOtp when step === 2 */}
                {error && (
                  <div className="flex items-center gap-2.5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="w-5 h-5 flex-shrink-0"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {error}
                  </div>
                )}

                <div className="text-center mb-4">
                  <p className="text-text-secondary text-sm mb-2">
                    We sent a verification code to
                  </p>
                  <p className="font-medium text-white">{formData.email}</p>
                  <p className="text-text-muted text-xs mt-2">
                    Please check your email and enter the 8-digit code to verify your account.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-secondary">
                    Verification Code
                  </label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    className="w-full px-4 py-3.5 bg-bg-secondary border border-border-color rounded-xl text-text-primary text-[15px] focus:outline-none focus:border-accent-indigo focus:ring-4 focus:ring-accent-indigo/10 transition-all placeholder:text-text-muted text-center text-2xl tracking-widest font-mono"
                    placeholder="00000000"
                    required
                    disabled={isLoading}
                    maxLength={8}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || otp.length !== 8}
                  className="w-full py-4 bg-gradient-to-r from-accent-indigo to-accent-purple text-white rounded-xl font-bold text-base transition-all hover:shadow-[0_8px_30px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Verifying...
                    </>
                  ) : (
                    <>
                      Verify Code
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="w-5 h-5"
                      >
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      setIsLoading(true);
                      setError("");
                      const { error: resendError } = await supabase.auth.signInWithOtp({
                        email: formData.email,
                        options: {
                          shouldCreateUser: false,
                        },
                      });
                      if (resendError) {
                        setError(resendError.message);
                      } else {
                        setError("");
                        // Show success message briefly
                        const successMsg = "Verification code resent! Please check your email.";
                        setError(successMsg);
                        setTimeout(() => setError(""), 3000);
                      }
                      setIsLoading(false);
                    }}
                    disabled={isLoading}
                    className="text-sm font-medium text-accent-indigo hover:underline text-center disabled:opacity-50"
                  >
                    Resend verification code
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOtpSent(false);
                      setOtp("");
                      setError("");
                    }}
                    className="text-sm font-medium text-accent-indigo hover:underline text-center"
                  >
                    Use a different email
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <div className="animate-fade-in">
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-2">Set up your workspace</h1>
              <p className="text-text-secondary">
                Give your workspace a name to get started
              </p>
            </div>

            <form onSubmit={handleWorkspaceSubmit} className="flex flex-col gap-6">
              {error && (
                <div className="flex items-center gap-2.5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-5 h-5 flex-shrink-0"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-text-secondary">
                  Workspace Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.orgName}
                  onChange={(e) =>
                    setFormData({ ...formData, orgName: e.target.value })
                  }
                  className="w-full px-4 py-3.5 bg-bg-secondary border border-border-color rounded-xl text-text-primary text-[15px] focus:outline-none focus:border-accent-indigo focus:ring-4 focus:ring-accent-indigo/10 transition-all placeholder:text-text-muted"
                  placeholder="Enter your workspace name"
                  required
                  disabled={isLoading}
                  minLength={1}
                />
                <p className="text-xs text-text-muted">
                  This will be the name of your workspace. You can change it later in settings.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="terms"
                  required
                  className="w-5 h-5 mt-0.5 rounded border border-border-color bg-bg-secondary text-accent-indigo focus:ring-accent-indigo/20 focus:ring-offset-0"
                />
                <label
                  htmlFor="terms"
                  className="text-sm text-text-secondary leading-relaxed"
                >
                  I agree to the{" "}
                  <a
                    href="#"
                    className="text-accent-indigo font-medium hover:underline"
                  >
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a
                    href="#"
                    className="text-accent-indigo font-medium hover:underline"
                  >
                    Privacy Policy
                  </a>
                  . I understand that my data will be processed according to these
                  policies.
                </label>
              </div>

              <div className="flex gap-4 mt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 bg-gradient-to-r from-accent-indigo to-accent-purple text-white rounded-xl font-bold text-base transition-all hover:shadow-[0_8px_30px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Creating Account...
                    </>
                  ) : (
                    <>
                      Create Account
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="w-5 h-5"
                      >
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Branding Panel */}
      <div className="hidden lg:flex flex-1 relative bg-gradient-to-br from-[#1a1a2e] to-[#12121a] overflow-hidden items-center justify-center p-16">
        <div className="absolute w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(168,85,247,0.3)_0%,transparent_70%)] rounded-full blur-[80px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse-slow" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px]" />

        <div className="relative z-10 w-full max-w-[500px]">
          <h2 className="text-4xl font-bold leading-[1.3] mb-8">
            Start creating
            <br />
            <span className="bg-gradient-to-br from-[#c084fc] to-[#f472b6] bg-clip-text text-transparent">
              amazing content
            </span>
          </h2>

          <div className="space-y-6 mb-12">
            {[
              {
                title: "10 Free Generations",
                desc: "Start creating immediately with no credit card required",
                icon: (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                ),
              },
              {
                title: "AI Video, Images & More",
                desc: "Access all our powerful AI content tools in one place",
                icon: (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                ),
              },
              {
                title: "Team Collaboration",
                desc: "Invite your team and work together seamlessly",
                icon: (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                ),
              },
            ].map((item, i) => (
              <div key={i} className="flex gap-4">
                <div className="w-10 h-10 rounded-[10px] bg-[#6366f11a] flex items-center justify-center flex-shrink-0 text-accent-indigo">
                  <div className="w-5 h-5">{item.icon}</div>
                </div>
                <div>
                  <h4 className="font-semibold text-base mb-1">{item.title}</h4>
                  <p className="text-text-secondary text-sm">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white/5 border border-border-color rounded-2xl p-6 backdrop-blur-sm">
            <p className="text-[15px] text-text-secondary leading-relaxed mb-5 italic">
              "StreamsAI helped us scale our content production 10x while
              maintaining quality. The AI tools are incredibly powerful yet easy
              to use."
            </p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-indigo to-accent-purple flex items-center justify-center font-bold text-sm">
                SK
              </div>
              <div>
                <h4 className="font-semibold text-sm">Sarah Kim</h4>
                <p className="text-xs text-text-muted">
                  Marketing Director, TechCorp
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen bg-bg-primary text-text-primary font-sans items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-accent-indigo border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-text-secondary">Loading...</p>
          </div>
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
