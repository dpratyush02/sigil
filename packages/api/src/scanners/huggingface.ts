/**
 * SIGIL API — Server-side HuggingFace scanner
 */

import axios from 'axios';
import { ScanInput, ScanMatch, sanitize, buildAlertId } from './types';

const HF_TOKEN = process.env.HF_TOKEN ?? '';

export async function scanHuggingFace(input: ScanInput): Promise<ScanMatch[]> {
  if (input.contentType !== 'code' && input.contentType !== 'document') return [];

  const query = encodeURIComponent(input.watermarkPattern.slice(0, 80));
  const matches: ScanMatch[] = [];

  try {
    const headers: Record<string, string> = { 'User-Agent': 'SIGILBot/1.0' };
    if (HF_TOKEN) headers['Authorization'] = `Bearer ${HF_TOKEN}`;

    const res = await axios.get(
      `https://huggingface.co/api/models?search=${query}&limit=5`,
      { timeout: 10000, headers }
    );

    const models: any[] = Array.isArray(res.data) ? res.data : [];
    for (const m of models) {
      if (!m?.id) continue;
      const text = `${m.id} ${m.cardData?.description ?? ''}`;
      const hit = text.includes(input.watermarkPattern.slice(0, 20));
      if (!hit) continue;
      matches.push({
        source: 'HuggingFace',
        url: sanitize(`https://huggingface.co/${m.id}`),
        title: sanitize(m.id),
        confidence: 75,
        detectedAt: Date.now(),
        alertId: buildAlertId('hf', input.contentHash),
      });
    }
  } catch (err: any) {
    console.error('[HuggingFace] Scan error:', err?.message);
  }

  return matches;
}
