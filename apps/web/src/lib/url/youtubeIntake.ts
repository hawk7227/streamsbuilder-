import { YoutubeTranscript } from 'youtube-transcript';

export interface YouTubeIntakeResult {
  videoId: string;
  title: string;
  channelName: string;
  transcript: string;
  keyMessages: string[];
  thumbnailUrl: string;
}

function extractVideoId(url: string): string {
  const patterns = [
    /youtube\.com\/watch\?v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  throw new Error('Could not extract YouTube ID');
}

export async function intakeYouTube(url: string): Promise<YouTubeIntakeResult> {
  const videoId = extractVideoId(url);
  const transcriptSegs = await YoutubeTranscript.fetchTranscript(videoId);
  const transcript = transcriptSegs.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();

  let title = '';
  let channelName = '';
  let thumbnailUrl = '';
  try {
    const meta = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, { signal: AbortSignal.timeout(8000) });
    if (meta.ok) {
      const json = await meta.json() as { title?: string; author_name?: string; thumbnail_url?: string };
      title = json.title || '';
      channelName = json.author_name || '';
      thumbnailUrl = json.thumbnail_url || '';
    }
  } catch {}

  return {
    videoId,
    title,
    channelName,
    transcript: transcript.slice(0, 50000),
    keyMessages: transcript.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 24).slice(0, 8),
    thumbnailUrl,
  };
}
