/**
 * SIGIL API — Server-side Reddit scanner
 */

import axios from 'axios';
import { ScanInput, ScanMatch, sanitize, analyseSimilarity, buildAlertId } from './types';

export async function scanReddit(input: ScanInput): Promise<ScanMatch[]> {
  const query = encodeURIComponent(input.watermarkPattern.slice(0, 100));
  const matches: ScanMatch[] = [];

  try {
    const res = await axios.get(
      `https://www.reddit.com/search.json?q=${query}&sort=new&limit=10`,
      {
        timeout: 10000,
        headers: { 'User-Agent': 'SIGILBot/1.0 (copyright monitoring; contact: support@sigil.app)' },
      }
    );

    const posts: any[] = res.data?.data?.children ?? [];
    for (const post of posts) {
      const d = post.data;
      if (!d?.url) continue;
      const text = `${d.title ?? ''} ${d.selftext ?? ''}`.slice(0, 2000);
      const sim = analyseSimilarity(input.rawOriginal ?? input.watermarkPattern, text);
      const confidence = text.includes(input.watermarkPattern) ? Math.max(sim.confidence, 72) : sim.confidence;
      if (confidence < 45) continue;
      matches.push({
        source: 'Reddit',
        url: sanitize(`https://reddit.com${d.permalink ?? d.url}`),
        title: sanitize(d.title ?? 'Reddit post'),
        confidence,
        detectedAt: Date.now(),
        alertId: buildAlertId('reddit', input.contentHash),
      });
    }
  } catch (err: any) {
    console.error('[Reddit] Scan error:', err?.message);
  }

  return matches;
}
