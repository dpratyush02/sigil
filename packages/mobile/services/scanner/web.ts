/**
 * SIGIL — Web scanner (DuckDuckGo HTML scrape + paste sites)
 * No API key needed — scrapes public HTML.
 */

import axios from 'axios';
import { ScanInput, ScannerSource, SigilAlert, buildAlert, getCached, setCached, sanitize, isMatch, analyseSimilarity } from './base';
import { withRetry } from '../../utils/rateLimit';
import { Logger } from '../../utils/logger';

const SOURCE = 'Web' as const;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchAndStrip(url: string): Promise<string> {
  try {
    const res = await axios.get<string>(url, {
      timeout: 8000,
      responseType: 'text',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SIGILBot/1.0)' },
      maxRedirects: 3,
    });
    return sanitize(stripHtml(typeof res.data === 'string' ? res.data : '').slice(0, 5000));
  } catch {
    return '';
  }
}

export const WebScanner: ScannerSource = {
  name: SOURCE,

  async scan(input: ScanInput): Promise<SigilAlert[]> {
    const cacheKey = `web_${input.contentHash}_${input.watermarkPattern.slice(0, 20)}`;
    const cached = await getCached(cacheKey);
    if (cached) return cached;

    const original = input.rawOriginal || input.watermarkPattern;
    const query = encodeURIComponent(input.watermarkPattern.slice(0, 80));
    const alerts: SigilAlert[] = [];

    try {
      // DuckDuckGo HTML endpoint (no API key required)
      const ddgRes = await withRetry(
        () =>
          axios.get(`https://html.duckduckgo.com/html/?q=${query}`, {
            timeout: 12000,
            responseType: 'text',
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SIGILBot/1.0)' },
          }),
        { source: SOURCE, maxRetries: 2, timeoutMs: 15000 }
      );

      // Extract result URLs from DDG HTML
      const html: string = typeof ddgRes.data === 'string' ? ddgRes.data : '';
      const urlMatches = html.matchAll(/href="\/\/duckduckgo\.com\/l\/\?uddg=([^"&]+)/g);
      const urls: string[] = [];
      for (const m of urlMatches) {
        try {
          const decoded = decodeURIComponent(m[1]);
          if (decoded.startsWith('https://') && urls.length < 5) {
            urls.push(decoded);
          }
        } catch {}
      }

      Logger.info('scanner', `Web: ${urls.length} URLs from DDG`);

      for (const url of urls) {
        // Skip known large sites that have own scanners
        if (/github\.com|reddit\.com|stackoverflow\.com|npmjs\.com|huggingface\.co/.test(url)) continue;

        const pageText = await fetchAndStrip(url);
        if (!pageText) continue;
        const result = analyseSimilarity(original, pageText, input.contentType === 'code');

        if (isMatch(result.confidence)) {
          alerts.push(
            buildAlert(
              `web_${Buffer.from(url).toString('base64').slice(0, 16)}_${input.contentHash.slice(0, 8)}`,
              input,
              SOURCE,
              url,
              pageText,
              result
            )
          );
          Logger.info('scanner', `Web match: ${result.confidence}% — ${url}`);
        }
      }
    } catch (err: any) {
      Logger.error('scanner', 'Web scan failed', { msg: err?.message });
    }

    await setCached(cacheKey, alerts);
    return alerts;
  },
};
