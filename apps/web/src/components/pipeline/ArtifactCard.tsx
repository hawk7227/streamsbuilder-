'use client';

import React, { useState, useEffect } from 'react';
import type { ExtractedArtifact } from '@/lib/activity-stream/code-extractor';

export type ArtifactDestination = 'iphone1' | 'iphone2' | 'desktop' | 'float';

export interface ArtifactCardProps {
  artifact: ExtractedArtifact;
  isStreaming: boolean;   // true while SSE stream is still open
  autoPreview: boolean;   // auto-detect mode
  onPreview: (destination: ArtifactDestination) => void;
  onViewCode: () => void;
}

const LANG_ICONS: Record<string, string> = {
  jsx: '⚛', tsx: '⚛', react: '⚛',
  html: '🌐',
  javascript: '⬡', typescript: '⬡',
};

const DEST_OPTIONS: Array<{ id: ArtifactDestination; label: string; icon: string }> = [
  { id: 'iphone1', label: 'iPhone #1', icon: '📱' },
  { id: 'iphone2', label: 'iPhone #2', icon: '📱' },
  { id: 'desktop', label: 'Desktop', icon: '🖥' },
  { id: 'float',   label: 'Floating panel', icon: '⧉' },
];

export function ArtifactCard({ artifact, isStreaming, autoPreview, onPreview, onViewCode }: ArtifactCardProps) {
  const [opacity, setOpacity] = useState(0.55);
  const [showDestPicker, setShowDestPicker] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');

  // Fade in to full opacity when streaming completes
  useEffect(() => {
    if (!isStreaming) setOpacity(1);
  }, [isStreaming]);

  // Auto-preview into closest destination (iphone2 = right side, where the chat is)
  useEffect(() => {
    if (!isStreaming && autoPreview && artifact.isComplete) {
      onPreview('iphone2');
    }
  }, [isStreaming, autoPreview, artifact.isComplete, onPreview]);

  const icon = LANG_ICONS[artifact.language] ?? '📄';
  const langLabel = artifact.language.toUpperCase();

  return (
    <div style={{
      opacity,
      transition: 'opacity 300ms ease',
      margin: '4px 0',
      borderRadius: 10,
      border: '1px solid rgba(103,232,249,0.2)',
      background: 'rgba(8,12,33,0.85)',
      overflow: 'hidden',
      backdropFilter: 'blur(8px)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(103,232,249,0.04)',
      }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {artifact.componentName}
          </div>
          <div style={{ fontSize: 9, color: '#475569' }}>
            {langLabel} · {artifact.lineCount} lines
            {isStreaming && <span style={{ marginLeft: 6, color: '#67e8f9' }}>streaming…</span>}
          </div>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 3 }}>
          {(['preview', 'code'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '2px 8px', borderRadius: 5, fontSize: 9, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${activeTab === tab ? 'rgba(103,232,249,0.4)' : 'rgba(255,255,255,0.08)'}`,
                background: activeTab === tab ? 'rgba(103,232,249,0.12)' : 'transparent',
                color: activeTab === tab ? '#67e8f9' : '#475569',
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      {activeTab === 'preview' ? (
        <div style={{ padding: '8px 10px' }}>
          {showDestPicker ? (
            <div>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
                Choose preview destination:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {DEST_OPTIONS.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { setShowDestPicker(false); onPreview(d.id); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                      border: '1px solid rgba(103,232,249,0.2)',
                      background: 'rgba(103,232,249,0.07)',
                      color: '#67e8f9', fontSize: 10, fontWeight: 600,
                    }}
                  >
                    <span>{d.icon}</span>
                    <span>{d.label}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowDestPicker(false)}
                style={{ marginTop: 6, fontSize: 9, color: '#475569', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setShowDestPicker(true)}
                disabled={isStreaming}
                style={{
                  flex: 1, padding: '5px 0', borderRadius: 6, cursor: isStreaming ? 'not-allowed' : 'pointer',
                  border: '1px solid rgba(103,232,249,0.3)',
                  background: isStreaming ? 'rgba(255,255,255,0.03)' : 'rgba(103,232,249,0.1)',
                  color: isStreaming ? '#475569' : '#67e8f9',
                  fontSize: 10, fontWeight: 700,
                }}
              >
                {isStreaming ? 'Streaming...' : '▶ Preview'}
              </button>
              <button
                onClick={onViewCode}
                style={{
                  flex: 1, padding: '5px 0', borderRadius: 6, cursor: 'pointer',
                  border: '1px solid rgba(167,139,250,0.25)',
                  background: 'rgba(167,139,250,0.07)',
                  color: '#a78bfa', fontSize: 10, fontWeight: 700,
                }}
              >
                {'</>'} Code
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Code view — syntax-highlighted, read-only, scrollable */
        <div style={{
          maxHeight: 180, overflowY: 'auto',
          padding: '8px 10px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 10, lineHeight: 1.5,
          color: '#94a3b8',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {artifact.code}
        </div>
      )}
    </div>
  );
}
