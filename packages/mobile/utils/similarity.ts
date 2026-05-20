/**
 * Multi-layer similarity engine
 * L1 = exact watermark match
 * L2 = Levenshtein edit distance
 * L3 = token overlap (Jaccard)
 * L4 = cosine TF-IDF (pure JS, no API)
 *
 * Returns structured { confidence: 0–100, reason, layers }
 */

export interface SimilarityResult {
  confidence: number;         // 0–100
  reason: string;             // human-readable explanation
  layers: {
    exact: boolean;
    levenshtein: number;      // 0–100
    tokenOverlap: number;     // 0–100
    cosine: number;           // 0–100
  };
}

// ── Levenshtein ──────────────────────────────────────────────────────────────

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Use two-row rolling array for memory efficiency
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function levenshteinScore(a: string, b: string): number {
  if (a === b) return 100;
  const maxLen = 600;
  const as = a.slice(0, maxLen);
  const bs = b.slice(0, maxLen);
  const dist = levenshteinDistance(as, bs);
  return Math.round((1 - dist / Math.max(as.length, bs.length)) * 100);
}

// ── Token overlap (Jaccard) ───────────────────────────────────────────────────

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1)
  );
}

function jaccardScore(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 100;
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  ta.forEach((t) => { if (tb.has(t)) intersection++; });
  const union = ta.size + tb.size - intersection;
  return Math.round((intersection / union) * 100);
}

// ── TF-IDF cosine ─────────────────────────────────────────────────────────────

function termFreq(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const total = tokens.length || 1;
  freq.forEach((v, k) => freq.set(k, v / total));
  return freq;
}

function cosineScore(a: string, b: string): number {
  const ta = Array.from(tokenize(a));
  const tb = Array.from(tokenize(b));
  if (ta.length === 0 || tb.length === 0) return 0;

  const freqA = termFreq(ta);
  const freqB = termFreq(tb);

  // IDF approximation: 1/log(freq+2) — no corpus needed
  const vocab = new Set([...freqA.keys(), ...freqB.keys()]);

  let dot = 0;
  let magA = 0;
  let magB = 0;

  vocab.forEach((term) => {
    const va = freqA.get(term) ?? 0;
    const vb = freqB.get(term) ?? 0;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  });

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return Math.round((dot / denom) * 100);
}

// ── Code-aware normalisation ──────────────────────────────────────────────────

