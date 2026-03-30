// ── Platform View System ─────────────────────────────────────────────────────
// Single source of truth for all platform definitions, view configs,
// safe zone specs, content field mappings, and engagement metric ratios.
// All dimensions in CSS points at 430×932 base viewport.

export type PlatformId =
  | 'instagram' | 'tiktok' | 'facebook' | 'youtube'
  | 'pinterest' | 'google' | 'shopify' | 'twitter' | 'snapchat';

export type ViewId =
  // Instagram
  | 'ig_feed' | 'ig_story' | 'ig_reels'
  | 'ig_profile' | 'ig_feed_desktop'
  // TikTok
  | 'tt_video' | 'tt_slideshow'
  | 'tt_foryou' | 'tt_profile_desktop'
  // Facebook
  | 'fb_photo' | 'fb_video'
  | 'fb_feed_desktop' | 'fb_watch_desktop'
  // YouTube
  | 'yt_shorts' | 'yt_watch_mobile'
  | 'yt_watch_desktop' | 'yt_search_desktop'
  // Pinterest
  | 'pin_card' | 'pin_closeup'
  | 'pin_page_desktop' | 'pin_board_desktop'
  // Google
  | 'g_shopping_card' | 'g_search_mobile'
  | 'g_shopping_desktop' | 'g_search_desktop'
  // Shopify
  | 'shop_product' | 'shop_collection'
  | 'shop_product_desktop' | 'shop_front_desktop'
  // Twitter/X
  | 'tw_tweet' | 'tw_thread'
  | 'tw_tweet_desktop' | 'tw_home_desktop'
  // Snapchat
  | 'snap_image' | 'snap_video'
  | 'snap_story_desktop';

export type ViewDestination = 'mobile' | 'desktop';
export type ContentType = 'image' | 'video' | 'both' | 'none';

export interface SafeZone {
  top: number;    // points from top of content — blocked by platform UI
  bottom: number; // points from bottom
  left: number;
  right: number;
  label: string;  // human description
}

export interface PlatformView {
  id: ViewId;
  label: string;
  destination: ViewDestination;
  contentType: ContentType;  // what content this view accepts
  aspectRatio: '9:16' | '4:5' | '1:1' | '16:9' | '2:3' | 'free';
  safeZone: SafeZone;
  // Engagement metric config — ratios relative to view count
  engagement: {
    likeRatio: number;    // likes / views
    commentRatio: number;
    shareRatio: number;
  };
}

export interface PlatformDef {
  id: PlatformId;
  name: string;
  color: string;       // brand primary color
  bgColor: string;     // app background
  textColor: string;   // primary text
  views: PlatformView[];
}

// ── Safe zone specs (all in points at 430×932 base) ──────────────────────────
// TikTok/Reels/Shorts: right bar 72pt wide, bottom caption 140pt, top 80pt
// Instagram feed: bottom bar 56pt, top bar 54pt
// YouTube watch: top bar 54pt, player controls 48pt over video

