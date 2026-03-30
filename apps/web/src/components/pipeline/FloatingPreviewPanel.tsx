'use client';

import React, { useRef, useState, useCallback } from 'react';
import { LivePreviewRenderer } from './LivePreviewRenderer';
import type { ExtractedArtifact } from '@/lib/activity-stream/code-extractor';

interface FloatingPreviewPanelProps {
  artifact: ExtractedArtifact;
  onClose: () => void;
}

export function FloatingPreviewPanel({ artifact, onClose }: FloatingPreviewPanelProps) {
  const [pos, setPos] = useState({ x: window.innerWidth / 2 - 180, y: 80 });
  const [size, setSize] = useState({ w: 360, h: 520 });
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');

  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const onHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    setPos({
      x: dragState.current.origX + (e.clientX - dragState.current.startX),
      y: dragState.current.origY + (e.clientY - dragState.current.startY),
    });
  }, []);

  const onPointerUp = useCallback(() => { dragState.current = null; }, []);

  const resizeState = useRef<{ startX: number; startW: number; startY: number; startH: number } | null>(null);

  const onResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    resizeState.current = { startX: e.clientX, startW: size.w, startY: e.clientY, startH: size.h };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [size]);

  const onResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizeState.current) return;
    const newW = Math.max(280, resizeState.current.startW + (e.clientX - resizeState.current.startX));
    const newH = Math.max(300, resizeState.current.startH + (e.clientY - resizeState.current.startY));
    setSize({ w: newW, h: newH });
  }, []);

  const onResizePointerUp = useCallback(() => { resizeState.current = null; }, []);

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x, top: pos.y,
        width: size.w, height: size.h,
        zIndex: 9000,
        borderRadius: 12,
        border: '1px solid rgba(103,232,249,0.25)',
        background: 'rgba(8,12,33,0.97)',
        boxShadow: '0 18px 60px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(12px)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Header — drag handle */}
      <div
        onPointerDown={onHeaderPointerDown}
        style={{
          cursor: 'grab',
          padding: '8px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(103,232,249,0.04)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: '#67e8f9', letterSpacing: '0.08em', flex: 1 }}>
          ⧉ STREAMS Preview — {artifact.componentName}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['preview', 'code'] as const).map((tab) => (
            <button
              key={tab}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                cursor: 'pointer', textTransform: 'uppercase',
                border: `1px solid ${activeTab === tab ? 'rgba(103,232,249,0.4)' : 'rgba(255,255,255,0.08)'}`,
                background: activeTab === tab ? 'rgba(103,232,249,0.12)' : 'transparent',
                color: activeTab === tab ? '#67e8f9' : '#475569',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {activeTab === 'preview' ? (
          <>
            {previewError && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
                background: 'rgba(127,29,29,0.9)', padding: '6px 10px',
                fontSize: 9, color: '#fecaca', fontFamily: 'monospace',
              }}>
                {previewError}
              </div>
            )}
            <LivePreviewRenderer
              artifact={artifact}
              width={size.w}
              height={size.h - 38}
              onError={setPreviewError}
            />
          </>
        ) : (
          <div style={{
            height: '100%', overflowY: 'auto', padding: 12,
            fontFamily: 'ui-monospace, monospace', fontSize: 10,
            lineHeight: 1.5, color: '#94a3b8',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {artifact.code}
          </div>
        )}
      </div>

      {/* Resize handle — bottom-right corner */}
      <div
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        style={{
          position: 'absolute', bottom: 0, right: 0,
          width: 16, height: 16, cursor: 'nwse-resize',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
          padding: 3,
        }}
      >
        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', lineHeight: 1 }}>⊞</span>
      </div>
    </div>
  );
}
