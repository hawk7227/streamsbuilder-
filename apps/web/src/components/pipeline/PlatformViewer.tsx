'use client';

import React, { useState } from 'react';
import type { ViewId, PlatformId } from '@/lib/platform-views/index';
import { PLATFORM_MAP, getEngagementMetrics, extractContentFields } from '@/lib/platform-views/index';

export interface PlatformViewerProps {
  platformId: PlatformId;
  viewId: ViewId;
  imageUrl: string | null;
  videoUrl: string | null;
  vidRef?: React.RefObject<HTMLVideoElement | null>;
  conceptId: string;
  nicheId: string;
  copyOutput?: string;
  strategyOutput?: string;
  conceptHeadline?: string;
  wireframe?: boolean;
  showSafeZone?: boolean;
  scale?: number; // multiplier applied to all pt values (iPhoneWidth/430)
}

// ── Wireframe labels ───────────────────────────────────────────────────────────
function WireframeBar({ label, height, position }: { label: string; height: number; position: 'top' | 'bottom' | 'right' | 'left' }) {
  const style: React.CSSProperties = {
    position: 'absolute',
    background: 'rgba(100,100,120,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 20,
  };
  if (position === 'top') Object.assign(style, { top: 0, left: 0, right: 0, height });
  if (position === 'bottom') Object.assign(style, { bottom: 0, left: 0, right: 0, height });
  if (position === 'right') Object.assign(style, { top: 0, right: 0, bottom: 0, width: height });
  if (position === 'left') Object.assign(style, { top: 0, left: 0, bottom: 0, width: height });
  return (
    <div style={style}>
      <span style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.1em', textTransform: 'uppercase', transform: position === 'right' ? 'rotate(90deg)' : 'none' }}>{label}</span>
    </div>
  );
}

// ── Content layer ──────────────────────────────────────────────────────────────
function ContentLayer({ imageUrl, videoUrl, vidRef, objectFit = 'cover' }: {
  imageUrl: string | null;
  videoUrl: string | null;
  vidRef?: React.RefObject<HTMLVideoElement | null>;
  objectFit?: 'cover' | 'contain';
}) {
  if (videoUrl) {
    return <video ref={vidRef} src={videoUrl} muted loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit }} />;
  }
  if (imageUrl) {
    return <img src={imageUrl} alt="content" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit }} />;
  }
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 9, color: '#475569', textAlign: 'center', padding: '0 16px' }}>No content yet</div>
    </div>
  );
}

// ── Individual platform views ─────────────────────────────────────────────────

function InstagramFeedView({ f, e, s, image, video, vidRef, w }: any) {
  const sz = (n: number) => Math.round(n * s);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top nav */}
      <div style={{ height: sz(54), background: '#000', borderBottom: '1px solid #262626', display: 'flex', alignItems: 'center', padding: `0 ${sz(16)}px`, flexShrink: 0, gap: sz(12) }}>
        <span style={{ fontSize: sz(22), color: '#fff', fontFamily: 'serif', fontStyle: 'italic', fontWeight: 700 }}>Instagram</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: sz(22), color: '#fff' }}>♡</span>
        <span style={{ fontSize: sz(20), color: '#fff' }}>✉</span>
      </div>
      {/* Post header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: `${sz(8)}px ${sz(12)}px`, gap: sz(10), flexShrink: 0 }}>
        <div style={{ width: sz(32), height: sz(32), borderRadius: '50%', background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: sz(28), height: sz(28), borderRadius: '50%', background: '#222', border: `${sz(2)}px solid #000`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: sz(12), color: '#fff' }}>👤</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: sz(13), fontWeight: 600, color: '#fff' }}>{f.displayName}</div>
          <div style={{ fontSize: sz(10), color: '#8e8e8e' }}>Sponsored</div>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: sz(18), color: '#fff' }}>···</span>
      </div>
      {/* Image — 4:5 */}
      <div style={{ width: '100%', aspectRatio: '4/5', position: 'relative', flexShrink: 0, overflow: 'hidden', maxHeight: '55%' }}>
        <ContentLayer imageUrl={image} videoUrl={video} vidRef={vidRef} />
      </div>
      {/* Action bar */}
      <div style={{ padding: `${sz(10)}px ${sz(12)}px`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: sz(14), marginBottom: sz(6) }}>
          <span style={{ fontSize: sz(24), color: '#fff' }}>♡</span>
          <span style={{ fontSize: sz(22), color: '#fff' }}>💬</span>
          <span style={{ fontSize: sz(22), color: '#fff' }}>↗</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: sz(22), color: '#fff' }}>🔖</span>
        </div>
        <div style={{ fontSize: sz(12), fontWeight: 600, color: '#fff', marginBottom: sz(3) }}>{e.likes} likes</div>
        <div style={{ fontSize: sz(12), color: '#fff' }}>
          <span style={{ fontWeight: 600 }}>{f.displayName}</span>{' '}
          <span style={{ color: '#dbdbdb' }}>{f.caption}</span>
        </div>
        <div style={{ fontSize: sz(11), color: '#8e8e8e', marginTop: sz(2) }}>{f.hashtags}</div>
      </div>
      {/* Bottom nav */}
      <div style={{ marginTop: 'auto', height: sz(56), background: '#000', borderTop: '1px solid #262626', display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexShrink: 0 }}>
        {['⌂', '🔍', '＋', '▷', '👤'].map((icon, i) => (
          <span key={i} style={{ fontSize: sz(22), color: i === 0 ? '#fff' : '#8e8e8e' }}>{icon}</span>
        ))}
      </div>
    </div>
  );
}