export const PLATFORMS: PlatformDef[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    color: '#E1306C',
    bgColor: '#000000',
    textColor: '#ffffff',
    views: [
      {
        id: 'ig_feed', label: 'Feed Post', destination: 'mobile',
        contentType: 'both', aspectRatio: '4:5',
        safeZone: { top: 54, bottom: 56, left: 0, right: 0, label: 'Status bar + nav bar' },
        engagement: { likeRatio: 0.06, commentRatio: 0.008, shareRatio: 0.004 },
      },
      {
        id: 'ig_story', label: 'Story', destination: 'mobile',
        contentType: 'both', aspectRatio: '9:16',
        safeZone: { top: 80, bottom: 120, left: 0, right: 0, label: 'Header + reply bar' },
        engagement: { likeRatio: 0.04, commentRatio: 0.005, shareRatio: 0.003 },
      },
      {
        id: 'ig_reels', label: 'Reels', destination: 'mobile',
        contentType: 'video', aspectRatio: '9:16',
        safeZone: { top: 80, bottom: 140, left: 0, right: 72, label: 'Header + caption + action bar' },
        engagement: { likeRatio: 0.08, commentRatio: 0.01, shareRatio: 0.006 },
      },
      {
        id: 'ig_profile', label: 'Profile Page', destination: 'desktop',
        contentType: 'both', aspectRatio: 'free',
        safeZone: { top: 0, bottom: 0, left: 0, right: 0, label: 'No safe zone restriction' },
        engagement: { likeRatio: 0.06, commentRatio: 0.008, shareRatio: 0.004 },
      },
      {
        id: 'ig_feed_desktop', label: 'Feed Scroll', destination: 'desktop',
        contentType: 'both', aspectRatio: 'free',
        safeZone: { top: 0, bottom: 0, left: 0, right: 0, label: 'No safe zone restriction' },
        engagement: { likeRatio: 0.06, commentRatio: 0.008, shareRatio: 0.004 },
      },
    ],
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    color: '#FE2C55',
    bgColor: '#000000',
    textColor: '#ffffff',
    views: [
      {
        id: 'tt_video', label: 'Video', destination: 'mobile',
        contentType: 'video', aspectRatio: '9:16',
        safeZone: { top: 80, bottom: 160, left: 0, right: 72, label: 'Nav + caption + action bar' },
        engagement: { likeRatio: 0.10, commentRatio: 0.015, shareRatio: 0.008 },
      },
      {
        id: 'tt_slideshow', label: 'Image Slideshow', destination: 'mobile',
        contentType: 'image', aspectRatio: '9:16',
        safeZone: { top: 80, bottom: 160, left: 0, right: 72, label: 'Nav + caption + action bar' },
        engagement: { likeRatio: 0.08, commentRatio: 0.012, shareRatio: 0.006 },
      },
      {
        id: 'tt_foryou', label: 'For You Feed', destination: 'desktop',
        contentType: 'both', aspectRatio: 'free',
        safeZone: { top: 0, bottom: 0, left: 0, right: 0, label: 'No safe zone restriction' },
        engagement: { likeRatio: 0.10, commentRatio: 0.015, shareRatio: 0.008 },
      },
      {
        id: 'tt_profile_desktop', label: 'Profile Page', destination: 'desktop',
        contentType: 'both', aspectRatio: 'free',
        safeZone: { top: 0, bottom: 0, left: 0, right: 0, label: 'No safe zone restriction' },
        engagement: { likeRatio: 0.10, commentRatio: 0.015, shareRatio: 0.008 },
      },
    ],
  },
  {
    id: 'facebook',
    name: 'Facebook',
    color: '#1877F2',
    bgColor: '#18191A',
    textColor: '#E4E6EB',
    views: [
      {
        id: 'fb_photo', label: 'Photo Post', destination: 'mobile',
        contentType: 'image', aspectRatio: '4:5',
        safeZone: { top: 54, bottom: 56, left: 0, right: 0, label: 'Status bar + nav bar' },
        engagement: { likeRatio: 0.04, commentRatio: 0.006, shareRatio: 0.003 },
      },
      {
        id: 'fb_video', label: 'Video Post', destination: 'mobile',
        contentType: 'video', aspectRatio: '16:9',
        safeZone: { top: 54, bottom: 56, left: 0, right: 0, label: 'Status bar + nav bar' },
        engagement: { likeRatio: 0.05, commentRatio: 0.008, shareRatio: 0.005 },
      },
      {
        id: 'fb_feed_desktop', label: 'News Feed Post', destination: 'desktop',
        contentType: 'both', aspectRatio: 'free',
        safeZone: { top: 0, bottom: 0, left: 0, right: 0, label: 'No safe zone restriction' },
        engagement: { likeRatio: 0.04, commentRatio: 0.006, shareRatio: 0.003 },
      },
      {
        id: 'fb_watch_desktop', label: 'Watch Page', destination: 'desktop',
        contentType: 'video', aspectRatio: 'free',
        safeZone: { top: 0, bottom: 0, left: 0, right: 0, label: 'No safe zone restriction' },
        engagement: { likeRatio: 0.05, commentRatio: 0.008, shareRatio: 0.005 },
      },
    ],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    color: '#FF0000',
    bgColor: '#0F0F0F',
    textColor: '#FFFFFF',
    views: [
      {
        id: 'yt_shorts', label: 'Shorts', destination: 'mobile',
        contentType: 'video', aspectRatio: '9:16',
        safeZone: { top: 0, bottom: 160, left: 0, right: 72, label: 'Caption + action bar' },
        engagement: { likeRatio: 0.06, commentRatio: 0.008, shareRatio: 0.004 },
      },
      {
        id: 'yt_watch_mobile', label: 'Long-form Watch', destination: 'mobile',
        contentType: 'video', aspectRatio: '16:9',
        safeZone: { top: 54, bottom: 56, left: 0, right: 0, label: 'Status bar + bottom nav' },
        engagement: { likeRatio: 0.04, commentRatio: 0.005, shareRatio: 0.003 },
      },
      {
        id: 'yt_watch_desktop', label: 'Watch Page', destination: 'desktop',
        contentType: 'video', aspectRatio: 'free',
        safeZone: { top: 0, bottom: 0, left: 0, right: 0, label: 'No safe zone restriction' },
        engagement: { likeRatio: 0.04, commentRatio: 0.005, shareRatio: 0.003 },
      },
      {
        id: 'yt_search_desktop', label: 'Search Results', destination: 'desktop',
        contentType: 'both', aspectRatio: 'free',
        safeZone: { top: 0, bottom: 0, left: 0, right: 0, label: 'No safe zone restriction' },
        engagement: { likeRatio: 0.04, commentRatio: 0.005, shareRatio: 0.003 },
      },
    ],
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    color: '#E60023',
    bgColor: '#EFEFEF',
    textColor: '#111111',
    views: [
      {
        id: 'pin_card', label: 'Pin Card', destination: 'mobile',
        contentType: 'image', aspectRatio: '2:3',
        safeZone: { top: 54, bottom: 56, left: 0, right: 0, label: 'Status bar + nav bar' },
        engagement: { likeRatio: 0.03, commentRatio: 0.002, shareRatio: 0.015 },
      },
      {
        id: 'pin_closeup', label: 'Pin Closeup', destination: 'mobile',
        contentType: 'image', aspectRatio: '2:3',
        safeZone: { top: 54, bottom: 120, left: 0, right: 0, label: 'Status bar + info panel' },
        engagement: { likeRatio: 0.03, commentRatio: 0.002, shareRatio: 0.015 },
      },
      {
        id: 'pin_page_desktop', label: 'Pin Page', destination: 'desktop',
        contentType: 'image', aspectRatio: 'free',
        safeZone: { top: 0, bottom: 0, left: 0, right: 0, label: 'No safe zone restriction' },
        engagement: { likeRatio: 0.03, commentRatio: 0.002, shareRatio: 0.015 },
      },
      {
        id: 'pin_board_desktop', label: 'Board View', destination: 'desktop',
        contentType: 'image', aspectRatio: 'free',
        safeZone: { top: 0, bottom: 0, left: 0, right: 0, label: 'No safe zone restriction' },
        engagement: { likeRatio: 0.03, commentRatio: 0.002, shareRatio: 0.015 },
      },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    color: '#4285F4',
    bgColor: '#FFFFFF',
    textColor: '#202124',
    views: [
      {
        id: 'g_shopping_card', label: 'Shopping Card', destination: 'mobile',
        contentType: 'image', aspectRatio: '1:1',
        safeZone: { top: 54, bottom: 56, left: 0, right: 0, label: 'Status bar + nav' },
        engagement: { likeRatio: 0, commentRatio: 0, shareRatio: 0 },
      },
      {
        id: 'g_search_mobile', label: 'Search Results', destination: 'mobile',
        contentType: 'image', aspectRatio: '1:1',
        safeZone: { top: 54, bottom: 56, left: 0, right: 0, label: 'Status bar + nav' },
        engagement: { likeRatio: 0, commentRatio: 0, shareRatio: 0 },
      },
      {
        id: 'g_shopping_desktop', label: 'Shopping Tab', destination: 'desktop',
        contentType: 'image', aspectRatio: 'free',
        safeZone: { top: 0, bottom: 0, left: 0, right: 0, label: 'No safe zone restriction' },
        engagement: { likeRatio: 0, commentRatio: 0, shareRatio: 0 },
      },
      {
        id: 'g_search_desktop', label: 'Search Page', destination: 'desktop',
        contentType: 'image', aspectRatio: 'free',
        safeZone: { top: 0, bottom: 0, left: 0, right: 0, label: 'No safe zone restriction' },
        engagement: { likeRatio: 0, commentRatio: 0, shareRatio: 0 },
      },
    ],
  },
  {
    id: 'shopify',
    name: 'Shop',
    color: '#96BF48',
    bgColor: '#FFFFFF',
    textColor: '#212326',
    views: [
      {
        id: 'shop_product', label: 'Product Page', destination: 'mobile',
        contentType: 'image', aspectRatio: '1:1',
        safeZone: { top: 54, bottom: 80, left: 0, right: 0, label: 'Status bar + cart bar' },
        engagement: { likeRatio: 0, commentRatio: 0, shareRatio: 0 },
      },
      {
        id: 'shop_collection', label: 'Collection Grid', destination: 'mobile',
        contentType: 'image', aspectRatio: '1:1',
        safeZone: { top: 54, bottom: 56, left: 0, right: 0, label: 'Status bar + nav' },
        engagement: { likeRatio: 0, commentRatio: 0, shareRatio: 0 },
      },
      {
        id: 'shop_product_desktop', label: 'Product Page', destination: 'desktop',
        contentType: 'image', aspectRatio: 'free',
        safeZone: { top: 0, bottom: 0, left: 0, right: 0, label: 'No safe zone restriction' },
        engagement: { likeRatio: 0, commentRatio: 0, shareRatio: 0 },
      },
      {
        id: 'shop_front_desktop', label: 'Store Front', destination: 'desktop',
        contentType: 'image', aspectRatio: 'free',
        safeZone: { top: 0, bottom: 0, left: 0, right: 0, label: 'No safe zone restriction' },
        engagement: { likeRatio: 0, commentRatio: 0, shareRatio: 0 },
      },
    ],
  },
  {
    id: 'twitter',
    name: 'X',
    color: '#000000',
    bgColor: '#000000',
    textColor: '#FFFFFF',
    views: [
      {
        id: 'tw_tweet', label: 'Tweet Card', destination: 'mobile',
        contentType: 'both', aspectRatio: '16:9',
        safeZone: { top: 54, bottom: 56, left: 0, right: 0, label: 'Status bar + nav bar' },
        engagement: { likeRatio: 0.03, commentRatio: 0.004, shareRatio: 0.006 },
      },
      {
        id: 'tw_thread', label: 'Thread View', destination: 'mobile',
        contentType: 'both', aspectRatio: '16:9',
        safeZone: { top: 54, bottom: 56, left: 0, right: 0, label: 'Status bar + nav bar' },
        engagement: { likeRatio: 0.03, commentRatio: 0.004, shareRatio: 0.006 },
      },
      {
        id: 'tw_tweet_desktop', label: 'Tweet Page', destination: 'desktop',
        contentType: 'both', aspectRatio: 'free',
        safeZone: { top: 0, bottom: 0, left: 0, right: 0, label: 'No safe zone restriction' },
        engagement: { likeRatio: 0.03, commentRatio: 0.004, shareRatio: 0.006 },
      },
      {
        id: 'tw_home_desktop', label: 'Home Feed', destination: 'desktop',
        contentType: 'both', aspectRatio: 'free',
        safeZone: { top: 0, bottom: 0, left: 0, right: 0, label: 'No safe zone restriction' },
        engagement: { likeRatio: 0.03, commentRatio: 0.004, shareRatio: 0.006 },
      },
    ],
  },
  {
    id: 'snapchat',
    name: 'Snapchat',
    color: '#FFFC00',
    bgColor: '#000000',
    textColor: '#FFFFFF',
    views: [
      {
        id: 'snap_image', label: 'Snap (Image)', destination: 'mobile',
        contentType: 'image', aspectRatio: '9:16',
        safeZone: { top: 80, bottom: 100, left: 0, right: 0, label: 'Header + reply bar' },
        engagement: { likeRatio: 0, commentRatio: 0, shareRatio: 0 },
      },
      {
        id: 'snap_video', label: 'Snap (Video)', destination: 'mobile',
        contentType: 'video', aspectRatio: '9:16',
        safeZone: { top: 80, bottom: 100, left: 0, right: 0, label: 'Header + reply bar' },
        engagement: { likeRatio: 0, commentRatio: 0, shareRatio: 0 },
      },
      {
        id: 'snap_story_desktop', label: 'Story Web View', destination: 'desktop',
        contentType: 'both', aspectRatio: 'free',
        safeZone: { top: 0, bottom: 0, left: 0, right: 0, label: 'No safe zone restriction' },
        engagement: { likeRatio: 0, commentRatio: 0, shareRatio: 0 },
      },
    ],
  },
];

