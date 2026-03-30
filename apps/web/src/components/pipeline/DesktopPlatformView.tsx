'use client';

import React from 'react';
import type { PlatformId, ViewId } from '@/lib/platform-views/index';
import { PLATFORM_MAP, getEngagementMetrics, extractContentFields } from '@/lib/platform-views/index';

interface DesktopPlatformViewProps {
  platformId: PlatformId;
  viewId: ViewId;
  imageUrl: string | null;
  videoUrl: string | null;
  conceptId: string;
  nicheId: string;
  copyOutput?: string;
  strategyOutput?: string;
  conceptHeadline?: string;
  wireframe?: boolean;
  showSafeZone?: boolean;
  onDismiss?: () => void;
}

function BrowserChrome({ url, title, onDismiss }: { url: string; title: string; onDismiss?: () => void }) {
  return (
    <div style={{ height: 44, background: '#1e1e20', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8, flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 5 }}>
        {['#ff5f57','#ffbd2e','#28c840'].map((c, i) => (
          <div key={i} onClick={i === 0 ? onDismiss : undefined} style={{ width: 12, height: 12, borderRadius: '50%', background: c, cursor: i === 0 ? 'pointer' : 'default' }} />
        ))}
      </div>
      <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>🔒</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
      </div>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>{title}</span>
    </div>
  );
}

