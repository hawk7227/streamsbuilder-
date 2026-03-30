import type { DomainPack, DomainPackOutput } from "./types";

export const defaultPack: DomainPack = {
  normalize(input: unknown): DomainPackOutput {
    const i = input as Record<string, unknown>;
    const strategy = (i.strategy ?? {}) as Record<string, unknown>;
    return {
      conceptId: "concept-1",
      conceptType: "general",
      subjectType: "person",
      subjectCount: 1,
      action: (strategy.action as string) ?? "sitting at home using a smartphone",
      environment: (strategy.environment as string) ?? "ordinary home environment",
      mood: "calm, natural, ordinary",
      realismMode: "human_lifestyle_real",
      requiredProps: [],
      forbiddenProps: [],
      forbiddenScenes: [],
      overlayIntent: {
        headline: "Get started",
        cta: "Learn more",
        textDensityHint: "low",
        titleLengthClass: "short",
        ctaLengthClass: "short",
      },
      validatorPolicy: {
        allowedVisualClaims: ["human presence", "device use"],
        forbiddenVisualClaims: ["guaranteed outcome"],
        forbiddenProps: [],
        forbiddenScenes: [],
        noTextInImage: true,
      },
    };
  },
};
