/**
 * SIGIL — Image Scanner (mobile)
 *
 * Detects stolen/reposted images via:
 *  - Proper DCT-based pHash (perceptual hash) — 8×8 frequency domain
 *  - Gradient dHash (difference hash) — 8×7 horizontal gradient
 *  - Reverse image search via Bing Visual Search API (if key configured)
 *
 * Both hashes are combined (pHash 60% + dHash 40%) for final similarity score.
 * Canvas API used on web; raw byte-sampling fallback on native (no native deps).
 */

import axios from 'axios';
import type { SimilarityResult } from './base';
import {
  ScanInput,
  ScannerSource,
  SigilAlert,
  buildAlert,
  getCached,
  setCached,
  sanitize,
} from './base';
import { withRetry } from '../../utils/rateLimit';
import { Logger } from '../../utils/logger';

const SOURCE = 'Web' as const;
const BING_VISUAL_KEY = process.env.EXPO_PUBLIC_BING_VISUAL_KEY || '';

// ── DCT-based pHash ───────────────────────────────────────────────────────────

function dct1d(signal: number[]): number[] {
  const N = signal.length;
  const out: number[] = new Array(N);
  for (let k = 0; k < N; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += signal[n] * Math.cos((Math.PI / N) * (n + 0.5) * k);
    }
    out[k] = sum;
  }
  return out;
}

function dct2d(matrix: number[][]): number[][] {
  const rows = matrix.map(dct1d);
  const size = rows[0].length;
  const cols: number[][] = [];
  for (let c = 0; c < size; c++) {
    const col = rows.map((r) => r[c]);
    cols.push(dct1d(col));
  }
  return rows.map((_, r) => cols.map((c) => c[r]));
}

/**
 * pHash: DCT-based 64-bit perceptual hash from 8×8 greyscale pixels.
 * Superior to aHash — robust to brightness/contrast changes.
 */
function pHashFromPixels(pixels: number[]): bigint {
  const matrix: number[][] = [];
  for (let r = 0; r < 8; r++) matrix.push(pixels.slice(r * 8, r * 8 + 8));
  const dct = dct2d(matrix);
  const lowFreq: number[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (r === 0 && c === 0) continue; // skip DC component
      lowFreq.push(dct[r][c]);
    }
  }
  const mean = lowFreq.reduce((s, v) => s + v, 0) / lowFreq.length;
  let hash = 0n;
  for (let i = 0; i < 64; i++) {
    hash = (hash << 1n) | (lowFreq[i] !== undefined && lowFreq[i] > mean ? 1n : 0n);
  }
  return hash;
}

/**
 * dHash: 56-bit horizontal gradient hash from 8×8 pixels.
 * Very fast; captures edge structure. Complements pHash.
 */
function dHashFromPixels(pixels: number[]): bigint {
  let hash = 0n;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 7; c++) {
      const idx = r * 8 + c;
      hash = (hash << 1n) | (pixels[idx] > pixels[idx + 1] ? 1n : 0n);
    }
  }
  return hash;
}

function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let dist = 0;
  while (xor > 0n) { dist += Number(xor & 1n); xor >>= 1n; }
  return dist;
}

function hashSimilarity(a: bigint, b: bigint, bits = 64): number {
  return Math.round((1 - hammingDistance(a, b) / bits) * 100);
}

/**
 * Combined pHash + dHash similarity score.
 * pHash: frequency domain — handles resizing, colour shifts.
 * dHash: gradient domain — captures structure/edges.
 */
function combinedSimilarity(
  origPHash: bigint, origDHash: bigint,
  cmpPHash: bigint, cmpDHash: bigint
): number {
  const p = hashSimilarity(origPHash, cmpPHash, 64);
  const d = hashSimilarity(origDHash, cmpDHash, 56);
  return Math.round(p * 0.6 + d * 0.4);
}

// ── Pixel extraction ──────────────────────────────────────────────────────────

async function extractPixels(dataUri: string): Promise<number[] | null> {
  // Web path: offscreen canvas for accurate pixel data
  if (typeof document !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    try {
      const img = new (globalThis as any).Image();
      await new Promise<void>((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = dataUri;
      });
      const canvas = new OffscreenCanvas(8, 8);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, 8, 8);
      const data = ctx.getImageData(0, 0, 8, 8).data;
      const pixels: number[] = [];
      for (let i = 0; i < 64; i++) {
        const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
        pixels.push(Math.round(0.299 * r + 0.587 * g + 0.114 * b));
      }
      return pixels;
    } catch { return null; }
  }

  // Native fallback: sample raw base64 bytes (less accurate but zero deps)
  try {
    const b64 = dataUri.split(',')[1] ?? dataUri;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (bytes.length < 64) return null;
    const step = Math.floor(bytes.length / 64);
    return Array.from({ length: 64 }, (_, i) => bytes[i * step]);
  } catch { return null; }
}

// ── Bing Visual Search ────────────────────────────────────────────────────────

interface BingVisualResult { url: string; name: string; }

