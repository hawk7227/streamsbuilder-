import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { YoutubeTranscript } from "youtube-transcript";

const YT_PATTERNS = [
  /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
  /youtu\.be\/([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
];

function extractVideoId(url: string): string | null {
  for (const p of YT_PATTERNS) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { url?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const url = body.url?.trim();
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  const videoId = extractVideoId(url);
  if (!videoId) return NextResponse.json({ error: "Could not extract YouTube video ID" }, { status: 400 });

  // Metadata via oEmbed
  let title = "", channelName = "", thumbnailUrl = "";
  try {
    const oEmbed = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (oEmbed.ok) {
      const d = await oEmbed.json() as { title?: string; author_name?: string; thumbnail_url?: string };
      title = d.title ?? "";
      channelName = d.author_name ?? "";
      thumbnailUrl = d.thumbnail_url ?? "";
    }
  } catch { /* non-fatal */ }

  // Real transcript via youtube-transcript
  let transcript = "";
  let transcriptSnippet = "";
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    transcript = segments.map(s => s.text).join(" ").replace(/\s+/g," ").trim();
    transcriptSnippet = transcript.slice(0, 500);
  } catch {
    transcript = "";
    transcriptSnippet = "[Transcript unavailable for this video]";
  }

  // Key messages — extract first few sentences as signals
  const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 20).slice(0, 5);

  return NextResponse.json({
    ok: true,
    type: "youtube",
    videoId,
    url,
    title,
    channelName,
    thumbnailUrl,
    transcript: transcript.slice(0, 20000),
    transcriptSnippet,
    wordCount: transcript.split(/\s+/).filter(Boolean).length,
    keyMessages: sentences.map(s => s.trim()),
  });
}
