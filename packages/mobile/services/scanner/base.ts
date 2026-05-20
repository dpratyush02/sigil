/**
 * SIGIL — Scanner base interface + shared types + result cache
 */

import { Storage } from '../../utils/storage';
import { Logger } from '../../utils/logger';
import { analyseSimilarity, isMatch, SimilarityResult } from '../../utils/similarity';

export type ContentType = 'code' | 'image' | 'video' | 'music' | 'text';
export type AlertSource = 'GitHub' | 'Reddit' | 'StackOverflow' | 'HuggingFace' | 'npm' | 'Web';

// ── Alert shape ────────────────────────────────────────────────────────────────

export interface SigilAlert {
  id: string;
  contentHash: string;
  contentName: string;
  contentType: ContentType;
  source: AlertSource;
  sourceUrl: string;
  similarity: number;         // 0–100 — alias for confidence
  confidence: number;         // 0–100 canonical
  reason: string;
  layers: SimilarityResult['layers'];
  detectedAt: number;
  reviewed: boolean;
  archived: boolean;
  evidence?: {
    originalSnippet: string;
    foundSnippet: string;
  };
  txHash?: string;
  ipfsCid?: string;
  watermark?: string;
}

// ── Scanner interface ──────────────────────────────────────────────────────────

export interface ScanInput {
  watermarkPattern: string;
  contentHash: string;
  contentName: string;
  contentType: ContentType;
  rawOriginal?: string;
}

export interface ScannerSource {
  readonly name: AlertSource;
  scan(input: ScanInput): Promise<SigilAlert[]>;
}

// ── Result cache — deduplicates redundant API calls ───────────────────────────

const CACHE_KEY = 'sigil_scan_cache';
const CACHE_TTL = 30 * 60 * 1000; // 30 min

interface CacheEntry {
  ts: number;
  alerts: SigilAlert[];
}

type Cache = Record<string, CacheEntry>;

async function loadCache(): Promise<Cache> {
  try {
    const raw = await Storage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveCache(cache: Cache) {
  await Storage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export async function getCached(key: string): Promise<SigilAlert[] | null> {
  const cache = await loadCache();
  const entry = cache[key];
  if (!entry || Date.now() - entry.ts > CACHE_TTL) return null;
  return entry.alerts;
}

export async function setCached(key: string, alerts: SigilAlert[]) {
  const cache = await loadCache();
  // Evict old entries
  const now = Date.now();
  const pruned = Object.fromEntries(
    Object.entries(cache).filter(([, v]) => now - v.ts < CACHE_TTL)
  );
  pruned[key] = { ts: now, alerts };
  await saveCache(pruned);
}

// ── Alert persistence ─────────────────────────────────────────────────────────

const ALERTS_KEY = 'sigil_alerts';

export async function getAlerts(): Promise<SigilAlert[]> {
  try {
    const raw = await Storage.getItem(ALERTS_KEY);
    if (!raw) return [];
    const alerts = JSON.parse(raw) as SigilAlert[];
    // Backfill missing fields for legacy alerts (spread after defaults)
    return alerts.map((a) => ({
      ...a,
      reviewed: a.reviewed ?? false,
      archived: a.archived ?? false,
    }));
  } catch {
    return [];
  }
}

export async function saveAlert(alert: SigilAlert): Promise<void> {
  const existing = await getAlerts();
  const deduped = existing.filter((a) => a.id !== alert.id);
  await Storage.setItem(ALERTS_KEY, JSON.stringify([alert, ...deduped]));
}

export async function updateAlert(id: string, patch: Partial<SigilAlert>): Promise<void> {
  const existing = await getAlerts();
  const updated = existing.map((a) => (a.id === id ? { ...a, ...patch } : a));
  await Storage.setItem(ALERTS_KEY, JSON.stringify(updated));
}

export async function clearAlerts(): Promise<void> {
  await Storage.removeItem(ALERTS_KEY);
}

// ── Notified IDs — prevent duplicate push notifications ───────────────────────

const NOTIFIED_KEY = 'sigil_notified_ids';

export async function wasNotified(id: string): Promise<boolean> {
  try {
    const raw = await Storage.getItem(NOTIFIED_KEY);
    const set: string[] = raw ? JSON.parse(raw) : [];
    return set.includes(id);
  } catch {
    return false;
  }
}

export async function markNotified(ids: string[]): Promise<void> {
  try {
    const raw = await Storage.getItem(NOTIFIED_KEY);
    const set: string[] = raw ? JSON.parse(raw) : [];
    const merged = [...new Set([...set, ...ids])].slice(-200); // keep last 200
    await Storage.setItem(NOTIFIED_KEY, JSON.stringify(merged));
  } catch {}
}

// ── Shared analysis helpers ────────────────────────────────────────────────────

export function buildAlert(
  id: string,
  input: ScanInput,
  source: AlertSource,
  sourceUrl: string,
  foundText: string,
  result: SimilarityResult,
  extras?: { txHash?: string; ipfsCid?: string; watermark?: string }
): SigilAlert {
  const original = input.rawOriginal || input.watermarkPattern;
  return {
    id,
    contentHash: input.contentHash,
    contentName: input.contentName,
    contentType: input.contentType,
    source,
    sourceUrl,
    similarity: result.confidence,
    confidence: result.confidence,
    reason: result.reason,
    layers: result.layers,
    detectedAt: Date.now(),
    reviewed: false,
    archived: false,
    evidence: {
      originalSnippet: sanitize(original.slice(0, 400)),
      foundSnippet: sanitize(foundText.slice(0, 400)),
    },
    ...extras,
  };
}

/**
 * Sanitize remote content before storing/rendering.
 * Strips null bytes, limits line width, truncates.
 */
export function sanitize(s: string): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/\0/g, '')                        // null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // non-printable control chars
    .slice(0, 2000);
}

export { analyseSimilarity, isMatch };
export type { SimilarityResult };