export const PLATFORM_MAP = Object.fromEntries(PLATFORMS.map(p => [p.id, p])) as Record<PlatformId, PlatformDef>;

// ── Engagement metric seeding ─────────────────────────────────────────────────
// Seeded from conceptId so numbers are stable per concept, look realistic per platform.

function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return Math.abs(h) / 2147483647;
}

export function getEngagementMetrics(
  platformId: PlatformId,
  viewId: ViewId,
  conceptId: string,
): { views: string; likes: string; comments: string; shares: string } {
  const platform = PLATFORM_MAP[platformId];
  const view = platform?.views.find(v => v.id === viewId);
  if (!view) return { views: '0', likes: '0', comments: '0', shares: '0' };

  const rng = seededRandom(`${conceptId}:${platformId}:${viewId}`);
  const rng2 = seededRandom(`${conceptId}:${platformId}:${viewId}:2`);

  // Base view count: 1K–500K range, log-distributed
  const baseViews = Math.round(1000 * Math.pow(500, rng));
  const views2 = Math.round(baseViews * (0.8 + rng2 * 0.4));

  const likes = Math.round(views2 * view.engagement.likeRatio);
  const comments = Math.round(views2 * view.engagement.commentRatio);
  const shares = Math.round(views2 * view.engagement.shareRatio);

  function fmt(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
    return String(n);
  }

  return { views: fmt(views2), likes: fmt(likes), comments: fmt(comments), shares: fmt(shares) };
}