function TikTokVideoView({ f, e, s, image, video, vidRef }: any) {
  const sz = (n: number) => Math.round(n * s);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', overflow: 'hidden' }}>
      {/* Full-screen content */}
      <ContentLayer imageUrl={image} videoUrl={video} vidRef={vidRef} />
      {/* Top nav */}
      <div style={{ position: 'absolute', top: sz(40), left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: sz(20), zIndex: 10 }}>
        <span style={{ fontSize: sz(15), color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>Following</span>
        <span style={{ fontSize: sz(15), color: '#fff', fontWeight: 700, borderBottom: `${sz(2)}px solid #fff`, paddingBottom: sz(2) }}>For You</span>
        <span style={{ fontSize: sz(18), color: '#fff', position: 'absolute', right: sz(16) }}>🔍</span>
      </div>
      {/* Right action bar */}
      <div style={{ position: 'absolute', right: sz(10), bottom: sz(160), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: sz(18), zIndex: 10 }}>
        <div style={{ width: sz(28), height: sz(28), borderRadius: '50%', background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: sz(12), color: '#fff' }}>👤</span>
        </div>
        {[['❤', e.likes], ['💬', e.comments], ['↗', e.shares], ['🔖', ''], ['🎵', '']].map(([icon, count], i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: sz(3) }}>
            <span style={{ fontSize: sz(26), filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>{icon}</span>
            {count && <span style={{ fontSize: sz(10), color: '#fff', fontWeight: 600 }}>{count}</span>}
          </div>
        ))}
      </div>
      {/* Bottom caption */}
      <div style={{ position: 'absolute', bottom: sz(80), left: sz(12), right: sz(80), zIndex: 10 }}>
        <div style={{ fontSize: sz(13), fontWeight: 700, color: '#fff', marginBottom: sz(4) }}>{f.handle}</div>
        <div style={{ fontSize: sz(12), color: 'rgba(255,255,255,0.9)', marginBottom: sz(6), lineHeight: 1.4 }}>{f.caption}</div>
        <div style={{ fontSize: sz(12), color: '#fff', display: 'flex', alignItems: 'center', gap: sz(6) }}>
          <span>🎵</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.soundName}</span>
        </div>
      </div>
      {/* Bottom nav */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: sz(72), background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'space-around', borderTop: '1px solid rgba(255,255,255,0.1)', zIndex: 10 }}>
        {[['⌂','Home'],['🔍',''],['＋',''],['✉',''],['👤','']].map(([icon, label], i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: sz(2) }}>
            {i === 2
              ? <div style={{ width: sz(40), height: sz(28), borderRadius: sz(8), background: 'linear-gradient(90deg,#69C9D0,#fff,#EE1D52)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: sz(18), color: '#000', fontWeight: 900 }}>+</span></div>
              : <span style={{ fontSize: sz(22), color: i === 0 ? '#fff' : '#8e8e8e' }}>{icon}</span>
            }
            {label && <span style={{ fontSize: sz(9), color: i === 0 ? '#fff' : '#8e8e8e' }}>{label}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function YouTubeShortsView({ f, e, s, video, vidRef }: any) {
  const sz = (n: number) => Math.round(n * s);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0f0f0f', overflow: 'hidden' }}>
      <ContentLayer imageUrl={null} videoUrl={video} vidRef={vidRef} />
      {/* Right action bar */}
      <div style={{ position: 'absolute', right: sz(8), bottom: sz(160), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: sz(20), zIndex: 10 }}>
        {[['👍', e.likes], ['👎', ''], ['💬', e.comments], ['↗', e.shares], ['↺', '']].map(([icon, count], i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: sz(2) }}>
            <span style={{ fontSize: sz(24) }}>{icon}</span>
            {count && <span style={{ fontSize: sz(10), color: '#fff', fontWeight: 600 }}>{count}</span>}
          </div>
        ))}
      </div>
      {/* Bottom info */}
      <div style={{ position: 'absolute', bottom: sz(80), left: sz(12), right: sz(80), zIndex: 10 }}>
        <div style={{ fontSize: sz(13), fontWeight: 700, color: '#fff', marginBottom: sz(4) }}>{f.channelName}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: sz(8), marginBottom: sz(6) }}>
          <div style={{ width: sz(24), height: sz(24), borderRadius: '50%', background: '#ff0000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: sz(10), color: '#fff', fontWeight: 900 }}>▶</span>
          </div>
          <span style={{ fontSize: sz(12), fontWeight: 700, color: '#fff' }}>{f.channelName}</span>
          <span style={{ fontSize: sz(10), background: '#fff', color: '#0f0f0f', borderRadius: sz(4), padding: `${sz(2)}px ${sz(6)}px`, fontWeight: 700 }}>Subscribe</span>
        </div>
        <div style={{ fontSize: sz(12), color: 'rgba(255,255,255,0.85)' }}>{f.caption}</div>
      </div>
      {/* Progress bar */}
      <div style={{ position: 'absolute', bottom: sz(72), left: 0, right: 0, height: sz(3), background: 'rgba(255,255,255,0.3)', zIndex: 10 }}>
        <div style={{ width: '35%', height: '100%', background: '#ff0000' }} />
      </div>
      {/* Bottom nav */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: sz(72), background: 'rgba(15,15,15,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'space-around', zIndex: 10 }}>
        {[['⌂','Home'],['▷','Shorts'],['＋',''],['📺','Subs'],['👤','You']].map(([icon, label], i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: sz(2) }}>
            <span style={{ fontSize: sz(20), color: i === 1 ? '#fff' : '#aaa' }}>{icon}</span>
            <span style={{ fontSize: sz(9), color: i === 1 ? '#fff' : '#aaa' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function YouTubeMobileWatchView({ f, e, s, video, vidRef }: any) {
  const sz = (n: number) => Math.round(n * s);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0f0f0f', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Top nav */}
      <div style={{ height: sz(54), background: '#0f0f0f', display: 'flex', alignItems: 'center', padding: `0 ${sz(12)}px`, gap: sz(8), flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: sz(4) }}>
          <span style={{ fontSize: sz(18), color: '#ff0000', fontWeight: 900 }}>▶</span>
          <span style={{ fontSize: sz(13), fontWeight: 700, color: '#fff' }}>YouTube</span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: sz(18), color: '#fff' }}>🔍</span>
        <span style={{ fontSize: sz(18), color: '#fff' }}>🎙</span>
        <div style={{ width: sz(24), height: sz(24), borderRadius: '50%', background: '#555' }} />
      </div>
      {/* 16:9 video player */}
      <div style={{ width: '100%', aspectRatio: '16/9', position: 'relative', flexShrink: 0, background: '#000', overflow: 'hidden' }}>
        <ContentLayer imageUrl={null} videoUrl={video} vidRef={vidRef} objectFit="contain" />
        {/* Player controls overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 60%,rgba(0,0,0,0.7))', display: 'flex', alignItems: 'flex-end', padding: sz(8) }}>
          <div style={{ width: '100%' }}>
            {/* Progress bar */}
            <div style={{ height: sz(3), background: 'rgba(255,255,255,0.3)', borderRadius: sz(2), marginBottom: sz(6) }}>
              <div style={{ width: '35%', height: '100%', background: '#ff0000', borderRadius: sz(2), position: 'relative' }}>
                <div style={{ position: 'absolute', right: -sz(5), top: -sz(3), width: sz(10), height: sz(10), borderRadius: '50%', background: '#ff0000' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: sz(8) }}>
              <span style={{ fontSize: sz(16), color: '#fff' }}>▶</span>
              <span style={{ fontSize: sz(10), color: '#fff' }}>2:34 / 8:47</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: sz(14), color: '#fff' }}>⛶</span>
            </div>
          </div>
        </div>
      </div>
      {/* Video info */}
      <div style={{ padding: `${sz(10)}px ${sz(12)}px`, borderBottom: '1px solid #272727', flexShrink: 0 }}>
        <div style={{ fontSize: sz(14), fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: sz(6) }}>{f.title}</div>
        <div style={{ fontSize: sz(11), color: '#aaa' }}>{e.views} views · 3 days ago</div>
      </div>
      {/* Channel row */}
      <div style={{ padding: `${sz(10)}px ${sz(12)}px`, borderBottom: '1px solid #272727', display: 'flex', alignItems: 'center', gap: sz(10), flexShrink: 0 }}>
        <div style={{ width: sz(36), height: sz(36), borderRadius: '50%', background: '#ff0000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: sz(14), color: '#fff', fontWeight: 900 }}>▶</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: sz(13), fontWeight: 600, color: '#fff' }}>{f.channelName}</div>
          <div style={{ fontSize: sz(11), color: '#aaa' }}>{f.subscriberCount} subscribers</div>
        </div>
        <div style={{ background: '#fff', color: '#0f0f0f', borderRadius: sz(20), padding: `${sz(6)}px ${sz(12)}px`, fontSize: sz(12), fontWeight: 700, flexShrink: 0 }}>Subscribe</div>
      </div>
      {/* Action row */}
      <div style={{ padding: `${sz(10)}px ${sz(12)}px`, display: 'flex', gap: sz(8), flexShrink: 0 }}>
        {[`👍 ${e.likes}`, '👎', '↗ Share', '✦ Ask', '···'].map((label, i) => (
          <div key={i} style={{ background: '#272727', borderRadius: sz(20), padding: `${sz(6)}px ${sz(10)}px`, fontSize: sz(11), color: '#fff', display: 'flex', alignItems: 'center', gap: sz(4), flexShrink: 0 }}>
            {label}
          </div>
        ))}
      </div>
      {/* Bottom nav */}
      <div style={{ marginTop: 'auto', height: sz(56), background: '#0f0f0f', borderTop: '1px solid #272727', display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexShrink: 0 }}>
        {['⌂','▷','＋','📺','👤'].map((icon, i) => (
          <span key={i} style={{ fontSize: sz(20), color: i === 0 ? '#fff' : '#aaa' }}>{icon}</span>
        ))}
      </div>
    </div>
  );
}

function FacebookPostView({ f, e, s, image, video, vidRef, isVideo }: any) {
  const sz = (n: number) => Math.round(n * s);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#18191A', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top nav */}
      <div style={{ height: sz(54), background: '#242526', display: 'flex', alignItems: 'center', padding: `0 ${sz(12)}px`, flexShrink: 0 }}>
        <span style={{ fontSize: sz(22), fontWeight: 900, color: '#1877F2' }}>f</span>
        <div style={{ flex: 1 }} />
        {['🔍','👥','▶','🛍','🔔','☰'].map((icon, i) => (
          <span key={i} style={{ fontSize: sz(18), color: '#E4E6EB', marginLeft: sz(12) }}>{icon}</span>
        ))}
      </div>
      {/* Post header */}
      <div style={{ padding: `${sz(10)}px ${sz(12)}px`, display: 'flex', gap: sz(8), flexShrink: 0 }}>
        <div style={{ width: sz(36), height: sz(36), borderRadius: '50%', background: '#3a3b3c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: sz(16) }}>👤</span>
        </div>
        <div>
          <div style={{ fontSize: sz(13), fontWeight: 600, color: '#E4E6EB' }}>{f.displayName}</div>
          <div style={{ fontSize: sz(10), color: '#b0b3b8', display: 'flex', alignItems: 'center', gap: sz(4) }}>
            <span>Just now · 🌐</span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: sz(18), color: '#b0b3b8' }}>···</span>
      </div>
      {/* Caption */}
      <div style={{ padding: `0 ${sz(12)}px ${sz(8)}px`, fontSize: sz(13), color: '#E4E6EB', lineHeight: 1.4, flexShrink: 0 }}>{f.caption}</div>
      {/* Media */}
      <div style={{ width: '100%', aspectRatio: isVideo ? '16/9' : '4/5', position: 'relative', flexShrink: 0, overflow: 'hidden', maxHeight: '45%' }}>
        <ContentLayer imageUrl={image} videoUrl={video} vidRef={vidRef} />
      </div>
      {/* Reactions count */}
      <div style={{ padding: `${sz(6)}px ${sz(12)}px`, display: 'flex', justifyContent: 'space-between', fontSize: sz(12), color: '#b0b3b8', flexShrink: 0 }}>
        <span>👍❤ {e.likes}</span>
        <span>{e.comments} comments · {e.shares} shares</span>
      </div>
      {/* Action bar */}
      <div style={{ borderTop: '1px solid #3a3b3c', borderBottom: '1px solid #3a3b3c', padding: `${sz(4)}px 0`, display: 'flex', justifyContent: 'space-around', flexShrink: 0 }}>
        {[['👍','Like'],['💬','Comment'],['↗','Share']].map(([icon, label], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: sz(6), padding: `${sz(6)}px ${sz(12)}px`, borderRadius: sz(6) }}>
            <span style={{ fontSize: sz(18) }}>{icon}</span>
            <span style={{ fontSize: sz(12), color: '#b0b3b8', fontWeight: 600 }}>{label}</span>
          </div>
        ))}
      </div>
      {/* Bottom nav */}
      <div style={{ marginTop: 'auto', height: sz(56), background: '#242526', borderTop: '1px solid #3a3b3c', display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexShrink: 0 }}>
        {['⌂','👥','▶','🛍','🔔'].map((icon, i) => (
          <span key={i} style={{ fontSize: sz(22), color: i === 0 ? '#1877F2' : '#b0b3b8' }}>{icon}</span>
        ))}
      </div>
    </div>
  );
}

function PinterestPinView({ f, e, s, image, closeup }: any) {
  const sz = (n: number) => Math.round(n * s);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#EFEFEF', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top nav */}
      <div style={{ height: sz(54), background: '#fff', display: 'flex', alignItems: 'center', padding: `0 ${sz(12)}px`, gap: sz(8), flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <span style={{ fontSize: sz(20), color: '#E60023' }}>●</span>
        <span style={{ fontSize: sz(14), fontWeight: 700, color: '#111' }}>Pinterest</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: sz(18), color: '#111' }}>🔍</span>
        <div style={{ width: sz(28), height: sz(28), borderRadius: '50%', background: '#ddd' }} />
      </div>
      {/* Pin */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {closeup ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <ContentLayer imageUrl={image} videoUrl={null} />
              <div style={{ position: 'absolute', top: sz(12), right: sz(12), background: '#E60023', borderRadius: sz(24), padding: `${sz(8)}px ${sz(16)}px`, fontSize: sz(13), fontWeight: 700, color: '#fff' }}>Save</div>
            </div>
            <div style={{ background: '#fff', padding: sz(14), flexShrink: 0 }}>
              <div style={{ fontSize: sz(16), fontWeight: 700, color: '#111', marginBottom: sz(6) }}>{f.productName}</div>
              <div style={{ fontSize: sz(13), color: '#767676', marginBottom: sz(10), lineHeight: 1.4 }}>{f.caption}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: sz(8) }}>
                <div style={{ width: sz(28), height: sz(28), borderRadius: '50%', background: '#ddd' }} />
                <span style={{ fontSize: sz(12), fontWeight: 600, color: '#111' }}>{f.displayName}</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: sz(13), color: '#767676' }}>❤ {e.shares}</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: sz(8) }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sz(6) }}>
              {[image, image, image, image].map((img, i) => (
                <div key={i} style={{ borderRadius: sz(12), overflow: 'hidden', aspectRatio: '2/3', position: 'relative', background: '#ddd' }}>
                  {img && <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  {i === 0 && <div style={{ position: 'absolute', top: sz(6), right: sz(6), background: '#E60023', borderRadius: sz(16), padding: `${sz(4)}px ${sz(8)}px`, fontSize: sz(10), fontWeight: 700, color: '#fff' }}>Save</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Bottom nav */}
      <div style={{ height: sz(56), background: '#fff', borderTop: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexShrink: 0 }}>
        {['⌂','🔍','＋','✉','👤'].map((icon, i) => (
          <span key={i} style={{ fontSize: sz(22), color: i === 0 ? '#E60023' : '#767676' }}>{icon}</span>
        ))}
      </div>
    </div>
  );
}

function GoogleShoppingView({ f, e, s, image }: any) {
  const sz = (n: number) => Math.round(n * s);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Search bar */}
      <div style={{ height: sz(54), background: '#fff', display: 'flex', alignItems: 'center', padding: `0 ${sz(12)}px`, gap: sz(8), flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
        <span style={{ fontSize: sz(18), color: '#4285F4', fontWeight: 900 }}>G</span>
        <div style={{ flex: 1, background: '#f1f3f4', borderRadius: sz(24), padding: `${sz(6)}px ${sz(12)}px`, display: 'flex', alignItems: 'center', gap: sz(6) }}>
          <span style={{ fontSize: sz(14), color: '#9aa0a6' }}>🔍</span>
          <span style={{ fontSize: sz(13), color: '#202124' }}>{f.productName}</span>
        </div>
        <span style={{ fontSize: sz(18), color: '#5f6368' }}>🎙</span>
      </div>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0', padding: `0 ${sz(4)}px`, flexShrink: 0, background: '#fff' }}>
        {['All','Shopping','Images','News','Maps'].map((tab, i) => (
          <div key={i} style={{ padding: `${sz(10)}px ${sz(12)}px`, fontSize: sz(12), color: i === 1 ? '#1a73e8' : '#5f6368', fontWeight: i === 1 ? 700 : 400, borderBottom: i === 1 ? `${sz(3)}px solid #1a73e8` : 'none', marginBottom: i === 1 ? -1 : 0 }}>{tab}</div>
        ))}
      </div>
      {/* Product card */}
      <div style={{ flex: 1, overflow: 'auto', padding: sz(12) }}>
        <div style={{ background: '#fff', borderRadius: sz(12), border: '1px solid #e0e0e0', overflow: 'hidden', marginBottom: sz(12) }}>
          <div style={{ aspectRatio: '1/1', position: 'relative', background: '#f8f9fa' }}>
            {image && <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
          </div>
          <div style={{ padding: sz(12) }}>
            <div style={{ fontSize: sz(16), fontWeight: 700, color: '#202124', marginBottom: sz(4) }}>{f.productName}</div>
            <div style={{ fontSize: sz(18), fontWeight: 900, color: '#202124', marginBottom: sz(4) }}>{f.price}</div>
            <div style={{ fontSize: sz(12), color: '#70757a', marginBottom: sz(6) }}>{f.displayName}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: sz(4), marginBottom: sz(10) }}>
              {'★★★★☆'.split('').map((star, i) => <span key={i} style={{ fontSize: sz(14), color: '#fbbc04' }}>{star}</span>)}
              <span style={{ fontSize: sz(12), color: '#70757a' }}>(42)</span>
            </div>
            <div style={{ background: '#1a73e8', borderRadius: sz(24), padding: `${sz(10)}px 0`, textAlign: 'center', fontSize: sz(13), fontWeight: 700, color: '#fff' }}>Add to cart</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShopifyProductView({ f, e, s, image }: any) {
  const sz = (n: number) => Math.round(n * s);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top nav */}
      <div style={{ height: sz(54), background: '#fff', display: 'flex', alignItems: 'center', padding: `0 ${sz(12)}px`, flexShrink: 0, borderBottom: '1px solid #e5e5e5' }}>
        <span style={{ fontSize: sz(18), color: '#111' }}>☰</span>
        <div style={{ flex: 1, textAlign: 'center', fontSize: sz(14), fontWeight: 700, color: '#111' }}>{f.displayName}</div>
        <span style={{ fontSize: sz(18), color: '#111' }}>🛒</span>
      </div>
      {/* Product image */}
      <div style={{ width: '100%', aspectRatio: '1/1', position: 'relative', flexShrink: 0, background: '#f6f6f6', overflow: 'hidden' }}>
        {image && <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
        {/* Image dots */}
        <div style={{ position: 'absolute', bottom: sz(10), left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: sz(5) }}>
          {[0,1,2,3].map(i => <div key={i} style={{ width: sz(6), height: sz(6), borderRadius: '50%', background: i === 0 ? '#111' : '#ccc' }} />)}
        </div>
      </div>
      {/* Product info */}
      <div style={{ padding: sz(14), flex: 1, overflow: 'auto' }}>
        <div style={{ fontSize: sz(16), fontWeight: 700, color: '#111', marginBottom: sz(4) }}>{f.productName}</div>
        <div style={{ fontSize: sz(20), fontWeight: 900, color: '#111', marginBottom: sz(8) }}>{f.price}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: sz(4), marginBottom: sz(12) }}>
          {'★★★★☆'.split('').map((s, i) => <span key={i} style={{ fontSize: sz(14), color: '#f5a623' }}>{s}</span>)}
          <span style={{ fontSize: sz(12), color: '#767676' }}>(127 reviews)</span>
        </div>
        <div style={{ fontSize: sz(13), color: '#767676', lineHeight: 1.5 }}>{f.caption}</div>
      </div>
      {/* Add to cart bar */}
      <div style={{ padding: sz(12), borderTop: '1px solid #e5e5e5', flexShrink: 0, display: 'flex', gap: sz(8) }}>
        <div style={{ flex: 1, background: '#111', borderRadius: sz(8), padding: `${sz(12)}px 0`, textAlign: 'center', fontSize: sz(14), fontWeight: 700, color: '#fff' }}>Add to Cart</div>
        <div style={{ background: '#5a31f4', borderRadius: sz(8), padding: `${sz(12)}px ${sz(16)}px`, fontSize: sz(14), fontWeight: 700, color: '#fff' }}>Buy Now</div>
      </div>
    </div>
  );
}

