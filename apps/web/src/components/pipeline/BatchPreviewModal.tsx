'use client';

import React, { useRef } from 'react';
import type { PlatformId, ViewId } from '@/lib/platform-views/index';
import { PLATFORMS, PLATFORM_MAP } from '@/lib/platform-views/index';
import { PlatformViewer } from '@/components/pipeline/PlatformViewer';

interface ConceptSlot {
  id: string;
  label: string;
  image: string | null;
  video: string | null;
  headline?: string;
}

interface BatchPreviewModalProps {
  open: boolean;
  onClose: () => void;
  platformId: PlatformId | null;
  viewId: ViewId | null;
  concepts: ConceptSlot[];
  nicheId: string;
  copyOutput?: string;
  strategyOutput?: string;
  wireframe: boolean;
  showSafeZone: boolean;
  onPromoteToConcept: (conceptId: string) => void;
}

// iPhone 15 Pro Max aspect ratio for the mini frames in batch mode
const BATCH_PHONE_W = 200;
const BATCH_PHONE_H = Math.round(BATCH_PHONE_W * (159.9 / 76.7));

export function BatchPreviewModal({
  open, onClose, platformId, viewId, concepts,
  nicheId, copyOutput, strategyOutput,
  wireframe, showSafeZone, onPromoteToConcept,
}: BatchPreviewModalProps) {
  const vidRefs = [
    useRef<HTMLVideoElement>(null),
    useRef<HTMLVideoElement>(null),
    useRef<HTMLVideoElement>(null),
  ];

  if (!open) return null;

  const platform = platformId ? PLATFORM_MAP[platformId] : null;
  const view = platform?.views.find(v => v.id === viewId);
  const S = BATCH_PHONE_W / 430;

  // Body dimensions same formula as IPhoneFrame
  const bodyW = BATCH_PHONE_W * (436 / 430);
  const bodyH = BATCH_PHONE_H;
  const bodyRadius = Math.round(47 * S);
  const screenRadius = Math.round(55 * S);
  const bezel = Math.round(3 * S);
  const diW = Math.round(126 * S);
  const diH = Math.round(37 * S);
  const diTop = Math.round(12 * S);
  const homeW = Math.round(134 * S);
  const homeH = Math.max(2, Math.round(5 * S));
  const homeBottom = Math.round(8 * S);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'rgba(10,12,20,0.98)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20,
          padding: 28,
          width: '100%', maxWidth: 900,
          maxHeight: '90vh',
          overflow: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
              Batch Preview
              {platform && <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 400 }}> — {platform.name}{view ? ` · ${view.label}` : ''}</span>}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>
              All 3 concepts · click any to promote to iPhone #1
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {/* Platform selector summary */}
            {platform && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '4px 10px' }}>
                {platform.name} · {view?.label ?? 'All views'}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >✕</button>
          </div>
        </div>

        {/* 3-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, justifyItems: 'center' }}>
          {concepts.map((concept, idx) => (
            <div key={concept.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              {/* Label */}
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {concept.label}
              </div>

              {/* Mini iPhone frame */}
              <div
                style={{
                  position: 'relative',
                  width: bodyW,
                  height: bodyH,
                  background: 'linear-gradient(160deg,#2c2c2e 0%,#1c1c1e 40%,#141416 100%)',
                  borderRadius: bodyRadius,
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.18), inset 0 0 0 3px #0a0a0c, 0 16px 48px rgba(0,0,0,0.7)',
                  cursor: 'pointer',
                  transition: 'transform 150ms, box-shadow 150ms',
                  flexShrink: 0,
                }}
                onClick={() => {
                  onPromoteToConcept(concept.id);
                  onClose();
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.03)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 2px rgba(103,232,249,0.5), inset 0 0 0 3px #0a0a0c, 0 20px 60px rgba(0,0,0,0.8)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 1px rgba(255,255,255,0.18), inset 0 0 0 3px #0a0a0c, 0 16px 48px rgba(0,0,0,0.7)';
                }}
              >
                {/* Screen */}
                <div style={{
                  position: 'absolute',
                  inset: bezel,
                  borderRadius: screenRadius,
                  overflow: 'hidden',
                  background: '#000',
                }}>
                  {platformId && viewId ? (
                    <PlatformViewer
                      platformId={platformId}
                      viewId={viewId}
                      imageUrl={concept.image}
                      videoUrl={concept.video}
                      vidRef={vidRefs[idx]}
                      conceptId={concept.id}
                      nicheId={nicheId}
                      copyOutput={copyOutput}
                      strategyOutput={strategyOutput}
                      conceptHeadline={concept.headline}
                      wireframe={wireframe}
                      showSafeZone={showSafeZone}
                      scale={S}
                    />
                  ) : (
                    // No platform selected — raw content
                    <div style={{ position: 'absolute', inset: 0 }}>
                      {concept.video
                        ? <video ref={vidRefs[idx]} src={concept.video} muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : concept.image
                          ? <img src={concept.image} alt={concept.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div style={{ position: 'absolute', inset: 0, background: '#0d0d12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 9, color: '#334155' }}>No content</span>
                            </div>
                      }
                    </div>
                  )}

                  {/* Dynamic Island */}
                  <div style={{
                    position: 'absolute', top: diTop, left: '50%', transform: 'translateX(-50%)',
                    width: diW, height: diH, background: '#000', borderRadius: diH / 2,
                    pointerEvents: 'none', zIndex: 50,
                  }} />

                  {/* Home indicator */}
                  <div style={{
                    position: 'absolute', bottom: homeBottom, left: '50%', transform: 'translateX(-50%)',
                    width: homeW, height: homeH, background: 'rgba(255,255,255,0.55)', borderRadius: homeH,
                    pointerEvents: 'none', zIndex: 50,
                  }} />
                </div>
              </div>

              {/* Promote button */}
              <button
                type="button"
                onClick={() => { onPromoteToConcept(concept.id); onClose(); }}
                style={{
                  fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, padding: '5px 14px', cursor: 'pointer',
                  transition: 'background 150ms, color 150ms',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(103,232,249,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#67e8f9'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)'; }}
              >
                → Promote to iPhone #1
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Click any frame to promote · ESC to close</span>
          <button
            type="button"
            onClick={onClose}
            style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 16px', cursor: 'pointer' }}
          >Close</button>
        </div>
      </div>
    </div>
  );
}
