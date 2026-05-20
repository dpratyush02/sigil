import axios from 'axios';
import { ScanInput, ScannerSource, SigilAlert, buildAlert, getCached, setCached, sanitize, isMatch, analyseSimilarity } from './base';
import { withRetry } from '../../utils/rateLimit';
import { Logger } from '../../utils/logger';

const SOURCE = 'Reddit' as const;

export const RedditScanner: ScannerSource = {
  name: SOURCE,

  async scan(input: ScanInput): Promise<SigilAlert[]> {
    const cacheKey = `rd_${input.contentHash}_${input.watermarkPattern.slice(0, 20)}`;
    const cached = await getCached(cacheKey);
    if (cached) return cached;

    let posts: any[] = [];
    try {
      const res = await withRetry(
        () =>
          axios.get('https://www.reddit.com/search.json', {
            params: { q: input.watermarkPattern, type: 'link', limit: 10 },
            timeout: 10000,
            headers: { 'User-Agent': 'SIGIL/1.0' },
          }),
        { source: SOURCE, maxRetries: 3, timeoutMs: 12000 }
      );
      posts = res.data?.data?.children ?? [];
      Logger.info('scanner', `Reddit: ${posts.length} results`);
    } catch (err: any) {
      Logger.error('scanner', 'Reddit search failed', { msg: err?.message });
      return [];
    }

    const original = input.rawOriginal || input.watermarkPattern;
    const alerts: SigilAlert[] = [];

    for (const post of posts) {
      const data = post?.data;
      if (!data) continue;
      const text = sanitize([data.title, data.selftext].filter(Boolean).join('\n'));
      const result = analyseSimilarity(original, text);

      if (isMatch(result.confidence)) {
        const alert = buildAlert(
          `rd_${data.id}_${input.contentHash.slice(0, 8)}`,
          input,
          SOURCE,
          `https://reddit.com${data.permalink}`,
          text,
          result
        );
        alerts.push(alert);
        Logger.info('scanner', `Reddit match: ${result.confidence}%`);
      }
    }

    await setCached(cacheKey, alerts);
    return alerts;
  },
};