function TwitterTweetView({ f, e, s, image, video, vidRef }: any) {
  const sz = (n: number) => Math.round(n * s);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top nav */}
      <div style={{ height: sz(54), background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `0 ${sz(12)}px`, flexShrink: 0, borderBottom: '1px solid #2f3336' }}>
        <span style={{ fontSize: sz(22), color: '#fff', fontWeight: 900 }}>𝕏</span>
      </div>
      {/* Tweet */}
      <div style={{ padding: `${sz(12)}px ${sz(14)}px`, borderBottom: '1px solid #2f3336', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: sz(10), marginBottom: sz(10) }}>
          <div style={{ width: sz(36), height: sz(36), borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: sz(16) }}>👤</span>
          </div>
          <div>
            <div style={{ fontSize: sz(13), fontWeight: 700, color: '#fff' }}>{f.displayName}</div>
            <div style={{ fontSize: sz(12), color: '#71767b' }}>{f.handle}</div>
          </div>
        </div>
        <div style={{ fontSize: sz(14), color: '#fff', lineHeight: 1.5, marginBottom: sz(10) }}>{f.caption} {f.hashtags}</div>
        {(image || video) && (
          <div style={{ borderRadius: sz(12), overflow: 'hidden', aspectRatio: '16/9', position: 'relative', marginBottom: sz(10) }}>
            <ContentLayer imageUrl={image} videoUrl={video} vidRef={vidRef} />
          </div>
        )}
        <div style={{ fontSize: sz(12), color: '#71767b', marginBottom: sz(10) }}>9:41 AM · Jan 1, 2025</div>
        {/* Action row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#71767b' }}>
          {[['💬', e.comments], ['↺', e.shares], ['❤', e.likes], ['📊', ''], ['↗', '']].map(([icon, count], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: sz(4) }}>
              <span style={{ fontSize: sz(16) }}>{icon}</span>
              {count && <span style={{ fontSize: sz(11) }}>{count}</span>}
            </div>
          ))}
        </div>
      </div>
      {/* Bottom nav */}
      <div style={{ marginTop: 'auto', height: sz(56), background: '#000', borderTop: '1px solid #2f3336', display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexShrink: 0 }}>
        {['⌂','🔍','🔔','✉'].map((icon, i) => (
          <span key={i} style={{ fontSize: sz(22), color: i === 0 ? '#fff' : '#71767b' }}>{icon}</span>
        ))}
      </div>
    </div>
  );
}

