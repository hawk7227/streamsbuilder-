'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { PlatformId, ViewId } from '@/lib/platform-views/index';
import { PLATFORMS } from '@/lib/platform-views/index';

export interface PlatformSelection {
  platformId: PlatformId | null;
  viewId: ViewId | null;
  destination: 'mobile' | 'desktop';
}

interface PlatformSelectorProps {
  value: PlatformSelection;
  onChange: (selection: PlatformSelection) => void;
  contentType: 'image' | 'video' | null; // filters available views
  onDesktopView: (platformId: PlatformId, viewId: ViewId) => void; // desktop views route elsewhere
  scale?: number;
}

// Platform logo icons — brand colors without trademark images
const PLATFORM_ICONS: Record<PlatformId, { icon: string; color: string; bg: string }> = {
  instagram: { icon: '📸', color: '#fff', bg: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)' },
  tiktok:    { icon: '♪',  color: '#fff', bg: '#000' },
  facebook:  { icon: 'f',  color: '#fff', bg: '#1877F2' },
  youtube:   { icon: '▶',  color: '#fff', bg: '#FF0000' },
  pinterest: { icon: 'P',  color: '#fff', bg: '#E60023' },
  google:    { icon: 'G',  color: '#fff', bg: '#4285F4' },
  shopify:   { icon: '🛍',  color: '#fff', bg: '#96BF48' },
  twitter:   { icon: '𝕏',  color: '#fff', bg: '#000' },
  snapchat:  { icon: '👻', color: '#000', bg: '#FFFC00' },
};

