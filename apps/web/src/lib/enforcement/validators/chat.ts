import { isStatusOnly } from "../constitution";
import type { ChatValidationInput, ValidationResult } from "../types";

export function validateChatResponse(input: ChatValidationInput): ValidationResult {
  const issues: ValidationResult["issues"] = [];
  const response = input.responseText.trim();
  const request = input.requestText.toLowerCase();
  const userAskedSimple = /\b(simple|simply|just explain|don.?t over format)\b/i.test(request);

  if (isStatusOnly(response)) {
    issues.push({ code: "status_only_response", severity: "error", message: "Status-only replies are forbidden." });
  }

  if (input.mode === "verification") {
    if (!/VERIFIED:/i.test(response) || !/NOT VERIFIED:/i.test(response)) {
      issues.push({ code: "verification_split_missing", severity: "error", message: "Verification mode requires VERIFIED and NOT VERIFIED sections." });
    }
  }

  if ((input.mode === "conversation" || userAskedSimple) && response.length > 650) {
    issues.push({ code: "conversation_overbuilt", severity: "warning", message: "Conversation/simple answer is overbuilt or too long." });
  }

  if ((input.mode === "conversation" || input.mode === "builder" || input.mode === "verification") && !input.streamed) {
    issues.push({ code: "streaming_missing", severity: "warning", message: "Streaming was expected but not used." });
  }

  if (input.mode === "conversation" && /^\s*(1\.|here are|microservices architecture is|in programming,|the difference between)/i.test(response)) {
    issues.push({ code: "documentation_tone", severity: "warning", message: "Conversation mode fell back to documentation-style phrasing." });
  }

  return { ok: issues.every((issue) => issue.severity !== "error"), issues };
}