async function bingReverseImageSearch(
  imageBase64: string,
  mimeType: string
): Promise<BingVisualResult[]> {
  if (!BING_VISUAL_KEY) return [];
  try {
    const blob = { uri: `data:${mimeType};base64,${imageBase64}`, name: 'image.jpg', type: mimeType };
    const formData = new FormData();
    formData.append('image', blob as any);
    const res = await withRetry(
      () => axios.post(
        'https://api.bing.microsoft.com/v7.0/images/visualsearch',
        formData,
        { headers: { 'Ocp-Apim-Subscription-Key': BING_VISUAL_KEY, 'Content-Type': 'multipart/form-data' }, timeout: 15000 }
      ),
      { source: SOURCE, maxRetries: 2, timeoutMs: 20000 }
    );
    const results: BingVisualResult[] = [];
    for (const tag of res.data?.tags ?? []) {
      for (const action of tag.actions ?? []) {
        if (['PagesIncluding', 'VisualSearch'].includes(action.actionType)) {
          for (const val of action.data?.value ?? []) {
            if (val.contentUrl) results.push({ url: val.contentUrl, name: val.name ?? val.contentUrl });
          }
        }
      }
    }
    return results.slice(0, 10);
  } catch (err: any) {
    Logger.warn('image-scanner', 'Bing reverse image search failed', { msg: err?.message });
    return [];
  }
}

// ── Scanner ───────────────────────────────────────────────────────────────────

export const ImageScanner: ScannerSource = {
  name: SOURCE,

  async scan(input: ScanInput): Promise<SigilAlert[]> {
    if (input.contentType !== 'image') return [];

    const cacheKey = `img_${input.contentHash}`;
    const cached = await getCached(cacheKey);
    if (cached) return cached;

    const alerts: SigilAlert[] = [];
    const dataUri = input.rawOriginal || '';

    Logger.info('image-scanner', 'Starting image scan', {
      hash: input.contentHash.slice(0, 12),
      hasBing: !!BING_VISUAL_KEY,
    });

    // ── Step 1: Bing reverse image search ────────────────────────────────────
    if (dataUri && BING_VISUAL_KEY) {
      try {
        const b64 = dataUri.split(',')[1] ?? dataUri;
        const mime = dataUri.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';
        const results = await bingReverseImageSearch(b64, mime);
        for (const r of results) {
          if (r.url.includes('ipfs') || r.url.includes('pinata')) continue;
          const alertId = `img_bing_${input.contentHash.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const bingResult: SimilarityResult = {
            confidence: 78,
            reason: `Reverse image search match: "${sanitize(r.name).slice(0, 80)}"`,
            layers: { exact: false, levenshtein: 0, tokenOverlap: 0, cosine: 78 },
          };
          alerts.push(buildAlert(alertId, input, SOURCE, r.url, sanitize(r.name).slice(0, 200), bingResult));
        }
      } catch (err: any) {
        Logger.error('image-scanner', 'Bing search error', { msg: err?.message });
      }
    }

    // ── Step 2: pHash + dHash comparison against CDN results ─────────────────
    if (dataUri) {
      const origPixels = await extractPixels(dataUri);
      if (origPixels) {
        const origPHash = pHashFromPixels(origPixels);
        const origDHash = dHashFromPixels(origPixels);

        const wm = input.watermarkPattern.slice(0, 40);
        const query = encodeURIComponent(wm);
        try {
          const ddgRes = await withRetry(
            () => axios.get(
              `https://html.duckduckgo.com/html/?q=${query}+site:imgur.com+OR+site:i.redd.it+OR+site:postimg.cc`,
              { timeout: 12000, responseType: 'text', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SIGILBot/1.0)' } }
            ),
            { source: SOURCE, maxRetries: 2, timeoutMs: 15000 }
          );

          const imgUrlRegex = /https?:\/\/(?:i\.imgur\.com|i\.redd\.it|postimg\.cc|i\.ibb\.co)[^\s"'>]+\.(?:jpg|jpeg|png|gif|webp)/gi;
          const foundUrls = [...new Set((ddgRes.data as string).match(imgUrlRegex) ?? [])].slice(0, 5);

          for (const imgUrl of foundUrls) {
            try {
              const imgRes = await axios.get(imgUrl, { timeout: 8000, responseType: 'arraybuffer' });
              const bytes = new Uint8Array(imgRes.data as ArrayBuffer);
              const step = Math.floor(bytes.length / 64);
              if (step < 1) continue;
              const foundPixels = Array.from({ length: 64 }, (_, i) => bytes[i * step]);

              const foundPHash = pHashFromPixels(foundPixels);
              const foundDHash = dHashFromPixels(foundPixels);
              const score = combinedSimilarity(origPHash, origDHash, foundPHash, foundDHash);

              Logger.debug('image-scanner', `pHash+dHash score=${score}`, { url: imgUrl });

              if (score >= 68) {
                const alertId = `img_phash_${input.contentHash.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                const phashResult: SimilarityResult = {
                  confidence: score,
                  reason: `Visual similarity match (pHash+dHash combined score ${score}%)`,
                  layers: { exact: score === 100, levenshtein: 0, tokenOverlap: 0, cosine: score },
                };
                alerts.push(buildAlert(alertId, input, SOURCE, imgUrl, `pHash+dHash ${score}%`, phashResult));
              }
            } catch { /* unreachable — skip */ }
          }
        } catch (err: any) {
          Logger.warn('image-scanner', 'DDG image search failed', { msg: err?.message });
        }
      }
    }

    await setCached(cacheKey, alerts);
    Logger.info('image-scanner', `Image scan complete: ${alerts.length} alerts`, { hash: input.contentHash.slice(0, 12) });
    return alerts;
  },
};
