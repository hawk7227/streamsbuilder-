'use client';

import React, { useMemo, useRef, useState } from 'react';
import type { PendingAttachment } from '@/lib/ai-chat/context/types';

interface AttachmentRailProps {
  onAdd: (attachment: PendingAttachment) => void;
}

function fileToAttachment(file: File, kind: PendingAttachment['kind'], onAdd: (attachment: PendingAttachment) => void) {
  const mimeType = file.type || undefined;
  if (kind === 'image' || kind === 'video' || kind === 'audio') {
    onAdd({ kind, label: file.name, payload: URL.createObjectURL(file), mimeType, metadata: { size: file.size } });
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    onAdd({ kind, label: file.name, payload: result, mimeType, metadata: { size: file.size } });
  };
  reader.readAsText(file);
}

export function AttachmentRail({ onAdd }: AttachmentRailProps) {
  const [tab, setTab] = useState<PendingAttachment['kind'] | null>(null);
  const [url, setUrl] = useState('');
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const tabs = useMemo(() => ([['url', 'URL'], ['image', 'Image'], ['video', 'Video'], ['document', 'Document'], ['audio', 'Audio']] as const), []);

  return (
    <div className="grid gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
      <div className="flex flex-wrap gap-2">
        {tabs.map(([value, label]) => (
          <button key={value} type="button" onClick={() => setTab(tab === value ? null : value)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${tab === value ? 'border-white/20 bg-white/10 text-white' : 'border-white/10 bg-transparent text-white/65 hover:border-white/20 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'url' ? (
        <div className="flex gap-2">
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Paste a website or YouTube URL" className="flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35" />
          <button type="button" onClick={() => { if (!url.trim()) return; onAdd({ kind: 'url', label: url.trim(), payload: url.trim() }); setUrl(''); setTab(null); }} className="rounded-2xl bg-white px-4 text-sm font-semibold text-[#0A0C10]">Add</button>
        </div>
      ) : null}

      {tab === 'image' ? <button type="button" onClick={() => imageRef.current?.click()} className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-white/75">Select image</button> : null}
      {tab === 'video' ? <button type="button" onClick={() => videoRef.current?.click()} className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-white/75">Select video</button> : null}
      {tab === 'document' ? <button type="button" onClick={() => documentRef.current?.click()} className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-white/75">Select document</button> : null}
      {tab === 'audio' ? <button type="button" onClick={() => audioRef.current?.click()} className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-white/75">Select audio</button> : null}

      <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) fileToAttachment(file, 'image', onAdd); event.currentTarget.value = ''; }} />
      <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) fileToAttachment(file, 'video', onAdd); event.currentTarget.value = ''; }} />
      <input ref={documentRef} type="file" accept=".txt,.md,.json,.csv,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) fileToAttachment(file, 'document', onAdd); event.currentTarget.value = ''; }} />
      <input ref={audioRef} type="file" accept="audio/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) fileToAttachment(file, 'audio', onAdd); event.currentTarget.value = ''; }} />
    </div>
  );
}
