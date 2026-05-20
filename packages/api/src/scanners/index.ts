/**
 * SIGIL API — Scanner orchestrator (server-side)
 * Runs all scanners in parallel, collects + deduplicates matches.
 */

import { ScanInput, ScanMatch } from './types';
import { scanGitHub } from './github';
import { scanReddit } from './reddit';
import { scanHuggingFace } from './huggingface';
import { scanNpm } from './npm';
import { scanWeb } from './web';
import { scanImage } from './image';

const SCANNERS: Array<(input: ScanInput) => Promise<ScanMatch[]>> = [
  scanGitHub,
  scanReddit,
  scanHuggingFace,
  scanNpm,
  scanWeb,
  scanImage,
];

export async function runScanners(input: ScanInput): Promise<ScanMatch[]> {
  const results = await Promise.allSettled(SCANNERS.map((s) => s(input)));
  const all: ScanMatch[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const m of r.value) {
        const key = `${m.source}_${m.url}`;
        if (!seen.has(key)) {
          seen.add(key);
          all.push(m);
        }
      }
    }
  }

  return all.sort((a, b) => b.confidence - a.confidence);
}

export type { ScanInput, ScanMatch };
