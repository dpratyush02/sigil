/**
 * SIGIL API — Server-side Web/DuckDuckGo scanner
 */

import axios from 'axios';
import { ScanInput, ScanMatch, sanitize, analyseSimilarity, buildAlertId } from './types';

const DDG_URL = 'https://html.duckduckgo.com/html/';

export async function scanWeb(input: ScanInput): Promise<ScanMatch[]> {
  const query = encodeURIComponent(input.watermarkPattern.slice(0, 80));
  const matches: ScanMatch[] = [];

  try {
    const res = await axios.get(`${DDG_URL}?q=${query}`, {
      timeout: 12000,
      responseType: 'text',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SIGILBot/1.0; +https://sigil.app)' },
    });

    const html: string = res.data;
    // Extract result links + snippets from DDG HTML
    const linkRegex = /<a class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g;
    const snippetRegex = /<a class="result__snippet"[^>]*>([^<]*)<\/a>/g;

    const links: string[] = [];
    const titles: string[] = [];
    const snippets: string[] = [];

    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(html)) !== null) {
      links.push(sanitize(m[1]));
      titles.push(sanitize(m[2]));
    }
    while ((m = snippetRegex.exec(html)) !== null) {
      snippets.push(sanitize(m[1]));
    }

    const skipDomains = ['sigil.app', 'polygonscan.com', 'ipfs.io', 'pinata.cloud', 'duckduckgo.com'];

    for (let i = 0; i < Math.min(links.length, 8); i++) {
      const url = links[i];
      if (!url || skipDomains.some((d) => url.includes(d))) continue;
      const text = `${titles[i] ?? ''} ${snippets[i] ?? ''}`.trim();
      const sim = analyseSimilarity(input.rawOriginal ?? input.watermarkPattern, text);
      const confidence = text.includes(input.watermarkPattern) ? Math.max(sim.confidence, 75) : sim.confidence;
      if (confidence < 40) continue;
      matches.push({
        source: 'Web',
        url,
        title: titles[i] ?? url,
        confidence,
        detectedAt: Date.now(),
        alertId: buildAlertId('web', input.contentHash),
      });
    }
  } catch (err: any) {
    console.error('[Web] Scan error:', err?.message);
  }

  return matches;
}