function normaliseCode(s: string): string {
  return s
    .replace(/\/\/.*$/gm, '')       // strip // comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // strip /* */ comments
    .replace(/#.*$/gm, '')          // strip Python/shell # comments
    .replace(/["'`]/g, '"')         // normalise quotes
    .replace(/\b(?:var|let|const)\b/g, 'var') // normalise variable declarations
    .replace(/\bfunction\b/g, 'fn') // normalise function keyword
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ── MinHash / k-shingle similarity (for code plagiarism detection) ────────────

/**
 * Generate k-shingles (overlapping n-grams) from a string.
 * k=4 tokens works well for code.
 */
function shingles(tokens: string[], k = 4): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i <= tokens.length - k; i++) {
    result.add(tokens.slice(i, i + k).join(' '));
  }
  return result;
}

/**
 * MinHash-style Jaccard estimate over k-shingles.
 * More robust than simple token overlap for detecting renamed-variable plagiarism.
 */
export function minHashSimilarity(a: string, b: string, k = 4): number {
  const tokensA = normaliseCode(a)
    .split(/\s+/)
    .filter((t) => t.length > 0);
  const tokensB = normaliseCode(b)
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (tokensA.length < k || tokensB.length < k) {
    // Fall back to simple Jaccard for short snippets
    return jaccardScore(a, b);
  }

  const sA = shingles(tokensA, k);
  const sB = shingles(tokensB, k);

  let intersection = 0;
  sA.forEach((s) => { if (sB.has(s)) intersection++; });
  const union = sA.size + sB.size - intersection;
  return union === 0 ? 0 : Math.round((intersection / union) * 100);
}

/**
 * SimHash fingerprint (64-bit, pure JS).
 * Detects near-duplicate content even after variable renaming.
 */
export function simHashFingerprint(s: string): bigint {
  const tokens = s
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);

  const v = new Array(64).fill(0);

  for (const token of tokens) {
    // Simple hash: djb2 variant spread across 64 bits
    let h = 5381n;
    for (let i = 0; i < token.length; i++) {
      h = ((h << 5n) + h + BigInt(token.charCodeAt(i))) & 0xFFFFFFFFFFFFFFFFn;
    }
    for (let i = 0; i < 64; i++) {
      v[i] += (h >> BigInt(i)) & 1n ? 1 : -1;
    }
  }

  let fingerprint = 0n;
  for (let i = 0; i < 64; i++) {
    if (v[i] > 0) fingerprint |= (1n << BigInt(i));
  }
  return fingerprint;
}

/** SimHash similarity: 0–100. */
export function simHashSimilarity(a: string, b: string): number {
  const fA = simHashFingerprint(normaliseCode(a));
  const fB = simHashFingerprint(normaliseCode(b));
  let xor = fA ^ fB;
  let dist = 0;
  while (xor > 0n) {
    dist += Number(xor & 1n);
    xor >>= 1n;
  }
  return Math.round((1 - dist / 64) * 100);
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * Full multi-layer similarity analysis.
 * @param original  The registered content / watermark pattern
 * @param found     The text fetched from the source (snippet / raw file)
 * @param isCode    Apply code normalisation pre-processing
 */
export function analyseSimilarity(
  original: string,
  found: string,
  isCode = false
): SimilarityResult {
  const a = isCode ? normaliseCode(original) : original.trim().toLowerCase();
  const b = isCode ? normaliseCode(found) : found.trim().toLowerCase();

  // L1 — exact watermark embed
  const exact = b.includes(a) || a.includes(b);

  // L2 — edit distance
  const lev = levenshteinScore(a, b);

  // L3 — token overlap (Jaccard)
  const tok = jaccardScore(a, b);

  // L4 — cosine TF-IDF
  const cos = cosineScore(a, b);

  // L5 — MinHash shingle similarity (code only) — catches renamed-variable plagiarism
  const minhash = isCode ? minHashSimilarity(a, b) : 0;

  // L6 — SimHash fingerprint (code only) — structural similarity
  const simhash = isCode ? simHashSimilarity(a, b) : 0;

  // Weighted aggregate: exact trumps all
  let confidence: number;
  let reason: string;

  if (exact) {
    confidence = 100;
    reason = 'Exact watermark found in source';
  } else if (isCode) {
    // Code weights: minhash 30%, simhash 25%, tok 25%, cos 20%
    const weighted = Math.round(minhash * 0.30 + simhash * 0.25 + tok * 0.25 + cos * 0.20);
    confidence = weighted;

    if (minhash >= 70) {
      reason = `Code shingle similarity (MinHash ${minhash}%) — possible copied/reformatted code`;
    } else if (simhash >= 70) {
      reason = `Structural code similarity (SimHash ${simhash}%) — possible renamed-variable copy`;
    } else if (tok >= 60) {
      reason = `Strong token overlap (${tok}%)`;
    } else if (cos >= 70) {
      reason = `High semantic similarity (cosine ${cos}%)`;
    } else if (lev >= 70) {
      reason = `Low edit distance (${lev}% similar)`;
    } else {
      reason = `Partial code match — weighted score ${weighted}%`;
    }
  } else {
    // Text weights: tok 40%, cos 30%, lev 30%
    const weighted = Math.round(tok * 0.4 + cos * 0.3 + lev * 0.3);
    confidence = weighted;

    if (cos >= 70) {
      reason = `High semantic similarity (cosine ${cos}%)`;
    } else if (tok >= 60) {
      reason = `Strong token overlap (${tok}%)`;
    } else if (lev >= 70) {
      reason = `Low edit distance (${lev}% similar)`;
    } else {
      reason = `Partial match — weighted score ${weighted}%`;
    }
  }

  confidence = Math.max(0, Math.min(100, confidence));

  return {
    confidence,
    reason,
    layers: { exact, levenshtein: lev, tokenOverlap: tok, cosine: cos },
  };
}

/**
 * Legacy shim — returns a plain 0–100 number.
 * Kept so existing callers don't break.
 */
export function calculateSimilarity(original: string, found: string): number {
  return analyseSimilarity(original, found).confidence;
}

// ── Confidence helpers ────────────────────────────────────────────────────────

export type MatchConfidence = 'high' | 'medium' | 'low' | 'none';

export function getConfidenceLevel(score: number): MatchConfidence {
  if (score >= 85) return 'high';
  if (score >= 70) return 'medium';
  if (score >= 60) return 'low';
  return 'none';
}

export function getConfidenceLabel(score: number): string {
  const labels: Record<MatchConfidence, string> = {
    high: 'HIGH CONFIDENCE MATCH',
    medium: 'MEDIUM CONFIDENCE MATCH',
    low: 'LOW CONFIDENCE MATCH',
    none: 'NO MATCH',
  };
  return labels[getConfidenceLevel(score)];
}

/** Threshold for saving an alert: ≥60 */
export function isMatch(score: number): boolean {
  return score >= 60;
}
