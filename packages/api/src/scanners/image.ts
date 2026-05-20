/**
 * SIGIL API — Server-side image scanner with proper pHash + dHash
 *
 * pHash: 8×8 DCT-based perceptual hash
 * dHash: 8×8 gradient hash (difference between adjacent pixels)
 * Both operate on raw byte-sampled pixel data (no canvas API needed server-side)
 *
 * When Bing Visual Search key is set, also queries BVSA.
 */

import axios from 'axios';
import { ScanInput, ScanMatch, sanitize, buildAlertId } from './types';

const BING_VISUAL_KEY = process.env.BING_VISUAL_KEY ?? '';

// ── DCT-based pHash ───────────────────────────────────────────────────────────

/** 1D DCT-II of length N */
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

/** 2D DCT — apply 1D DCT to each row then each column */
function dct2d(matrix: number[][]): number[][] {
  const rows = matrix.map(dct1d);
  const size = rows[0].length;
  const cols: number[][] = [];
  for (let c = 0; c < size; c++) {
    const col = rows.map((r) => r[c]);
    cols.push(dct1d(col));
  }
  // transpose back
  return rows.map((_, r) => cols.map((c) => c[r]));
}

/**
 * Compute pHash from 64-element grayscale pixel array (8×8 grid).
 * Returns 64-bit BigInt hash.
 */
export function computePHash(pixels: number[]): bigint {
  // Reshape to 8×8 matrix
  const matrix: number[][] = [];
  for (let r = 0; r < 8; r++) {
    matrix.push(pixels.slice(r * 8, r * 8 + 8));
  }

  const dct = dct2d(matrix);

  // Extract top-left 8×8 low-frequency coefficients (excluding DC component)
  const lowFreq: number[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (r === 0 && c === 0) continue; // skip DC
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
 * Compute dHash from 64-element grayscale pixel array (8×8 grid).
 * Each bit = is pixel[i] > pixel[i+1] (horizontal gradient).
 */
export function computeDHash(pixels: number[]): bigint {
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

/** Sample 64 greyscale pixels from raw bytes */
function samplePixels(bytes: Uint8Array): number[] | null {
  if (bytes.length < 64) return null;
  const step = Math.floor(bytes.length / 64);
  return Array.from({ length: 64 }, (_, i) => bytes[i * step]);
}

// ── Bing Visual Search ────────────────────────────────────────────────────────

async function bingVisualSearch(base64: string, mime: string): Promise<Array<{ url: string; name: string }>> {
  if (!BING_VISUAL_KEY) return [];
  try {
    const boundary = 'sigil_boundary';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="image"; filename="image.jpg"',
      `Content-Type: ${mime}`,
      '',
      Buffer.from(base64, 'base64').toString('binary'),
      `--${boundary}--`,
    ].join('\r\n');

    const res = await axios.post(
      'https://api.bing.microsoft.com/v7.0/images/visualsearch',
      body,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': BING_VISUAL_KEY,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        timeout: 15000,
      }
    );

    const results: Array<{ url: string; name: string }> = [];
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
    console.warn('[image-scanner] Bing error:', err?.message);
    return [];
  }
}

// ── Main scanner ──────────────────────────────────────────────────────────────

export async function scanImage(input: ScanInput): Promise<ScanMatch[]> {
  if (input.contentType !== 'image') return [];

  const matches: ScanMatch[] = [];
  const dataUri = input.rawOriginal ?? '';

  // ── Bing reverse image search ─────────────────────────────────────────────
  if (dataUri && BING_VISUAL_KEY) {
    const b64 = dataUri.split(',')[1] ?? dataUri;
    const mime = dataUri.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';
    const results = await bingVisualSearch(b64, mime);
    for (const r of results) {
      if (r.url.includes('ipfs') || r.url.includes('pinata')) continue;
      matches.push({
        source: 'Image',
        url: sanitize(r.url),
        title: sanitize(r.name).slice(0, 200),
        confidence: 78,
        detectedAt: Date.now(),
        alertId: buildAlertId('img_bing', input.contentHash),
      });
    }
  }

  // ── pHash + dHash comparison via DDG image CDN search ────────────────────
  if (dataUri) {
    const b64 = dataUri.split(',')[1] ?? dataUri;
    let origPixels: number[] | null = null;
    try {
      const bytes = Buffer.from(b64, 'base64');
      origPixels = samplePixels(new Uint8Array(bytes));
    } catch { /* skip */ }

    if (origPixels) {
      const origPHash = computePHash(origPixels);
      const origDHash = computeDHash(origPixels);

      const wm = encodeURIComponent(input.watermarkPattern.slice(0, 40));
      try {
        const ddgRes = await axios.get(
          `https://html.duckduckgo.com/html/?q=${wm}+site:imgur.com+OR+site:i.redd.it+OR+site:postimg.cc`,
          {
            timeout: 12000,
            responseType: 'text',
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SIGILBot/1.0)' },
          }
        );

        const imgUrlRegex = /https?:\/\/(?:i\.imgur\.com|i\.redd\.it|postimg\.cc|i\.ibb\.co)[^\s"'>]+\.(?:jpg|jpeg|png|gif|webp)/gi;
        const foundUrls = [...new Set((ddgRes.data as string).match(imgUrlRegex) ?? [])].slice(0, 5);

        for (const imgUrl of foundUrls) {
          try {
            const imgRes = await axios.get(imgUrl, { timeout: 8000, responseType: 'arraybuffer' });
            const bytes = new Uint8Array(imgRes.data as ArrayBuffer);
            const foundPixels = samplePixels(bytes);
            if (!foundPixels) continue;

            const foundPHash = computePHash(foundPixels);
            const foundDHash = computeDHash(foundPixels);

            const pScore = hashSimilarity(origPHash, foundPHash);
            const dScore = hashSimilarity(origDHash, foundDHash, 56); // dHash is 56 bits
            const combined = Math.round(pScore * 0.6 + dScore * 0.4);

            console.log(`[image-scanner] pHash=${pScore} dHash=${dScore} combined=${combined}`, imgUrl);

            if (combined >= 68) {
              matches.push({
                source: 'Image',
                url: sanitize(imgUrl),
                title: `Visual similarity ${combined}% (pHash ${pScore}% + dHash ${dScore}%)`,
                confidence: combined,
                detectedAt: Date.now(),
                alertId: buildAlertId('img_phash', input.contentHash),
              });
            }
          } catch { /* unreachable image — skip */ }
        }
      } catch (err: any) {
        console.warn('[image-scanner] DDG search error:', err?.message);
      }
    }
  }

  return matches;
}
