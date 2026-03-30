export type PendingAttachmentKind = 'url' | 'image' | 'video' | 'document' | 'audio';

export interface PendingAttachment {
  kind: PendingAttachmentKind;
  label: string;
  payload: string;
  fileId?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  analysis?: Record<string, unknown>;
}

export interface IntegratedChatContextParts {
  attachmentSummary: string;
  urlSummary: string;
  fileSummary: string;
  voiceSummary: string;
  projectSummary: string;
}

export interface AssistantRequestContext {
  workspaceId?: string;
  sessionId?: string;
  attachments?: PendingAttachment[];
  voiceTranscript?: string;
  includeFileContext?: boolean;
  includeUrlContext?: boolean;
  includeProjectMemory?: boolean;
  maxContextChars?: number;
}
