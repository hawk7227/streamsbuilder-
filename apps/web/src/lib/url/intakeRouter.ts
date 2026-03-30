import { intakeWebsite } from '@/lib/url/websiteIntake';
import { intakeYouTube } from '@/lib/url/youtubeIntake';
import { analyzeIntakeContent } from '@/lib/url/derivativeAnalysis';

export type UrlIngestKind = 'website' | 'youtube' | 'document';

export function classifyUrl(url: string): UrlIngestKind {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  return 'website';
}

export async function ingestUrl(url: string) {
  const kind = classifyUrl(url);
  const source = kind === 'youtube' ? await intakeYouTube(url) : await intakeWebsite(url);
  const analysis = await analyzeIntakeContent({ url, source: source as unknown as Record<string, unknown>, kind });
  return { kind, source, analysis };
}
