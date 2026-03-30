export type AssistantMode = "conversation" | "builder" | "verification" | "execution" | "action";

export interface ValidationIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface EnforcementLedgerEntry {
  category: "chat" | "image" | "video" | "system";
  mode?: AssistantMode;
  validators: string[];
  passed: boolean;
  issues: ValidationIssue[];
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ChatValidationInput {
  mode: AssistantMode;
  requestText: string;
  responseText: string;
  streamed: boolean;
}

export interface ImagePolicyValidationInput {
  originalPrompt: string;
  finalPrompt: string;
  strippedTerms: string[];
  referencesUsed: number;
}

export interface VideoPolicyValidationInput {
  originalPrompt: string;
  finalPrompt: string;
  negativePrompt: string;
}