function SnapchatView({ f, s, image, video, vidRef }: any) {
  const sz = (n: number) => Math.round(n * s);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', overflow: 'hidden' }}>
      <ContentLayer imageUrl={image} videoUrl={video} vidRef={vidRef} />
      {/* Top header */}
      <div style={{ position: 'absolute', top: sz(44), left: sz(12), right: sz(12), display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
        <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: sz(20), padding: `${sz(6)}px ${sz(10)}px`, display: 'flex', alignItems: 'center', gap: sz(6) }}>
          <div style={{ width: sz(20), height: sz(20), borderRadius: '50%', background: '#FFFC00', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: sz(10) }}>👤</span>
          </div>
          <span style={{ fontSize: sz(12), fontWeight: 600, color: '#fff' }}>{f.displayName}</span>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: sz(20), padding: `${sz(6)}px ${sz(10)}px` }}>
          <span style={{ fontSize: sz(12), color: '#fff' }}>⏱ 10s</span>
        </div>
      </div>
      {/* Caption */}
      <div style={{ position: 'absolute', bottom: sz(120), left: sz(12), right: sz(12), zIndex: 10 }}>
        <div style={{ background: 'rgba(0,0,0,0.5)', borderRadius: sz(8), padding: `${sz(6)}px ${sz(10)}px`, fontSize: sz(13), color: '#fff', textAlign: 'center' }}>{f.caption}</div>
      </div>
      {/* Bottom bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: sz(100), background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'space-around', zIndex: 10 }}>
        <span style={{ fontSize: sz(22), color: '#fff' }}>✉</span>
        <div style={{ background: '#FFFC00', borderRadius: sz(30), padding: `${sz(10)}px ${sz(24)}px`, fontSize: sz(14), fontWeight: 700, color: '#000' }}>Reply</div>
        <span style={{ fontSize: sz(22), color: '#fff' }}>↗</span>
      </div>
    </div>
  );
}

function InstagramStoryView({ f, s, image, video, vidRef }: any) {
  const sz = (n: number) => Math.round(n * s);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', overflow: 'hidden' }}>
      <ContentLayer imageUrl={image} videoUrl={video} vidRef={vidRef} />
      {/* Story progress bars */}
      <div style={{ position: 'absolute', top: sz(50), left: sz(8), right: sz(8), display: 'flex', gap: sz(3), zIndex: 10 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ flex: 1, height: sz(3), borderRadius: sz(2), background: i === 0 ? '#fff' : 'rgba(255,255,255,0.4)' }}>
            {i === 0 && <div style={{ width: '40%', height: '100%', background: '#fff', borderRadius: sz(2) }} />}
          </div>
        ))}
      </div>
      {/* Header */}
      <div style={{ position: 'absolute', top: sz(62), left: sz(12), right: sz(12), display: 'flex', alignItems: 'center', gap: sz(8), zIndex: 10 }}>
        <div style={{ width: sz(28), height: sz(28), borderRadius: '50%', background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', padding: sz(2), flexShrink: 0 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#222', border: `${sz(2)}px solid #000` }} />
        </div>
        <span style={{ fontSize: sz(13), fontWeight: 600, color: '#fff' }}>{f.displayName}</span>
        <span style={{ fontSize: sz(11), color: 'rgba(255,255,255,0.7)' }}>2m</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: sz(20), color: '#fff' }}>···</span>
        <span style={{ fontSize: sz(20), color: '#fff' }}>✕</span>
      </div>
      {/* Bottom reply */}
      <div style={{ position: 'absolute', bottom: sz(34), left: sz(12), right: sz(12), display: 'flex', alignItems: 'center', gap: sz(10), zIndex: 10 }}>
        <div style={{ flex: 1, border: '1px solid rgba(255,255,255,0.5)', borderRadius: sz(24), padding: `${sz(10)}px ${sz(14)}px`, fontSize: sz(13), color: 'rgba(255,255,255,0.7)' }}>Reply to {f.displayName}…</div>
        <span style={{ fontSize: sz(22), color: '#fff' }}>❤</span>
        <span style={{ fontSize: sz(22), color: '#fff' }}>↗</span>
      </div>
    </div>
  );
}

