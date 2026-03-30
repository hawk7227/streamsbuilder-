import type { DomainPack } from "./types";
import { defaultPack } from "./default";

export type { DomainPackOutput } from "./types";

// Domain packs are loaded by niche key. The default pack is niche-agnostic.
// Additional packs (telehealth, ecommerce, saas) extend this with niche-specific rules.
function loadPack(niche?: string): DomainPack {
  // Telehealth and google_ads are handled in pipeline-execution via governance layer.
  // Domain pack layer normalizes for Step 4 input regardless of niche.
  return defaultPack;
}

export function normalizeWithDomainPack(input: unknown): ReturnType<DomainPack["normalize"]> {
  const i = input as Record<string, unknown>;
  const strategy = (i.strategy ?? {}) as Record<string, unknown>;
  const niche = (strategy.niche as string) ?? undefined;
  const pack = loadPack(niche);
  return pack.normalize(input);
}