// ── Content field extraction from pipeline data ───────────────────────────────

export interface PlatformContentFields {
  username: string;
  handle: string;
  displayName: string;
  caption: string;
  title: string;
  productName: string;
  price: string;
  hashtags: string;
  soundName: string;
  subscriberCount: string;
  channelName: string;
}

export function extractContentFields(
  nicheId: string,
  conceptId: string,
  copyOutput?: string,
  strategyOutput?: string,
  conceptHeadline?: string,
): PlatformContentFields {
  const rng = seededRandom(`${conceptId}:fields`);
  const niche = nicheId || 'general';
  const nicheLabel = niche.charAt(0).toUpperCase() + niche.slice(1);

  // Username derived from niche
  const handle = `@${niche.toLowerCase().replace(/\s+/g, '_')}_brand`;
  const displayName = `${nicheLabel} Brand`;

  // Caption from copy output or headline, truncated
  const rawCaption = copyOutput || conceptHeadline || `Discover the best in ${niche}`;
  const caption = rawCaption.slice(0, 125);

  // Title from strategy or headline
  const title = conceptHeadline || `${nicheLabel} — ${new Date().getFullYear()}`;

  // Product name
  const productName = conceptHeadline || `${nicheLabel} Product`;

  // Price — seeded realistic
  const priceBase = [9.99, 14.99, 19.99, 24.99, 29.99, 39.99, 49.99, 59.99, 79.99, 99.99];
  const price = `$${priceBase[Math.floor(rng * priceBase.length)]}`;

  // Hashtags from niche
  const hashtags = `#${niche} #content #trending #viral`;

  // Sound name
  const soundName = `Original Sound · ${displayName}`;

  // Subscriber count — seeded
  const subs = Math.round(1000 * Math.pow(1000, seededRandom(`${conceptId}:subs`)));
  function fmtSubs(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  }
  const subscriberCount = fmtSubs(subs);
  const channelName = `${nicheLabel} Channel`;

  return {
    username: handle,
    handle,
    displayName,
    caption,
    title,
    productName,
    price,
    hashtags,
    soundName,
    subscriberCount,
    channelName,
  };
}