// ── Safe zone overlay ─────────────────────────────────────────────────────────
function SafeZoneOverlay({ safeZone, s, wireframe }: { safeZone: any; s: number; wireframe: boolean }) {
  const sz = (n: number) => Math.round(n * s);
  if (wireframe) return null; // wireframe bars replace safe zone overlay
  return (
    <>
      {safeZone.top > 0 && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: sz(safeZone.top), background: 'rgba(255,100,0,0.15)', border: '1px dashed rgba(255,100,0,0.4)', zIndex: 30, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 8, color: 'rgba(255,150,0,0.9)', fontWeight: 700, letterSpacing: '0.05em', background: 'rgba(0,0,0,0.5)', padding: '1px 4px', borderRadius: 3 }}>SAFE ZONE</span>
        </div>
      )}
      {safeZone.bottom > 0 && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: sz(safeZone.bottom), background: 'rgba(255,100,0,0.15)', border: '1px dashed rgba(255,100,0,0.4)', zIndex: 30, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 8, color: 'rgba(255,150,0,0.9)', fontWeight: 700, letterSpacing: '0.05em', background: 'rgba(0,0,0,0.5)', padding: '1px 4px', borderRadius: 3 }}>SAFE ZONE</span>
        </div>
      )}
      {safeZone.right > 0 && (
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: sz(safeZone.right), background: 'rgba(255,100,0,0.15)', border: '1px dashed rgba(255,100,0,0.4)', zIndex: 30, pointerEvents: 'none' }} />
      )}
    </>
  );
}