export function PlatformSelector({ value, onChange, contentType, onDesktopView, scale = 1 }: PlatformSelectorProps) {
  const [expandedPlatform, setExpandedPlatform] = useState<PlatformId | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const sz = (n: number) => Math.round(n * scale);

  // Close picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setExpandedPlatform(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handlePlatformClick(platformId: PlatformId) {
    if (expandedPlatform === platformId) {
      setExpandedPlatform(null);
      return;
    }
    setExpandedPlatform(platformId);
  }

  function handleViewSelect(platformId: PlatformId, viewId: ViewId, destination: 'mobile' | 'desktop') {
    setExpandedPlatform(null);
    if (destination === 'desktop') {
      // Route to desktop workspace
      onChange({ platformId: value.platformId, viewId: value.viewId, destination: value.destination });
      onDesktopView(platformId, viewId);
      return;
    }
    onChange({ platformId, viewId, destination: 'mobile' });
  }

  function clearSelection() {
    onChange({ platformId: null, viewId: null, destination: 'mobile' });
    setExpandedPlatform(null);
  }

  const activePlatform = expandedPlatform ?? value.platformId;
  const expandedDef = activePlatform ? PLATFORMS.find(p => p.id === activePlatform) : null;

  // Filter views based on content type
  const filteredViews = expandedDef?.views.filter(v => {
    if (!contentType) return true;
    return v.contentType === contentType || v.contentType === 'both';
  }) ?? [];

  const mobileViews = filteredViews.filter(v => v.destination === 'mobile');
  const desktopViews = filteredViews.filter(v => v.destination === 'desktop');

  return (
    <div ref={pickerRef} style={{ position: 'relative', userSelect: 'none' }}>
      {/* Logo row */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: sz(5), padding: `${sz(4)}px 0` }}>
        {/* None button */}
        <button
          type="button"
          onClick={clearSelection}
          title="No platform"
          style={{
            width: sz(26), height: sz(26), borderRadius: sz(6), border: value.platformId === null ? '1.5px solid rgba(103,232,249,0.6)' : '1px solid rgba(255,255,255,0.12)',
            background: value.platformId === null ? 'rgba(103,232,249,0.12)' : 'rgba(255,255,255,0.05)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: sz(10), color: value.platformId === null ? '#67e8f9' : 'rgba(255,255,255,0.4)',
            fontWeight: 700, flexShrink: 0,
          }}
        >✕</button>

        {/* Platform logos */}
        {PLATFORMS.map(p => {
          const ico = PLATFORM_ICONS[p.id];
          const isActive = value.platformId === p.id;
          const isExpanded = expandedPlatform === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePlatformClick(p.id)}
              title={p.name}
              style={{
                width: sz(26), height: sz(26), borderRadius: sz(6),
                background: ico.bg,
                border: isActive ? `2px solid #67e8f9` : isExpanded ? `2px solid rgba(103,232,249,0.5)` : '1.5px solid transparent',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: sz(13), color: ico.color, fontWeight: 900, flexShrink: 0, letterSpacing: '-0.02em',
                boxShadow: isActive ? '0 0 0 2px rgba(103,232,249,0.3)' : 'none',
                transform: isExpanded ? 'scale(1.1)' : 'scale(1)',
                transition: 'transform 120ms, border 120ms',
              }}
            >
              {ico.icon}
            </button>
          );
        })}
      </div>

      {/* Sub-picker popup */}
      {expandedPlatform && expandedDef && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: sz(6),
          background: 'rgba(10,12,20,0.97)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: sz(10), padding: sz(10), zIndex: 100,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          minWidth: sz(200), maxWidth: sz(280),
          backdropFilter: 'blur(12px)',
        }}>
          {/* Platform header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: sz(8), marginBottom: sz(8), paddingBottom: sz(8), borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ width: sz(22), height: sz(22), borderRadius: sz(5), background: PLATFORM_ICONS[expandedPlatform].bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: sz(10), color: PLATFORM_ICONS[expandedPlatform].color, fontWeight: 900, flexShrink: 0 }}>
              {PLATFORM_ICONS[expandedPlatform].icon}
            </div>
            <span style={{ fontSize: sz(12), fontWeight: 700, color: '#fff' }}>{expandedDef.name}</span>
          </div>

          {/* Mobile views */}
          {mobileViews.length > 0 && (
            <div style={{ marginBottom: desktopViews.length > 0 ? sz(10) : 0 }}>
              <div style={{ fontSize: sz(9), fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: sz(5) }}>📱 Mobile</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: sz(3) }}>
                {mobileViews.map(v => {
                  const isSelected = value.viewId === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleViewSelect(expandedPlatform, v.id, 'mobile')}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: `${sz(6)}px ${sz(8)}px`, borderRadius: sz(6), cursor: 'pointer',
                        border: `1px solid ${isSelected ? 'rgba(103,232,249,0.4)' : 'rgba(255,255,255,0.06)'}`,
                        background: isSelected ? 'rgba(103,232,249,0.1)' : 'rgba(255,255,255,0.04)',
                        color: isSelected ? '#67e8f9' : 'rgba(255,255,255,0.75)',
                        fontSize: sz(12), fontWeight: isSelected ? 600 : 400, textAlign: 'left',
                      }}
                    >
                      <span>{v.label}</span>
                      <span style={{ fontSize: sz(9), color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>{v.aspectRatio}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Desktop views */}
          {desktopViews.length > 0 && (
            <div>
              <div style={{ fontSize: sz(9), fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: sz(5) }}>🖥 Desktop → workspace</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: sz(3) }}>
                {desktopViews.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => handleViewSelect(expandedPlatform, v.id, 'desktop')}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: `${sz(6)}px ${sz(8)}px`, borderRadius: sz(6), cursor: 'pointer',
                      border: '1px solid rgba(167,139,250,0.2)',
                      background: 'rgba(167,139,250,0.06)',
                      color: 'rgba(167,139,250,0.8)',
                      fontSize: sz(12), textAlign: 'left',
                    }}
                  >
                    <span>{v.label}</span>
                    <span style={{ fontSize: sz(9), color: 'rgba(167,139,250,0.4)', flexShrink: 0 }}>↗ desktop</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mobileViews.length === 0 && desktopViews.length === 0 && (
            <div style={{ fontSize: sz(11), color: 'rgba(255,255,255,0.3)', padding: `${sz(6)}px 0` }}>
              No views available for current content type
            </div>
          )}
        </div>
      )}

      {/* Active view badge */}
      {value.viewId && value.platformId && (
        <div style={{ fontSize: sz(9), color: 'rgba(103,232,249,0.7)', marginTop: sz(2), fontWeight: 600, letterSpacing: '0.04em' }}>
          {PLATFORMS.find(p => p.id === value.platformId)?.views.find(v => v.id === value.viewId)?.label}
        </div>
      )}
    </div>
  );
}
