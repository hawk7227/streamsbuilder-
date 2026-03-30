import type { EnforcementLedgerEntry } from "./types";

export function createLedgerEntry(entry: Omit<EnforcementLedgerEntry, "timestamp">): EnforcementLedgerEntry {
  return {
    ...entry,
    timestamp: new Date().toISOString(),
  };
}
