/**
 * SIGIL API — Shared scanner types (server-side mirror of mobile/services/scanner/base.ts)
 */

export type ContentType = 'text' | 'code' | 'image' | 'document';

export interface ScanInput {
  watermarkPattern: string;
  contentHash: string;
  contentName: string;
  contentType: ContentType;
  rawOriginal?: string; // full text / data-URI for image
}

export interface SimilarityLayers {
  exact: boolean;
  levenshtein: number;
  tokenOverlap: number;
  cosine: number;
}

export interface SimilarityResult {
  confidence: number; // 0-100
  reason: string;
  layers: SimilarityLayers;
}

export interface ScanMatch {
  source: string;
  url: string;
  title: string;
  confidence: number;
  detectedAt: number;
  alertId: string;
}

/** Sanitize user-facing strings from API responses */
export function sanitize(s: string): string {
  return s
    .replace(/[<>"]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}

/** Build a unique alert ID */
export function buildAlertId(source: string, contentHash: string): string {
  return `${source.toLowerCase()}_${contentHash.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Score helpers */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter((t) => t.length > 3));
  const tb = new Set(b.toLowerCase().split(/\s+/).filter((t) => t.length > 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return Math.round((inter / Math.min(ta.size, tb.size)) * 100);
}

export function analyseSimilarity(original: string, candidate: string): SimilarityResult {
  if (!original || !candidate) {
    return { confidence: 0, reason: 'No content to compare', layers: { exact: false, levenshtein: 0, tokenOverlap: 0, cosine: 0 } };
  }
  const exact = original.trim() === candidate.trim();
  const maxLen = Math.max(original.length, candidate.length);
  const lev = maxLen > 0 ? Math.round((1 - levenshteinDistance(original.slice(0, 500), candidate.slice(0, 500)) / 500) * 100) : 0;
  const tok = tokenOverlap(original, candidate);
  const cosine = Math.round((lev * 0.4 + tok * 0.6));
  const confidence = exact ? 100 : Math.round((lev * 0.35 + tok * 0.45 + cosine * 0.2));
  let reason = '';
  if (exact) reason = 'Exact content match';
  else if (confidence >= 85) reason = `High similarity: ${confidence}% (token overlap ${tok}%)`;
  else if (confidence >= 65) reason = `Moderate similarity: ${confidence}%`;
  else reason = `Low similarity: ${confidence}%`;
  return { confidence, reason, layers: { exact, levenshtein: lev, tokenOverlap: tok, cosine } };
}
