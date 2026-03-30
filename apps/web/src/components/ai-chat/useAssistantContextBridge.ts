"use client";

import { useCallback, useMemo, useState } from 'react';
import type { PendingAttachment } from '@/lib/ai-chat/context/types';
import { buildAssistantRequestContext } from '@/lib/ai-chat/context/requestContextBridge';

export function useAssistantContextBridge(workspaceId?: string, sessionId?: string) {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [voiceTranscript, setVoiceTranscript] = useState('');

  const addAttachment = useCallback((attachment: PendingAttachment) => {
    setAttachments((current) => {
      const dedupeKey = attachment.fileId || `${attachment.kind}:${attachment.payload}`;
      const exists = current.some((item) => (item.fileId || `${item.kind}:${item.payload}`) === dedupeKey);
      return exists ? current : [...current, attachment];
    });
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((current) => current.filter((_, i) => i !== index));
  }, []);

  const clearAttachments = useCallback(() => setAttachments([]), []);
  const clearVoiceTranscript = useCallback(() => setVoiceTranscript(''), []);

  const requestContext = useMemo(
    () => buildAssistantRequestContext({ workspaceId, sessionId, attachments, voiceTranscript }),
    [workspaceId, sessionId, attachments, voiceTranscript],
  );

  return {
    attachments,
    voiceTranscript,
    setVoiceTranscript,
    addAttachment,
    removeAttachment,
    clearAttachments,
    clearVoiceTranscript,
    requestContext,
  };
}
