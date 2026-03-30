import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as cheerio from "cheerio";

// ── SSRF protection ────────────────────────────────────────────────────────
const BLOCKED_RANGES = [
  /^127\./,/^10\./,/^192\.168\./,/^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,/^::1$/,/^fc00:/,/^fe80:/,/^0\.0\.0\.0$/,
];

function isSsrfBlocked(hostname: string): boolean {
  return BLOCKED_RANGES.some(r => r.test(hostname));
}

function classifyUrl(url: string): "youtube" | "pdf" | "doc" | "site" {
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  if (/\.pdf($|\?)/.test(url)) return "pdf";
  if (/\.(docx?|xlsx?|pptx?)($|\?)/.test(url)) return "doc";
  return "site";
}

async function safeFetch(url: string, timeoutMs = 10000): Promise<Response> {
  const parsed = new URL(url);
  if (isSsrfBlocked(parsed.hostname)) {
    throw new Error("Blocked: private/reserved IP range");
  }
  return fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "STREAMS-Intake/1.0", Accept: "text/html,*/*" },
  });
}

function extractMainContent($: ReturnType<typeof cheerio.load>): string {
  // Remove noise
  $("script,style,nav,header,footer,aside,[role=banner],[role=navigation],[role=complementary],iframe,noscript,.cookie-banner,.popup,.modal,.ad,.ads,.advertisement").remove();
  // Prefer semantic content areas
  const main = $("main, article, [role=main], .content, #content, .post, .entry").first();
  const text = (main.length ? main.text() : $("body").text())
    .replace(/\s{3,}/g, "\n\n")
    .replace(/\n{4,}/g, "\n\n")
    .trim();
  return text.slice(0, 20000);
}

function extractMetadata($: ReturnType<typeof cheerio.load>, url: string) {
  const get = (sel: string, attr = "content") =>
    $(sel).first().attr(attr)?.trim() ?? "";
  return {
    title:       get("meta[property='og:title']") || get("meta[name='title']") || $("title").text().trim(),
    description: get("meta[property='og:description']") || get("meta[name='description']"),
    image:       get("meta[property='og:image']"),
    siteName:    get("meta[property='og:site_name']"),
    url,
    headings:    $("h1,h2,h3").map((_,el) => $(el).text().trim()).get().slice(0,20),
    links:       $("a[href]").map((_,el) => $(el).attr("href")).get()
                   .filter((h): h is string => !!h && h.startsWith("http"))
                   .slice(0,30),
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { url?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const url = body.url?.trim();
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  let parsed: URL;
  try { parsed = new URL(url); } catch { return NextResponse.json({ error: "Invalid URL" }, { status: 400 }); }
  if (!["http:","https:"].includes(parsed.protocol)) {
    return NextResponse.json({ error: "Only http/https URLs are allowed" }, { status: 400 });
  }
  if (isSsrfBlocked(parsed.hostname)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  const urlType = classifyUrl(url);

  try {
    const res = await safeFetch(url);
    if (!res.ok) return NextResponse.json({ error: `Fetch failed: ${res.status}` }, { status: 422 });

    const html = await res.text();
    const $ = cheerio.load(html);
    const metadata = extractMetadata($, url);
    const content = extractMainContent($);

    return NextResponse.json({
      ok: true,
      url,
      type: urlType,
      title:       metadata.title,
      description: metadata.description,
      image:       metadata.image,
      siteName:    metadata.siteName,
      headings:    metadata.headings,
      content,
      wordCount:   content.split(/\s+/).filter(Boolean).length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Fetch failed" },
      { status: 500 }
    );
  }
}
