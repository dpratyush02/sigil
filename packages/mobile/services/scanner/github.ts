/**
 * SIGIL — GitHub scanner
 * Fetches raw file content, runs multi-layer analysis.
 * Respects rate limit headers + circuit breaker.
 */

import axios from 'axios';
import { ScanInput, ScannerSource, SigilAlert, buildAlert, getCached, setCached, sanitize, isMatch, analyseSimilarity } from './base';
import { withRetry, recordSuccess } from '../../utils/rateLimit';
import { Logger } from '../../utils/logger';

const GITHUB_TOKEN = process.env.EXPO_PUBLIC_GITHUB_TOKEN || '';
const SOURCE = 'GitHub' as const;

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

export const GitHubScanner: ScannerSource = {
  name: SOURCE,

  async scan(input: ScanInput): Promise<SigilAlert[]> {
    if (!GITHUB_TOKEN) {
      Logger.warn('scanner', 'GitHub token not configured — skipping');
      return [];
    }

    const cacheKey = `gh_${input.contentHash}_${input.watermarkPattern.slice(0, 20)}`;
    const cached = await getCached(cacheKey);
    if (cached) {
      Logger.debug('scanner', 'GitHub: cache hit', { key: cacheKey });
      return cached;
    }

    let items: any[] = [];
    try {
      const res = await withRetry(
        () =>
          axios.get('https://api.github.com/search/code', {
            params: { q: input.watermarkPattern, per_page: 10 },
            headers: {
              Accept: 'application/vnd.github+json',
              Authorization: `Bearer ${GITHUB_TOKEN}`,
            },
            timeout: 12000,
          }),
        { source: SOURCE, maxRetries: 3, timeoutMs: 15000 }
      );

      // Consume rate limit headers
      await recordSuccess(SOURCE, {
        'x-ratelimit-remaining': res.headers['x-ratelimit-remaining'],
        'x-ratelimit-reset': res.headers['x-ratelimit-reset'],
      });

      items = res.data?.items ?? [];
      Logger.info('scanner', `GitHub: ${items.length} results for "${input.watermarkPattern.slice(0, 30)}"`, {
        remaining: res.headers['x-ratelimit-remaining'],
      });
    } catch (err: any) {
      Logger.error('scanner', 'GitHub search failed', { msg: err?.message });
      return [];
    }

    const original = input.rawOriginal || input.watermarkPattern;
    const isCode = input.contentType === 'code';
    const alerts: SigilAlert[] = [];

    for (const item of items) {
      if (!item?.html_url) continue;

      // Build raw URL from API URL
      const rawUrl = item.url
        ? item.url
            .replace('https://api.github.com/repos', 'https://raw.githubusercontent.com')
            .replace('/contents/', '/')
            .split('?')[0]
        : null;

      const rawContent = rawUrl ? await fetchRaw(rawUrl) : '';
      const bestSource = rawContent || sanitize(`${item.name ?? ''} ${item.path ?? ''}`);
      const result = analyseSimilarity(original, bestSource, isCode);

      if (isMatch(result.confidence)) {
        const alert = buildAlert(
          `gh_${item.sha}_${input.contentHash.slice(0, 8)}`,
          input,
          SOURCE,
          item.html_url,
          bestSource,
          result
        );
        alerts.push(alert);
        Logger.info('scanner', `GitHub match: ${result.confidence}% — ${item.html_url}`);
      }
    }

    await setCached(cacheKey, alerts);
    return alerts;
  },
};