// ── Wireframe overlay ─────────────────────────────────────────────────────────
function WireframeOverlay({ viewId, s }: { viewId: ViewId; s: number }) {
  const sz = (n: number) => Math.round(n * s);
  // Map view types to wireframe zones
  const isFullscreen = ['tt_video','tt_slideshow','ig_story','ig_reels','yt_shorts','snap_image','snap_video'].includes(viewId);
  const hasRightBar = ['tt_video','tt_slideshow','ig_reels','yt_shorts'].includes(viewId);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none' }}>
      <WireframeBar label="STATUS BAR" height={sz(54)} position="top" />
      {isFullscreen && <WireframeBar label="CAPTION ZONE" height={sz(120)} position="bottom" />}
      {!isFullscreen && <WireframeBar label="NAV BAR" height={sz(56)} position="bottom" />}
      {hasRightBar && <WireframeBar label="ACTION BAR" height={sz(72)} position="right" />}
      {/* Content zone label */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(60,60,80,0.7)', borderRadius: 6, padding: '4px 10px' }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>CONTENT AREA</span>
      </div>
    </div>
  );
}

// ── Main router ───────────────────────────────────────────────────────────────
export function PlatformViewer(props: PlatformViewerProps) {
  const {
    platformId, viewId, imageUrl, videoUrl, vidRef,
    conceptId, nicheId, copyOutput, strategyOutput, conceptHeadline,
    wireframe = false, showSafeZone = false, scale = 1,
  } = props;

  const platform = PLATFORM_MAP[platformId];
  const view = platform?.views.find(v => v.id === viewId);
  if (!platform || !view) return null;

  const f = extractContentFields(nicheId, conceptId, copyOutput, strategyOutput, conceptHeadline);
  const e = getEngagementMetrics(platformId, viewId, conceptId);
  const s = scale;

  const shared = { f, e, s, image: imageUrl, video: videoUrl, vidRef };

  const renderView = () => {
    if (wireframe) {
      return (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,20,30,0.95)' }}>
          <ContentLayer imageUrl={imageUrl} videoUrl={videoUrl} vidRef={vidRef} />
          <WireframeOverlay viewId={viewId} s={s} />
        </div>
      );
    }

    switch (viewId) {
      case 'ig_feed': return <InstagramFeedView {...shared} />;
      case 'ig_story': return <InstagramStoryView {...shared} />;
      case 'ig_reels': return <TikTokVideoView {...shared} />;  // same layout, different chrome
      case 'tt_video': return <TikTokVideoView {...shared} />;
      case 'tt_slideshow': return <TikTokVideoView {...shared} />;
      case 'yt_shorts': return <YouTubeShortsView {...shared} />;
      case 'yt_watch_mobile': return <YouTubeMobileWatchView {...shared} />;
      case 'fb_photo': return <FacebookPostView {...shared} isVideo={false} />;
      case 'fb_video': return <FacebookPostView {...shared} isVideo={true} />;
      case 'pin_card': return <PinterestPinView {...shared} closeup={false} />;
      case 'pin_closeup': return <PinterestPinView {...shared} closeup={true} />;
      case 'g_shopping_card': case 'g_search_mobile': return <GoogleShoppingView {...shared} />;
      case 'shop_product': case 'shop_collection': return <ShopifyProductView {...shared} />;
      case 'tw_tweet': case 'tw_thread': return <TwitterTweetView {...shared} />;
      case 'snap_image': case 'snap_video': return <SnapchatView {...shared} />;
      default:
        return (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111' }}>
            <span style={{ fontSize: 11, color: '#475569' }}>View coming soon</span>
          </div>
        );
    }
  };

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {renderView()}
      {showSafeZone && !wireframe && <SafeZoneOverlay safeZone={view.safeZone} s={s} wireframe={wireframe} />}
    </div>
  );
}
