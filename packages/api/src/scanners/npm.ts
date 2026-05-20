/**
 * SIGIL API — Server-side npm scanner
 */

import axios from 'axios';
import { ScanInput, ScanMatch, sanitize, buildAlertId } from './types';

export async function scanNpm(input: ScanInput): Promise<ScanMatch[]> {
  if (input.contentType !== 'code') return [];

  const query = encodeURIComponent(input.watermarkPattern.slice(0, 60));
  const matches: ScanMatch[] = [];

  try {
    const res = await axios.get(
      `https://registry.npmjs.org/-/v1/search?text=${query}&size=5`,
      { timeout: 8000, headers: { 'User-Agent': 'SIGILBot/1.0' } }
    );

    const pkgs: any[] = res.data?.objects ?? [];
    for (const p of pkgs) {
      const pkg = p.package;
      if (!pkg?.name) continue;
      const text = `${pkg.name} ${pkg.description ?? ''} ${pkg.keywords?.join(' ') ?? ''}`;
      if (!text.toLowerCase().includes(input.watermarkPattern.slice(0, 10).toLowerCase())) continue;
      matches.push({
        source: 'npm',
        url: sanitize(`https://www.npmjs.com/package/${pkg.name}`),
        title: sanitize(`${pkg.name} — ${pkg.description ?? ''}`.slice(0, 120)),
        confidence: 68,
        detectedAt: Date.now(),
        alertId: buildAlertId('npm', input.contentHash),
      });
    }
  } catch (err: any) {
    console.error('[npm] Scan error:', err?.message);
  }

  return matches;
}
