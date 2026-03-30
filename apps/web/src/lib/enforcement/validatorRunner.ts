import { createLedgerEntry } from "./ledger";
import type { EnforcementLedgerEntry, ValidationResult } from "./types";

export function runValidators(
  category: EnforcementLedgerEntry["category"],
  validators: Array<{ name: string; result: ValidationResult }>,
  metadata?: Record<string, unknown>,
): EnforcementLedgerEntry {
  const issues = validators.flatMap((validator) =>
    validator.result.issues.map((issue) => ({
      ...issue,
      message: `[${validator.name}] ${issue.message}`,
    })),
  );

  return createLedgerEntry({
    category,
    validators: validators.map((validator) => validator.name),
    passed: issues.every((issue) => issue.severity !== "error"),
    issues,
    metadata,
  });
}
