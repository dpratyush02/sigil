/**
 * SIGIL — npm scanner
 * Searches npm registry + fetches package README for matches.
 */

import axios from 'axios';
import { ScanInput, ScannerSource, SigilAlert, buildAlert, getCached, setCached, sanitize, isMatch, analyseSimilarity } from './base';
import { withRetry } from '../../utils/rateLimit';
import { Logger } from '../../utils/logger';

const SOURCE = 'npm' as const;

async function fetchPackageReadme(name: string): Promise<string> {
  try {
    const res = await axios.get(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      timeout: 6000,
    });
    return sanitize((res.data?.readme as string) ?? '');
  } catch {
    return '';
  }
}

export const NpmScanner: ScannerSource = {
  name: SOURCE as any,

  async scan(input: ScanInput): Promise<SigilAlert[]> {
    const cacheKey = `npm_${input.contentHash}_${input.watermarkPattern.slice(0, 20)}`;
    const cached = await getCached(cacheKey);
    if (cached) return cached;

    const original = input.rawOriginal || input.watermarkPattern;
    const alerts: SigilAlert[] = [];

    try {
      const res = await withRetry(
        () =>
          axios.get('https://registry.npmjs.org/-/v1/search', {
            params: { text: input.watermarkPattern.slice(0, 60), size: 10 },
            timeout: 10000,
          }),
        { source: SOURCE, maxRetries: 2, timeoutMs: 12000 }
      );

      const objects: any[] = res.data?.objects ?? [];
      Logger.info('scanner', `npm: ${objects.length} results`);

      for (const obj of objects.slice(0, 6)) {
        const pkg = obj?.package;
        if (!pkg?.name) continue;

        const readme = await fetchPackageReadme(pkg.name);
        const combined = sanitize(`${pkg.name} ${pkg.description ?? ''} ${readme}`);
        const result = analyseSimilarity(original, combined, input.contentType === 'code');

        if (isMatch(result.confidence)) {
          alerts.push(
            buildAlert(
              `npm_${pkg.name.replace(/[^a-z0-9]/g, '_')}_${input.contentHash.slice(0, 8)}`,
              input,
              SOURCE as any,
              `https://www.npmjs.com/package/${pkg.name}`,
              combined,
              result
            )
          );
          Logger.info('scanner', `npm match: ${result.confidence}% — ${pkg.name}`);
        }
      }
    } catch (err: any) {
      Logger.error('scanner', 'npm scan failed', { msg: err?.message });
    }

    await setCached(cacheKey, alerts);
    return alerts;
  },
};
