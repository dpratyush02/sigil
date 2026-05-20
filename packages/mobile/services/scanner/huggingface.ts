/**
 * SIGIL — HuggingFace scanner
 * Scans model cards + dataset README files for watermark/content matches.
 */

import axios from 'axios';
import { ScanInput, ScannerSource, SigilAlert, buildAlert, getCached, setCached, sanitize, isMatch, analyseSimilarity } from './base';
import { withRetry } from '../../utils/rateLimit';
import { Logger } from '../../utils/logger';

const SOURCE = 'HuggingFace' as const;
const HF_API = 'https://huggingface.co/api';

async function fetchReadme(repoId: string, type: 'model' | 'dataset'): Promise<string> {
  try {
    const url =
      type === 'model'
        ? `https://huggingface.co/${repoId}/raw/main/README.md`
        : `https://huggingface.co/datasets/${repoId}/raw/main/README.md`;
    const res = await axios.get<string>(url, { timeout: 6000, responseType: 'text' });
    return typeof res.data === 'string' ? sanitize(res.data.slice(0, 5000)) : '';
  } catch {
    return '';
  }
}

export const HuggingFaceScanner: ScannerSource = {
  name: SOURCE,

  async scan(input: ScanInput): Promise<SigilAlert[]> {
    const cacheKey = `hf_${input.contentHash}_${input.watermarkPattern.slice(0, 20)}`;
    const cached = await getCached(cacheKey);
    if (cached) return cached;

    const original = input.rawOriginal || input.watermarkPattern;
    const query = input.watermarkPattern.slice(0, 60);
    const alerts: SigilAlert[] = [];

    try {
      // Search models
      const modelsRes = await withRetry(
        () =>
          axios.get(`${HF_API}/models`, {
            params: { search: query, limit: 5 },
            timeout: 10000,
          }),
        { source: SOURCE, maxRetries: 2, timeoutMs: 12000 }
      );

      const models: any[] = modelsRes.data ?? [];
      Logger.info('scanner', `HuggingFace models: ${models.length} results`);

      for (const model of models.slice(0, 5)) {
        if (!model?.modelId) continue;
        const readme = await fetchReadme(model.modelId, 'model');
        const combined = sanitize(`${model.modelId} ${model.tags?.join(' ') ?? ''} ${readme}`);
        const result = analyseSimilarity(original, combined, input.contentType === 'code');

        if (isMatch(result.confidence)) {
          alerts.push(
            buildAlert(
              `hf_m_${model.modelId.replace(/\//g, '_')}_${input.contentHash.slice(0, 8)}`,
              input,
              SOURCE,
              `https://huggingface.co/${model.modelId}`,
              combined,
              result
            )
          );
        }
      }

      // Search datasets
      const datasetsRes = await withRetry(
        () =>
          axios.get(`${HF_API}/datasets`, {
            params: { search: query, limit: 5 },
            timeout: 10000,
          }),
        { source: SOURCE, maxRetries: 2, timeoutMs: 12000 }
      );

      const datasets: any[] = datasetsRes.data ?? [];
      Logger.info('scanner', `HuggingFace datasets: ${datasets.length} results`);

      for (const ds of datasets.slice(0, 5)) {
        if (!ds?.id) continue;
        const readme = await fetchReadme(ds.id, 'dataset');
        const combined = sanitize(`${ds.id} ${ds.tags?.join(' ') ?? ''} ${readme}`);
        const result = analyseSimilarity(original, combined);

        if (isMatch(result.confidence)) {
          alerts.push(
            buildAlert(
              `hf_d_${ds.id.replace(/\//g, '_')}_${input.contentHash.slice(0, 8)}`,
              input,
              SOURCE,
              `https://huggingface.co/datasets/${ds.id}`,
              combined,
              result
            )
          );
        }
      }
    } catch (err: any) {
      Logger.error('scanner', 'HuggingFace scan failed', { msg: err?.message });
    }

    await setCached(cacheKey, alerts);
    return alerts;
  },
};
