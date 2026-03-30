import type { AssistantRequestContext, IntegratedChatContextParts, PendingAttachment } from '@/lib/ai-chat/context/types';

function truncate(value: string, max = 12000): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function summarizeAttachments(attachments: PendingAttachment[]): string {
  if (!attachments.length) return '';
  return `### Attachments

${attachments.map((attachment, index) => {
    const lines = [
      `Attachment ${index + 1}: ${attachment.label}`,
      `Kind: ${attachment.kind}`,
      attachment.mimeType ? `MIME: ${attachment.mimeType}` : '',
      attachment.fileId ? `File ID: ${attachment.fileId}` : '',
      attachment.analysis ? `Analysis: ${truncate(JSON.stringify(attachment.analysis), 800)}` : '',
      attachment.kind !== 'url' && attachment.payload ? `Payload: ${truncate(attachment.payload, 1400)}` : '',
    ].filter(Boolean);
    return lines.join('\n');
  }).join('\n\n---\n\n')}`;
}

function summarizeUrls(attachments: PendingAttachment[]): string {
  const urls = attachments.filter((attachment) => attachment.kind === 'url');
  if (!urls.length) return '';
  return `### URLs

${urls.map((attachment, index) => [
    `URL ${index + 1}: ${attachment.payload}`,
    attachment.analysis ? `Analysis: ${truncate(JSON.stringify(attachment.analysis), 1200)}` : '',
  ].filter(Boolean).join('\n')).join('\n\n---\n\n')}`;
}

function summarizeFiles(attachments: PendingAttachment[]): string {
  const files = attachments.filter((attachment) => attachment.kind !== 'url');
  if (!files.length) return '';
  return `### Files

${files.map((attachment, index) => [
    `File ${index + 1}: ${attachment.label}`,
    `Kind: ${attachment.kind}`,
    attachment.mimeType ? `MIME: ${attachment.mimeType}` : '',
    attachment.metadata ? `Metadata: ${truncate(JSON.stringify(attachment.metadata), 800)}` : '',
  ].filter(Boolean).join('\n')).join('\n\n---\n\n')}`;
}

export async function buildIntegratedChatContext(requestContext: AssistantRequestContext): Promise<IntegratedChatContextParts> {
  const attachments = requestContext.attachments ?? [];
  return {
    attachmentSummary: summarizeAttachments(attachments),
    urlSummary: requestContext.includeUrlContext === false ? '' : summarizeUrls(attachments),
    fileSummary: requestContext.includeFileContext === false ? '' : summarizeFiles(attachments),
    voiceSummary: requestContext.voiceTranscript ? `### Voice transcript

${truncate(requestContext.voiceTranscript, 3000)}` : '',
    projectSummary: [
      requestContext.workspaceId ? `Workspace ID: ${requestContext.workspaceId}` : '',
      requestContext.sessionId ? `Session ID: ${requestContext.sessionId}` : '',
    ].filter(Boolean).join('\n'),
  };
}

export function formatIntegratedContext(context: IntegratedChatContextParts): string {
  return [context.projectSummary, context.attachmentSummary, context.urlSummary, context.fileSummary, context.voiceSummary]
    .filter(Boolean)
    .join('\n\n');
}
