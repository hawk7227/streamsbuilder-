export type PlanKey = "free" | "starter" | "professional" | "enterprise";

export type PlanLimitValue = number | "unlimited";

export interface PlanLimits {
  generationsPerMonth: PlanLimitValue;
  maxResolution: "720p" | "1080p" | "4K";
  maxDurationSeconds: PlanLimitValue;
  teamMembers: PlanLimitValue;
  apiAccess: boolean;
  prioritySupport: boolean;
}

export interface AgencyLimits {
  starterSubAccounts: number;
  professionalSubAccounts: number;
}

export interface PlanConfig {
  key: PlanKey;
  name: string;
  description: string;
  cta: string;
  ctaHref: string;
  prices: {
    monthly: number | null;
    yearly: number | null;
  };
  features: string[];
  limits: PlanLimits;
  isPopular?: boolean;
  badge?: string;
  agencyLimits?: AgencyLimits;
}

export const DEFAULT_PLAN_KEY: PlanKey = "free";

export const PLAN_CONFIGS: Record<PlanKey, PlanConfig> = {
  free: {
    key: "free",
    name: "Free",
    description: "Try the platform",
    cta: "Get Started",
    ctaHref: "/signup",
    prices: { monthly: 0, yearly: 0 },
    features: [
      "10 generations/month",
      "720p resolution",
      "5 second max duration",
      "Community support",
    ],
    limits: {
      generationsPerMonth: 10,
      maxResolution: "720p",
      maxDurationSeconds: 5,
      teamMembers: 1,
      apiAccess: false,
      prioritySupport: false,
    },
  },
  starter: {
    key: "starter",
    name: "Starter",
    description: "For individuals",
    cta: "Start Free Trial",
    ctaHref: "/signup",
    prices: { monthly: 29, yearly: 24 },
    features: [
      "100 generations/month",
      "1080p resolution",
      "15 second max duration",
      "3 team members",
      "Email support",
    ],
    limits: {
      generationsPerMonth: 100,
      maxResolution: "1080p",
      maxDurationSeconds: 15,
      teamMembers: 3,
      apiAccess: false,
      prioritySupport: false,
    },
  },
  professional: {
    key: "professional",
    name: "Professional",
    description: "For teams",
    cta: "Start Free Trial",
    ctaHref: "/signup",
    prices: { monthly: 99, yearly: 82 },
    features: [
      "500 generations/month",
      "4K resolution",
      "60 second max duration",
      "10 team members",
      "API access",
      "Priority support",
    ],
    limits: {
      generationsPerMonth: 500,
      maxResolution: "4K",
      maxDurationSeconds: 60,
      teamMembers: 10,
      apiAccess: true,
      prioritySupport: true,
    },
    isPopular: true,
    badge: "Most Popular",
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    description: "For organizations",
    cta: "Contact Sales",
    ctaHref: "#",
    prices: { monthly: 499, yearly: null },
    features: [
      "Unlimited generations",
      "4K resolution",
      "5 minute max duration",
      "Unlimited team members",
      "Custom branding",
      "SSO & dedicated support",
      "Agency dashboard with sub-accounts",
    ],
    limits: {
      generationsPerMonth: "unlimited",
      maxResolution: "4K",
      maxDurationSeconds: 300,
      teamMembers: "unlimited",
      apiAccess: true,
      prioritySupport: true,
    },
    agencyLimits: {
      starterSubAccounts: 5,
      professionalSubAccounts: 2,
    },
  },
};

export const PLAN_ORDER: PlanKey[] = [
  "free",
  "starter",
  "professional",
  "enterprise",
];

export const ALL_PLANS: PlanConfig[] = PLAN_ORDER.map((key) => PLAN_CONFIGS[key]);

export function getPlanConfig(planKey?: string | null): PlanConfig {
  if (!planKey) {
    return PLAN_CONFIGS[DEFAULT_PLAN_KEY];
  }
  const key = planKey as PlanKey;
  return PLAN_CONFIGS[key] ?? PLAN_CONFIGS[DEFAULT_PLAN_KEY];
}

export function getPlanLimits(planKey?: string | null): PlanLimits {
  return getPlanConfig(planKey).limits;
}

export function getAgencyLimits(planKey?: string | null): AgencyLimits | null {
  return getPlanConfig(planKey).agencyLimits ?? null;
}
