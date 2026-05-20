/**
 * SIGIL API — Server-side GitHub scanner
 * Token lives server-side; no longer exposed in Expo env vars.
 */

import axios from 'axios';
import { ScanInput, ScanMatch, sanitize, analyseSimilarity, buildAlertId } from './types';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';

async function fetchRaw(rawUrl: string): Promise<string> {
  try {
    const res = await axios.get<string>(rawUrl, {
      timeout: 8000,
      responseType: 'text',
      headers: GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {},
    });
    return typeof res.data === 'string' ? sanitize(res.data.slice(0, 6000)) : '';
  } catch {
    return '';
  }
}

export async function scanGitHub(input: ScanInput): Promise<ScanMatch[]> {
  if (!GITHUB_TOKEN) {
    console.warn('[GitHub] GITHUB_TOKEN not set — skipping');
    return [];
  }

  try {
    const res = await axios.get('https://api.github.com/search/code', {
      params: { q: input.watermarkPattern, per_page: 10 },
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
      },
      timeout: 12000,
    });

    const items: any[] = res.data?.items ?? [];
    const original = input.rawOriginal ?? input.watermarkPattern;
    const matches: ScanMatch[] = [];

    for (const item of items) {
      if (!item?.html_url) continue;
      const rawContent = item.url ? await fetchRaw(item.url.replace('api.github.com/repos', 'raw.githubusercontent.com').replace('/contents/', '/')) : '';
      const sim = analyseSimilarity(original, rawContent || item.path || '');
      if (sim.confidence < 50 && !rawContent.includes(input.watermarkPattern)) continue;
      const confidence = rawContent.includes(input.watermarkPattern) ? Math.max(sim.confidence, 80) : sim.confidence;
      matches.push({
        source: 'GitHub',
        url: sanitize(item.html_url),
        title: sanitize(item.path ?? item.name ?? 'Unknown file'),
        confidence,
        detectedAt: Date.now(),
        alertId: buildAlertId('github', input.contentHash),
      });
    }

    return matches;
  } catch (err: any) {
    console.error('[GitHub] Scan error:', err?.message);
    return [];
  }
}
