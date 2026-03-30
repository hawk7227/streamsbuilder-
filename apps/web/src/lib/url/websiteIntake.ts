import { safeFetch } from '@/lib/security/security';
import * as cheerio from 'cheerio';

export interface WebsiteIntakeResult {
  title: string;
  description: string;
  headings: string[];
  content: string;
  screenshotCandidate: string | null;
}

export async function intakeWebsite(url: string): Promise<WebsiteIntakeResult> {
  const res = await safeFetch(url, {
    headers: { 'User-Agent': 'STREAMS-Phase2/1.0', Accept: 'text/html,*/*' },
    timeoutMs: 12000,
  });
  if (!res.ok) throw new Error(`Website fetch failed (${res.status})`);
  const html = await res.text();
  const $ = cheerio.load(html);
  $('script,style,noscript,iframe').remove();
  const content = $('main,article,body').first().text().replace(/\s{2,}/g, ' ').trim();
  return {
    title: $('title').first().text().trim(),
    description: $('meta[name="description"]').attr('content')?.trim() || '',
    headings: $('h1,h2,h3').map((_, el) => $(el).text().trim()).get().filter(Boolean).slice(0, 24),
    content: content.slice(0, 24000),
    screenshotCandidate: $('meta[property="og:image"]').attr('content')?.trim() || null,
  };
}