function WireframeDesktopView({ viewId }: { viewId: ViewId }) {
  return (
    <div style={{ flex: 1, background: '#0a0c14', display: 'flex', gap: 0, overflow: 'hidden' }}>
      {/* Left sidebar zone */}
      <div style={{ width: 200, borderRight: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', padding: 12, gap: 8 }}>
        <div style={{ height: 32, background: 'rgba(100,100,120,0.3)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>NAV / SIDEBAR</span>
        </div>
        {[80,60,60,60,60].map((h, i) => (
          <div key={i} style={{ height: h, background: 'rgba(100,100,120,0.15)', borderRadius: 4 }} />
        ))}
      </div>
      {/* Main content */}
      <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ height: 40, background: 'rgba(100,100,120,0.3)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>CONTENT AREA</span>
        </div>
        <div style={{ flex: 1, background: 'rgba(100,100,120,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>MEDIA / CONTENT</span>
        </div>
        <div style={{ height: 60, background: 'rgba(100,100,120,0.2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>ACTION BAR</span>
        </div>
      </div>
      {/* Right sidebar */}
      <div style={{ width: 260, borderLeft: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ height: 24, background: 'rgba(100,100,120,0.3)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>RECOMMENDATIONS</span>
        </div>
        {[120,120,120].map((h, i) => (
          <div key={i} style={{ height: h, background: 'rgba(100,100,120,0.15)', borderRadius: 6 }} />
        ))}
      </div>
    </div>
  );
}

// ── YouTube Watch Desktop ─────────────────────────────────────────────────────
function YouTubeWatchDesktop({ f, e, video, image }: any) {
  return (
    <div style={{ flex: 1, background: '#0f0f0f', display: 'flex', overflow: 'hidden' }}>
      {/* Left: player + info */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {/* Player */}
        <div style={{ width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: 8, overflow: 'hidden', marginBottom: 16, position: 'relative' }}>
          {video
            ? <video src={video} muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : image
              ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 32, opacity: 0.3 }}>▶</span></div>
          }
          {/* Controls bar */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent,rgba(0,0,0,0.8))', padding: '20px 12px 8px' }}>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.3)', borderRadius: 2, marginBottom: 6 }}>
              <div style={{ width: '35%', height: '100%', background: '#ff0000', borderRadius: 2, position: 'relative' }}>
                <div style={{ position: 'absolute', right: -6, top: -4, width: 12, height: 12, borderRadius: '50%', background: '#ff0000' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff', fontSize: 13 }}>
              <span>▶</span><span style={{ opacity: 0.7 }}>2:34 / 8:47</span>
              <span>🔊</span><div style={{ flex: 1 }} />
              <span>⚙</span><span>⛶</span>
            </div>
          </div>
        </div>
        {/* Title */}
        <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8, lineHeight: 1.3 }}>{f.title}</div>
        {/* Channel + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#ff0000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 16, color: '#fff', fontWeight: 900 }}>▶</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{f.channelName}</div>
            <div style={{ fontSize: 12, color: '#aaa' }}>{f.subscriberCount} subscribers</div>
          </div>
          <div style={{ background: '#fff', color: '#0f0f0f', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 700, marginLeft: 4 }}>Subscribe</div>
          <div style={{ flex: 1 }} />
          {[`👍 ${e.likes}`, '👎', '↗ Share', '✦ Ask', '⬇ Save', '···'].map((label, i) => (
            <div key={i} style={{ background: '#272727', borderRadius: 20, padding: '6px 12px', fontSize: 12, color: '#fff', flexShrink: 0 }}>{label}</div>
          ))}
        </div>
        {/* Description box */}
        <div style={{ background: '#272727', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#ccc', lineHeight: 1.6 }}>
          <div style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }}>{e.views} views · 3 days ago</div>
          {f.caption}
          <div style={{ marginTop: 6, color: '#3ea6ff', fontSize: 13 }}>{f.hashtags}</div>
        </div>
      </div>
      {/* Right: recommendations */}
      <div style={{ width: 360, flexShrink: 0, padding: '20px 12px', overflow: 'auto', background: '#0f0f0f', borderLeft: '1px solid #272727' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 12 }}>Up next</div>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 120, height: 68, background: '#272727', borderRadius: 6, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', lineHeight: 1.3, marginBottom: 4 }}>{f.title} — Part {i}</div>
              <div style={{ fontSize: 11, color: '#aaa' }}>{f.channelName}</div>
              <div style={{ fontSize: 11, color: '#aaa' }}>{Math.round(parseInt(e.views) * 0.4 || 12)}K views</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Instagram Desktop Feed ────────────────────────────────────────────────────
function InstagramFeedDesktop({ f, e, image, video }: any) {
  return (
    <div style={{ flex: 1, background: '#000', overflow: 'auto', display: 'flex', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 470, maxWidth: '100%' }}>
        {/* Top nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 12, borderBottom: '1px solid #262626' }}>
          <span style={{ fontSize: 22, color: '#fff', fontFamily: 'serif', fontStyle: 'italic', fontWeight: 700 }}>Instagram</span>
          <div style={{ display: 'flex', gap: 16 }}>
            <span style={{ fontSize: 22, color: '#fff' }}>♡</span>
            <span style={{ fontSize: 20, color: '#fff' }}>✉</span>
          </div>
        </div>
        {/* Post card */}
        <div style={{ border: '1px solid #262626', borderRadius: 3, background: '#000' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', padding: 2 }}>
              <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#111', border: '2px solid #000' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{f.displayName}</div>
              <div style={{ fontSize: 11, color: '#8e8e8e' }}>Sponsored</div>
            </div>
            <span style={{ color: '#fff', fontSize: 18 }}>···</span>
          </div>
          <div style={{ width: '100%', aspectRatio: '4/5', background: '#111', overflow: 'hidden', position: 'relative' }}>
            {video ? <video src={video} muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : image ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 32, opacity: 0.1 }}>◻</span></div>}
          </div>
          <div style={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', gap: 14, marginBottom: 8 }}>
              <span style={{ fontSize: 22, color: '#fff' }}>♡</span>
              <span style={{ fontSize: 20, color: '#fff' }}>💬</span>
              <span style={{ fontSize: 20, color: '#fff' }}>↗</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 20, color: '#fff' }}>🔖</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{e.likes} likes</div>
            <div style={{ fontSize: 13, color: '#fff' }}><span style={{ fontWeight: 700 }}>{f.displayName}</span> {f.caption}</div>
            <div style={{ fontSize: 12, color: '#8e8e8e', marginTop: 4 }}>{f.hashtags}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TikTok Desktop Feed ───────────────────────────────────────────────────────
function TikTokDesktopFeed({ f, e, image, video }: any) {
  return (
    <div style={{ flex: 1, background: '#121212', display: 'flex', overflow: 'hidden' }}>
      {/* Left sidebar */}
      <div style={{ width: 220, borderRight: '1px solid #2b2b2b', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 16 }}>TikTok</div>
        {['For You','Following','Explore','LIVE','Profile'].map((item, i) => (
          <div key={i} style={{ padding: '8px 10px', borderRadius: 6, background: i === 0 ? 'rgba(255,255,255,0.08)' : 'transparent', fontSize: 13, color: i === 0 ? '#fff' : '#8e8e8e', cursor: 'pointer' }}>{item}</div>
        ))}
      </div>
      {/* Main feed */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: 32 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', maxWidth: 600 }}>
          {/* Video card */}
          <div style={{ width: 320, background: '#1f1f1f', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ aspectRatio: '9/16', position: 'relative', background: '#000' }}>
              {video ? <video src={video} muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : image ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 32, opacity: 0.2 }}>▶</span></div>}
            </div>
          </div>
          {/* Info + actions */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(45deg,#f09433,#EE1D52)' }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{f.displayName}</div>
                <div style={{ fontSize: 11, color: '#8e8e8e' }}>{f.handle}</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#fff', lineHeight: 1.5, marginBottom: 10 }}>{f.caption}</div>
            <div style={{ fontSize: 12, color: '#8e8e8e', marginBottom: 16 }}>🎵 {f.soundName}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[['❤', e.likes], ['💬', e.comments], ['↗', e.shares], ['🔖', '']].map(([icon, count], i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{icon}</div>
                  {count && <span style={{ fontSize: 11, color: '#8e8e8e' }}>{count}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Facebook Desktop Feed ─────────────────────────────────────────────────────
function FacebookDesktopFeed({ f, e, image, video }: any) {
  return (
    <div style={{ flex: 1, background: '#18191A', overflow: 'auto', display: 'flex', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 500, maxWidth: '100%' }}>
        <div style={{ background: '#242526', border: '1px solid #3a3b3c', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', display: 'flex', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#3a3b3c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>👤</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#E4E6EB' }}>{f.displayName}</div>
              <div style={{ fontSize: 11, color: '#b0b3b8' }}>Just now · 🌐</div>
            </div>
          </div>
          <div style={{ padding: '0 14px 12px', fontSize: 14, color: '#E4E6EB', lineHeight: 1.5 }}>{f.caption}</div>
          <div style={{ aspectRatio: '16/9', position: 'relative', background: '#000', overflow: 'hidden' }}>
            {video ? <video src={video} muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : image ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : null}
          </div>
          <div style={{ padding: '8px 14px', borderTop: '1px solid #3a3b3c', display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#b0b3b8' }}>
            <span>👍❤ {e.likes}</span><span>{e.comments} comments · {e.shares} shares</span>
          </div>
          <div style={{ borderTop: '1px solid #3a3b3c', padding: '4px 0', display: 'flex', justifyContent: 'space-around' }}>
            {[['👍','Like'],['💬','Comment'],['↗','Share']].map(([icon, label], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', cursor: 'pointer', borderRadius: 6, fontSize: 13, color: '#b0b3b8', fontWeight: 600 }}>
                <span>{icon}</span><span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Google Shopping Desktop ───────────────────────────────────────────────────
function GoogleShoppingDesktop({ f, image }: any) {
  return (
    <div style={{ flex: 1, background: '#fff', overflow: 'auto' }}>
      {/* Search bar */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 24, fontWeight: 900 }}>
          <span style={{ color: '#4285F4' }}>G</span>
          <span style={{ color: '#EA4335' }}>o</span>
          <span style={{ color: '#FBBC05' }}>o</span>
          <span style={{ color: '#4285F4' }}>g</span>
          <span style={{ color: '#34A853' }}>l</span>
          <span style={{ color: '#EA4335' }}>e</span>
        </span>
        <div style={{ flex: 1, border: '1px solid #dfe1e5', borderRadius: 24, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#202124', boxShadow: '0 1px 6px rgba(32,33,36,0.1)' }}>
          <span>🔍</span> {f.productName}
        </div>
      </div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, padding: '0 24px', borderBottom: '1px solid #e0e0e0' }}>
        {['All','Shopping','Images','News','Videos','Maps'].map((tab, i) => (
          <div key={i} style={{ padding: '10px 14px', fontSize: 13, color: i === 1 ? '#1a73e8' : '#5f6368', fontWeight: i === 1 ? 700 : 400, borderBottom: i === 1 ? '3px solid #1a73e8' : 'none', marginBottom: i === 1 ? -1 : 0 }}>{tab}</div>
        ))}
      </div>
      {/* Product grid */}
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }}>
            <div style={{ aspectRatio: '1/1', background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {i === 1 && image ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <div style={{ width: '60%', height: '60%', background: '#e0e0e0', borderRadius: 4 }} />}
            </div>
            <div style={{ padding: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#202124', marginBottom: 2 }}>{f.productName}{i > 1 ? ` v${i}` : ''}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#202124' }}>{f.price}</div>
              <div style={{ fontSize: 11, color: '#70757a', marginTop: 2 }}>{f.displayName}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shopify Desktop ───────────────────────────────────────────────────────────
function ShopifyProductDesktop({ f, image }: any) {
  return (
    <div style={{ flex: 1, background: '#fff', overflow: 'auto' }}>
      {/* Nav */}
      <div style={{ padding: '0 40px', height: 60, borderBottom: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', gap: 32 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>{f.displayName}</span>
        <div style={{ flex: 1 }} />
        {['Home','Collections','About','Contact'].map(item => (
          <span key={item} style={{ fontSize: 13, color: '#767676', cursor: 'pointer' }}>{item}</span>
        ))}
        <span style={{ fontSize: 18, color: '#111' }}>🛒</span>
      </div>
      {/* Product layout */}
      <div style={{ display: 'flex', gap: 48, padding: 48, maxWidth: 1000, margin: '0 auto' }}>
        {/* Images */}
        <div style={{ width: 420, flexShrink: 0 }}>
          <div style={{ aspectRatio: '1/1', background: '#f6f6f6', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
            {image ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 32, opacity: 0.2 }}>◻</span></div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ width: 72, height: 72, background: '#f0f0f0', borderRadius: 4, border: i === 1 ? '2px solid #111' : '1px solid #ddd' }} />
            ))}
          </div>
        </div>
        {/* Info */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: '#767676', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{f.displayName}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#111', marginBottom: 8 }}>{f.productName}</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {'★★★★☆'.split('').map((s, i) => <span key={i} style={{ fontSize: 16, color: '#f5a623' }}>{s}</span>)}
            <span style={{ fontSize: 12, color: '#767676', marginLeft: 6 }}>127 reviews</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#111', marginBottom: 16 }}>{f.price}</div>
          <div style={{ fontSize: 14, color: '#767676', lineHeight: 1.6, marginBottom: 24 }}>{f.caption}</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, background: '#111', color: '#fff', borderRadius: 6, padding: '14px 0', textAlign: 'center', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Add to Cart</div>
            <div style={{ flex: 1, background: '#5a31f4', color: '#fff', borderRadius: 6, padding: '14px 0', textAlign: 'center', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Buy it now</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Twitter/X Desktop ─────────────────────────────────────────────────────────
function TwitterDesktopView({ f, e, image, video }: any) {
  return (
    <div style={{ flex: 1, background: '#000', display: 'flex', overflow: 'hidden' }}>
      {/* Left sidebar */}
      <div style={{ width: 240, padding: '16px 12px', borderRight: '1px solid #2f3336' }}>
        <span style={{ fontSize: 24, fontWeight: 900, color: '#fff', display: 'block', marginBottom: 20 }}>𝕏</span>
        {['Home','Explore','Notifications','Messages','Profile'].map((item, i) => (
          <div key={i} style={{ padding: '10px 12px', borderRadius: 30, fontSize: 16, color: i === 0 ? '#fff' : '#8e9093', fontWeight: i === 0 ? 700 : 400, cursor: 'pointer', marginBottom: 4 }}>{item}</div>
        ))}
      </div>
      {/* Main tweet */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div style={{ maxWidth: 560, borderBottom: '1px solid #2f3336', paddingBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>👤</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{f.displayName}</div>
              <div style={{ fontSize: 13, color: '#71767b' }}>{f.handle}</div>
            </div>
          </div>
          <div style={{ fontSize: 20, color: '#fff', lineHeight: 1.5, marginBottom: 12 }}>{f.caption}</div>
          {(image || video) && (
            <div style={{ borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9', marginBottom: 12, background: '#111' }}>
              {video ? <video src={video} muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : image ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : null}
            </div>
          )}
          <div style={{ fontSize: 14, color: '#71767b', marginBottom: 16 }}>9:41 AM · Jan 1, 2025 · 1.2M views</div>
          <div style={{ display: 'flex', gap: 28, color: '#71767b', fontSize: 14 }}>
            {[['💬', e.comments], ['↺', e.shares], ['❤', e.likes], ['📊', ''], ['↗', '']].map(([icon, count], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 18 }}>{icon}</span>
                {count && <span>{count}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pinterest Desktop ─────────────────────────────────────────────────────────
function PinterestDesktopView({ f, e, image }: any) {
  return (
    <div style={{ flex: 1, background: '#fff', overflow: 'auto' }}>
      {/* Nav */}
      <div style={{ height: 56, background: '#fff', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16 }}>
        <span style={{ fontSize: 22, color: '#E60023', fontWeight: 900 }}>Pinterest</span>
        <div style={{ flex: 1, background: '#efefef', borderRadius: 24, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, maxWidth: 500 }}>
          <span>🔍</span><span style={{ fontSize: 13, color: '#767676' }}>Search</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ background: '#E60023', color: '#fff', borderRadius: 24, padding: '7px 14px', fontSize: 13, fontWeight: 700 }}>Create</div>
      </div>
      {/* Masonry grid */}
      <div style={{ padding: 16, columns: 4, gap: 12 }}>
        {[1,2,3,4,5,6,7,8].map(i => (
          <div key={i} style={{ breakInside: 'avoid', marginBottom: 12, borderRadius: 16, overflow: 'hidden', background: '#efefef', cursor: 'pointer', position: 'relative' }}>
            <div style={{ aspectRatio: i % 3 === 0 ? '2/3' : i % 2 === 0 ? '1/1' : '3/4', background: '#ddd', overflow: 'hidden' }}>
              {i === 1 && image ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', background: `hsl(${(i * 40) % 360},20%,85%)` }} />}
            </div>
            {i === 1 && (
              <div style={{ padding: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{f.productName}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Snapchat Web ──────────────────────────────────────────────────────────────
function SnapchatWebView({ f, image, video }: any) {
  return (
    <div style={{ flex: 1, background: '#000', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 380, position: 'relative', aspectRatio: '9/16', borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
        {video ? <video src={video} muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : image ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ position: 'absolute', inset: 0, background: '#111' }} />}
        <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#FFFC00', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</div>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{f.displayName}</span>
        </div>
        <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: '#FFFC00', borderRadius: 30, padding: '10px 28px', fontSize: 15, fontWeight: 700, color: '#000' }}>Reply</div>
        </div>
      </div>
    </div>
  );
}

// ── Main desktop view router ──────────────────────────────────────────────────
export function DesktopPlatformView(props: DesktopPlatformViewProps) {
  const {
    platformId, viewId, imageUrl, videoUrl,
    conceptId, nicheId, copyOutput, strategyOutput, conceptHeadline,
    wireframe = false, onDismiss,
  } = props;

  const platform = PLATFORM_MAP[platformId];
  const view = platform?.views.find(v => v.id === viewId);
  if (!platform || !view) return null;

  const f = extractContentFields(nicheId, conceptId, copyOutput, strategyOutput, conceptHeadline);
  const e = getEngagementMetrics(platformId, viewId, conceptId);

  const urlMap: Partial<Record<ViewId, string>> = {
    yt_watch_desktop: 'youtube.com/watch?v=streams_preview',
    yt_search_desktop: 'youtube.com/results?search_query=' + encodeURIComponent(f.title),
    ig_profile: 'instagram.com/' + f.handle.replace('@',''),
    ig_feed_desktop: 'instagram.com',
    tt_foryou: 'tiktok.com',
    tt_profile_desktop: 'tiktok.com/' + f.handle,
    fb_feed_desktop: 'facebook.com',
    fb_watch_desktop: 'facebook.com/watch',
    g_shopping_desktop: 'google.com/search?tbm=shop&q=' + encodeURIComponent(f.productName),
    g_search_desktop: 'google.com/search?q=' + encodeURIComponent(f.productName),
    shop_product_desktop: 'store.myshopify.com/products/' + f.productName.toLowerCase().replace(/\s/g,'-'),
    shop_front_desktop: 'store.myshopify.com',
    tw_tweet_desktop: 'x.com/i/web/status/preview',
    tw_home_desktop: 'x.com/home',
    pin_page_desktop: 'pinterest.com/pin/preview',
    pin_board_desktop: 'pinterest.com/' + f.handle.replace('@',''),
    snap_story_desktop: 'snapchat.com/stories',
  };

  const shared = { f, e, image: imageUrl, video: videoUrl };

  const renderContent = () => {
    if (wireframe) return <WireframeDesktopView viewId={viewId} />;
    switch (viewId) {
      case 'yt_watch_desktop': case 'yt_search_desktop': return <YouTubeWatchDesktop {...shared} />;
      case 'ig_profile': case 'ig_feed_desktop': return <InstagramFeedDesktop {...shared} />;
      case 'tt_foryou': case 'tt_profile_desktop': return <TikTokDesktopFeed {...shared} />;
      case 'fb_feed_desktop': case 'fb_watch_desktop': return <FacebookDesktopFeed {...shared} />;
      case 'g_shopping_desktop': case 'g_search_desktop': return <GoogleShoppingDesktop {...shared} />;
      case 'shop_product_desktop': case 'shop_front_desktop': return <ShopifyProductDesktop {...shared} />;
      case 'tw_tweet_desktop': case 'tw_home_desktop': return <TwitterDesktopView {...shared} />;
      case 'pin_page_desktop': case 'pin_board_desktop': return <PinterestDesktopView {...shared} />;
      case 'snap_story_desktop': return <SnapchatWebView {...shared} />;
      default: return <WireframeDesktopView viewId={viewId} />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
      <BrowserChrome
        url={urlMap[viewId] ?? `${platformId}.com`}
        title={`${platform.name} — ${view.label}`}
        onDismiss={onDismiss}
      />
      {renderContent()}
    </div>
  );
}
