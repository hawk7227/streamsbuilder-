"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [teamSize, setTeamSize] = useState(1);
  const [setupProgress, setSetupProgress] = useState(0);
  const [setupStatus, setSetupStatus] = useState("Initializing...");

  const steps = [
    { num: 1, title: "Your Role", desc: "Tell us about yourself" },
    { num: 2, title: "Your Goals", desc: "What do you want to create?" },
    { num: 3, title: "Team Size", desc: "How big is your team?" },
    { num: 4, title: "Setup", desc: "Preparing your workspace" },
  ];

  useEffect(() => {
    if (step === 4) {
      // Simulate setup process
      const statuses = [
        "Creating workspace...",
        "Setting up preferences...",
        "Generating API keys...",
        "Finalizing...",
        "Done!",
      ];
      let progress = 0;
      let statusIndex = 0;

      const interval = setInterval(() => {
        progress += 2;
        if (progress > 100) progress = 100;
        setSetupProgress(progress);

        if (progress % 20 === 0 && statusIndex < statuses.length - 1) {
          statusIndex++;
          setSetupStatus(statuses[statusIndex]);
        }

        if (progress === 100) {
          clearInterval(interval);
        }
      }, 50);

      return () => clearInterval(interval);
    }
  }, [step]);

  const handleNext = () => {
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const toggleGoal = (goal: string) => {
    if (goals.includes(goal)) {
      setGoals(goals.filter((g) => g !== goal));
    } else {
      setGoals([...goals, goal]);
    }
  };

  const isStepValid = () => {
    if (step === 1) return !!role;
    if (step === 2) return goals.length > 0;
    return true;
  };

  return (
    <div className="flex min-h-screen bg-bg-primary text-text-primary font-sans">
      {/* Sidebar Progress */}
      <aside className="hidden lg:flex flex-col w-[320px] bg-bg-secondary border-r border-border-color p-10 h-screen sticky top-0">
        <Link href="/" className="flex items-center gap-3 mb-12">
          <div className="w-11 h-11 bg-gradient-to-br from-accent-indigo to-accent-purple rounded-xl flex items-center justify-center text-white">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-[22px] h-[22px]"
            >
              <path d="M12 3l1.912 5.813a2 2 0 001.272 1.272L21 12l-5.816 1.915a2 2 0 00-1.272 1.272L12 21l-1.912-5.813a2 2 0 00-1.272-1.272L3 12l5.816-1.915a2 2 0 001.272-1.272L12 3z" />
            </svg>
          </div>
          <span className="text-[22px] font-bold">StreamsAI</span>
        </Link>

        <div className="flex-1 space-y-8">
          {steps.map((s) => (
            <div
              key={s.num}
              className={`flex gap-4 relative ${
                step >= s.num ? "text-text-primary" : "text-text-muted opacity-60"
              }`}
            >
              {s.num < steps.length && (
                <div
                  className={`absolute left-[19px] top-[44px] w-0.5 h-[calc(100%-16px)] transition-colors duration-300 ${
                    step > s.num ? "bg-accent-emerald" : "bg-border-color"
                  }`}
                />
              )}
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 transition-all duration-300 ${
                  step === s.num
                    ? "bg-accent-indigo text-white shadow-[0_0_0_4px_rgba(99,102,241,0.2)]"
                    : step > s.num
                    ? "bg-accent-emerald text-white"
                    : "bg-bg-tertiary border-2 border-border-color text-text-muted"
                }`}
              >
                {step > s.num ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="w-[18px] h-[18px]"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  s.num
                )}
              </div>
              <div>
                <h4
                  className={`font-semibold text-[15px] mb-1 transition-colors ${
                    step === s.num ? "text-text-primary" : ""
                  }`}
                >
                  {s.title}
                </h4>
                <p className="text-[13px] text-text-secondary">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-6 border-t border-border-color">
          <p className="text-[13px] text-text-muted">
            Need help?{" "}
            <a href="#" className="text-accent-indigo font-medium hover:underline">
              Contact support
            </a>
          </p>
        </div>
      </aside>

      {/* Mobile Progress */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-bg-secondary border-b border-border-color p-5 z-50">
        <div className="h-1 bg-bg-tertiary rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-gradient-to-r from-accent-indigo to-accent-purple transition-all duration-300"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-[13px]">
          <span className="text-text-secondary font-medium">
            {steps[step - 1].title}
          </span>
          <span className="text-text-muted">Step {step} of 4</span>
        </div>
      </div>

      {/* Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 pt-28 lg:pt-12 min-h-screen">
        <div className="w-full max-w-[560px] animate-fade-in">
          {/* Step 1: Role */}
          {step === 1 && (
            <div className="animate-slide-in">
              <div className="text-center mb-10">
                <div className="w-[72px] h-[72px] rounded-[20px] bg-gradient-to-br from-accent-indigo to-[#4f46e5] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-500/20">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-9 h-9 text-white"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <h1 className="text-[28px] font-bold mb-3">What's your role?</h1>
                <p className="text-text-secondary">
                  This helps us personalize your experience
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                {[
                  {
                    id: "creator",
                    title: "Content Creator",
                    desc: "YouTuber, TikToker, Podcaster",
                    icon: <polygon points="23 7 16 12 23 17 23 7" />,
                  },
                  {
                    id: "marketer",
                    title: "Marketer",
                    desc: "Ads, campaigns, social media",
                    icon: (
                      <>
                        <line x1="18" y1="20" x2="18" y2="10" />
                        <line x1="12" y1="20" x2="12" y2="4" />
                        <line x1="6" y1="20" x2="6" y2="14" />
                      </>
                    ),
                  },
                  {
                    id: "agency",
                    title: "Agency",
                    desc: "Manage multiple clients",
                    icon: (
                      <>
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="3" y1="9" x2="21" y2="9" />
                        <line x1="9" y1="21" x2="9" y2="9" />
                      </>
                    ),
                  },
                  {
                    id: "developer",
                    title: "Developer",
                    desc: "Building apps with our API",
                    icon: (
                      <>
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                      </>
                    ),
                  },
                ].map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setRole(item.id)}
                    className={`bg-bg-secondary border-2 rounded-2xl p-6 cursor-pointer transition-all text-center group hover:bg-bg-tertiary hover:border-border-hover ${
                      role === item.id
                        ? "border-accent-indigo bg-accent-indigo/5"
                        : "border-border-color"
                    }`}
                  >
                    <div
                      className={`w-[52px] h-[52px] rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors ${
                        role === item.id
                          ? "bg-accent-indigo/10 text-accent-indigo"
                          : "bg-bg-tertiary text-text-secondary group-hover:text-text-primary"
                      }`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="w-[26px] h-[26px]"
                      >
                        {item.icon}
                        {item.id === "creator" && (
                          <rect
                            x="1"
                            y="5"
                            width="15"
                            height="14"
                            rx="2"
                            ry="2"
                          />
                        )}
                      </svg>
                    </div>
                    <h3 className="font-semibold text-base mb-1.5">
                      {item.title}
                    </h3>
                    <p className="text-[13px] text-text-muted">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Goals */}
          {step === 2 && (
            <div className="animate-slide-in">
              <div className="text-center mb-10">
                <div className="w-[72px] h-[72px] rounded-[20px] bg-gradient-to-br from-accent-purple to-[#9333ea] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-purple-500/20">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-9 h-9 text-white"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                </div>
                <h1 className="text-[28px] font-bold mb-3">
                  What do you want to create?
                </h1>
                <p className="text-text-secondary">Select all that apply</p>
              </div>

              <div className="space-y-3 mb-10">
                {[
                  {
                    id: "video",
                    title: "Video Content",
                    desc: "YouTube videos, TikToks, ads, product demos",
                  },
                  {
                    id: "voice",
                    title: "Voiceovers & Audio",
                    desc: "Narration, podcasts, voice cloning",
                  },
                  {
                    id: "images",
                    title: "Images & Graphics",
                    desc: "Social media, thumbnails, illustrations",
                  },
                  {
                    id: "scripts",
                    title: "Scripts & Copy",
                    desc: "Blog posts, ad copy, video scripts",
                  },
                ].map((item) => (
                  <div
                    key={item.id}
                    onClick={() => toggleGoal(item.id)}
                    className={`flex items-center gap-4 p-5 bg-bg-secondary border-2 rounded-[14px] cursor-pointer transition-all hover:border-border-hover hover:bg-bg-tertiary ${
                      goals.includes(item.id)
                        ? "border-accent-indigo bg-accent-indigo/5"
                        : "border-border-color"
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        goals.includes(item.id)
                          ? "bg-accent-indigo border-accent-indigo"
                          : "border-border-color bg-transparent"
                      }`}
                    >
                      {goals.includes(item.id) && (
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          className="w-3.5 h-3.5 text-white"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <h4 className="font-semibold text-[15px] mb-0.5">
                        {item.title}
                      </h4>
                      <p className="text-[13px] text-text-muted">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Team Size */}
          {step === 3 && (
            <div className="animate-slide-in">
              <div className="text-center mb-10">
                <div className="w-[72px] h-[72px] rounded-[20px] bg-gradient-to-br from-accent-amber to-[#d97706] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-amber-500/20">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-9 h-9 text-white"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <h1 className="text-[28px] font-bold mb-3">
                  How big is your team?
                </h1>
                <p className="text-text-secondary">
                  This helps us recommend the right plan
                </p>
              </div>

              <div className="bg-bg-secondary border border-border-color rounded-[20px] p-8 mb-10">
                <div className="flex items-center justify-between mb-8">
                  <span className="font-medium">Team members</span>
                  <span className="text-2xl font-bold text-accent-indigo">
                    {teamSize}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={teamSize}
                  onChange={(e) => setTeamSize(parseInt(e.target.value))}
                  className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent-indigo"
                />
                <div className="flex justify-between mt-4 text-xs text-text-muted font-medium">
                  <span>Just me</span>
                  <span>10</span>
                  <span>25</span>
                  <span>50+</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Setup / Success */}
          {step === 4 && (
            <div className="animate-fade-in text-center">
              {setupProgress < 100 ? (
                <div className="bg-bg-secondary border border-border-color rounded-[20px] p-10 mb-10">
                  <div className="w-[120px] h-[120px] relative mx-auto mb-6">
                    <svg className="w-full h-full -rotate-90">
                      <circle
                        cx="60"
                        cy="60"
                        r="54"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        className="text-bg-tertiary"
                      />
                      <circle
                        cx="60"
                        cy="60"
                        r="54"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeLinecap="round"
                        className="text-accent-indigo transition-all duration-300"
                        strokeDasharray={339.292}
                        strokeDashoffset={
                          339.292 - (339.292 * setupProgress) / 100
                        }
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-[28px] font-bold">
                      {Math.round(setupProgress)}%
                    </div>
                  </div>
                  <h3 className="text-lg font-medium mb-2">{setupStatus}</h3>
                  <p className="text-sm text-text-muted">
                    This will just take a moment
                  </p>
                </div>
              ) : (
                <div className="animate-scale-in">
                  <div className="w-[100px] h-[100px] rounded-full bg-gradient-to-br from-accent-emerald to-[#059669] flex items-center justify-center mx-auto mb-8 shadow-lg shadow-emerald-500/20 animate-pulse-slow">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      className="w-[50px] h-[50px] text-white"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h2 className="text-[32px] font-bold mb-3">
                    You're all set!
                  </h2>
                  <p className="text-lg text-text-secondary mb-10">
                    Your workspace is ready. Let's start creating.
                  </p>

                  <div className="flex justify-center gap-10 mb-10">
                    <div className="text-center">
                      <span className="block text-[28px] font-bold text-accent-indigo">
                        Pro
                      </span>
                      <span className="text-sm text-text-muted">
                        Plan Trial
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="block text-[28px] font-bold text-accent-indigo">
                        {teamSize}
                      </span>
                      <span className="text-sm text-text-muted">
                        Team Members
                      </span>
                    </div>
                  </div>

                  <Link
                    href="/dashboard"
                    className="inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-gradient-to-r from-accent-indigo to-accent-purple text-white rounded-xl font-bold text-base transition-all hover:shadow-[0_8px_30px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 min-w-[200px]"
                  >
                    Go to Dashboard
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="w-5 h-5"
                    >
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Navigation Buttons for Step 1-3 */}
          {step < 4 && (
            <div className="flex gap-4">
              {step > 1 && (
                <button
                  onClick={handleBack}
                  className="px-6 py-4 bg-bg-secondary border border-border-color text-text-secondary rounded-xl font-bold text-base transition-all hover:bg-bg-tertiary hover:text-white flex items-center gap-2"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-5 h-5"
                  >
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
              )}
              <button
                onClick={step === 3 ? () => setStep(4) : handleNext}
                disabled={!isStepValid()}
                className="flex-1 py-4 bg-gradient-to-r from-accent-indigo to-accent-purple text-white rounded-xl font-bold text-base transition-all hover:shadow-[0_8px_30px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none flex items-center justify-center gap-2"
              >
                {step === 3 ? "Set Up Workspace" : "Continue"}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="w-5 h-5"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
