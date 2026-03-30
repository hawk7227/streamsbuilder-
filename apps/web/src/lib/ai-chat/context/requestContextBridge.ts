import type { AssistantRequestContext, PendingAttachment } from '@/lib/ai-chat/context/types';

export interface BuildAssistantRequestArgs {
  workspaceId?: string;
  sessionId?: string;
  attachments?: PendingAttachment[];
  voiceTranscript?: string;
}

export function buildAssistantRequestContext(args: BuildAssistantRequestArgs): AssistantRequestContext {
  return {
    workspaceId: args.workspaceId,
    sessionId: args.sessionId,
    attachments: args.attachments ?? [],
    voiceTranscript: args.voiceTranscript?.trim() || undefined,
    includeFileContext: true,
    includeUrlContext: true,
    includeProjectMemory: true,
    maxContextChars: 12000,
  };
}
