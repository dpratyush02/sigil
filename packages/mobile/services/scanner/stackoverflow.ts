import axios from 'axios';
import { ScanInput, ScannerSource, SigilAlert, buildAlert, getCached, setCached, sanitize, isMatch, analyseSimilarity } from './base';
import { withRetry } from '../../utils/rateLimit';
import { Logger } from '../../utils/logger';

const SOURCE = 'StackOverflow' as const;

export const StackOverflowScanner: ScannerSource = {
  name: SOURCE,

  async scan(input: ScanInput): Promise<SigilAlert[]> {
    const cacheKey = `so_${input.contentHash}_${input.watermarkPattern.slice(0, 20)}`;
    const cached = await getCached(cacheKey);
    if (cached) return cached;

    let items: any[] = [];
    try {
      const res = await withRetry(
        () =>
          axios.get('https://api.stackexchange.com/2.3/search', {
            params: {
              order: 'desc',
              sort: 'activity',
              intitle: input.watermarkPattern,
              site: 'stackoverflow',
              pagesize: 10,
            },
            timeout: 10000,
          }),
        { source: SOURCE, maxRetries: 3, timeoutMs: 12000 }
      );
      items = res.data?.items ?? [];
      Logger.info('scanner', `StackOverflow: ${items.length} results`);
    } catch (err: any) {
      Logger.error('scanner', 'StackOverflow search failed', { msg: err?.message });
      return [];
    }

    const original = input.rawOriginal || input.watermarkPattern;
    const alerts: SigilAlert[] = [];

    for (const item of items) {
      if (!item?.link) continue;
      const text = sanitize([item.title, item.body].filter(Boolean).join('\n'));
      const result = analyseSimilarity(original, text, input.contentType === 'code');

      if (isMatch(result.confidence)) {
        const alert = buildAlert(
          `so_${item.question_id}_${input.contentHash.slice(0, 8)}`,
          input,
          SOURCE,
          item.link,
          text,
          result
        );
        alerts.push(alert);
        Logger.info('scanner', `StackOverflow match: ${result.confidence}%`);
      }
    }

    await setCached(cacheKey, alerts);
    return alerts;
  },
};
