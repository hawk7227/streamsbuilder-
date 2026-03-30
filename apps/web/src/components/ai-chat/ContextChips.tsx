"use client";

import type { PendingAttachment } from '@/lib/ai-chat/context/types';

interface ContextChipsProps {
  attachments: PendingAttachment[];
  voiceTranscript?: string;
  onRemoveAttachment?: (index: number) => void;
  onClearVoice?: () => void;
}

export function ContextChips({ attachments, voiceTranscript, onRemoveAttachment, onClearVoice }: ContextChipsProps) {
  if (!attachments.length && !voiceTranscript?.trim()) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((attachment, index) => (
        <div key={`${attachment.kind}:${attachment.fileId || attachment.payload}:${index}`} className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs text-white/80">
          <span className="font-medium uppercase tracking-[0.08em] text-white/45">{attachment.kind}</span>
          <span className="max-w-[200px] truncate">{attachment.label}</span>
          {onRemoveAttachment ? (
            <button type="button" onClick={() => onRemoveAttachment(index)} className="text-white/55 transition hover:text-white">×</button>
          ) : null}
        </div>
      ))}
      {voiceTranscript?.trim() ? (
        <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-50">
          <span className="font-medium uppercase tracking-[0.08em] text-emerald-200/75">voice</span>
          <span className="max-w-[260px] truncate">{voiceTranscript.trim()}</span>
          {onClearVoice ? (
            <button type="button" onClick={onClearVoice} className="text-emerald-100/80 transition hover:text-white">×</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
