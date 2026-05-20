/**
 * SIGIL — Scanner orchestrator
 *
 * Strategy:
 *  1. If SIGIL backend API is reachable AND user has a token → submit job, poll for results.
 *  2. If API is unreachable or no token → run client-side scanners directly (offline fallback).
 *
 * Features:
 * - Global scan mutex (prevents overlapping scans)
 * - Offline queue (deferred until network returns, no NetInfo dependency)
 * - Per-content-item parallelism with source isolation
 * - Scan health tracking (last scan time, success/failure)
 * - Notification dedup via wasNotified / markNotified
 * - Plan gating (enforced before scan starts)
 */

import { Storage } from '../../utils/storage';
import { Logger } from '../../utils/logger';
import {
  SigilAlert, ScanInput, AlertSource, ContentType,
  getAlerts, saveAlert, wasNotified, markNotified, buildAlert,
} from './base';
import { GitHubScanner } from './github';
import { RedditScanner } from './reddit';
import { StackOverflowScanner } from './stackoverflow';
import { HuggingFaceScanner } from './huggingface';
import { NpmScanner } from './npm';
import { WebScanner } from './web';
import { ImageScanner } from './image';
import {
  isApiReachable,
  submitScanJob,
  pollScanJob,
  getStoredToken,
} from '../scanClient';

// ── Re-export base types for consumers ───────────────────────────────────────
export type { SigilAlert, AlertSource, ContentType };
export { getAlerts, saveAlert, updateAlert, clearAlerts } from './base';
export { wasNotified, markNotified } from './base';

// ── Constants ─────────────────────────────────────────────────────────────────
const LOCK_KEY = 'sigil_scan_lock';
const QUEUE_KEY = 'sigil_scan_queue';
const HEALTH_KEY = 'sigil_scan_health';
const LOCK_TTL = 10 * 60 * 1000;
export const BACKGROUND_SCAN_TASK = 'SIGIL_BACKGROUND_SCAN';

// Fallback client-side scanners (order = priority)
const CLIENT_SCANNERS = [
  GitHubScanner,
  RedditScanner,
  StackOverflowScanner,
  HuggingFaceScanner,
  NpmScanner,
  WebScanner,
  ImageScanner,
];

// ── Scan health ───────────────────────────────────────────────────────────────

export interface ScanHealth {
  lastScanAt: number;
  lastScanSuccess: boolean;
  lastScanError: string;
  totalScans: number;
  totalMatches: number;
  isLocked: boolean;
  lastScanMode: 'api' | 'client' | 'queued' | '';
}

export async function getScanHealth(): Promise<ScanHealth> {
  try {
    const raw = await Storage.getItem(HEALTH_KEY);
    return raw ? JSON.parse(raw) : defaultHealth();
  } catch { return defaultHealth(); }
}

function defaultHealth(): ScanHealth {
  return { lastScanAt: 0, lastScanSuccess: false, lastScanError: '', totalScans: 0, totalMatches: 0, isLocked: false, lastScanMode: '' };
}

async function updateHealth(patch: Partial<ScanHealth>) {
  const h = await getScanHealth();
  await Storage.setItem(HEALTH_KEY, JSON.stringify({ ...h, ...patch }));
}

// ── Network detection ─────────────────────────────────────────────────────────

async function isOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://dns.google/resolve?name=sigil.check', {
      method: 'HEAD',
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timer);
    return res !== null;
  } catch { return true; }
}

// ── Mutex ─────────────────────────────────────────────────────────────────────

async function acquireLock(): Promise<boolean> {
  try {
    const raw = await Storage.getItem(LOCK_KEY);
    if (raw) {
      const ts = parseInt(raw, 10);
      if (Date.now() - ts < LOCK_TTL) {
        Logger.warn('scanner', 'Scan already in progress — mutex locked');
        return false;
      }
    }
    await Storage.setItem(LOCK_KEY, String(Date.now()));
    return true;
  } catch { return true; }
}

async function releaseLock() {
  await Storage.removeItem(LOCK_KEY);
}

// ── Offline queue ─────────────────────────────────────────────────────────────

export interface QueuedScan {
  contentHash: string;
  contentName: string;
  contentType: ContentType;
  watermarkPattern: string;
  rawContent?: string;
  queuedAt: number;
}

export async function getQueue(): Promise<QueuedScan[]> {
  try {
    const raw = await Storage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function clearQueue() {
  await Storage.removeItem(QUEUE_KEY);
}

export async function queueScan(items: QueuedScan[]): Promise<void> {
  const existing = await getQueue();
  const merged = [
    ...items.map((i) => ({ ...i, queuedAt: Date.now() })),
    ...existing.filter((e) => !items.find((i) => i.contentHash === e.contentHash)),
  ].slice(0, 50);
  await Storage.setItem(QUEUE_KEY, JSON.stringify(merged));
  Logger.info('scanner', `Queued ${items.length} items for offline scan`);
}

// ── Scan item type ────────────────────────────────────────────────────────────

export interface ScanItem {
  contentHash: string;
  contentName: string;
  contentType: ContentType;
  watermarkPattern: string;
  rawContent?: string;
}

// ── API scan path ─────────────────────────────────────────────────────────────

async function runApiScan(item: ScanItem): Promise<SigilAlert[]> {
  const job = await submitScanJob({
    contentHash: item.contentHash,
    contentName: item.contentName,
    contentType: item.contentType,
    watermarkPattern: item.watermarkPattern,
    rawContent: item.rawContent,
  });

  if (!job) return [];

  const result = await pollScanJob(job.jobId, 120, 4000);
  if (!result || result.status !== 'completed') return [];

  const alerts: SigilAlert[] = [];
  const existingAlerts = await getAlerts();
  const existingIds = new Set(existingAlerts.map((a) => a.id));

  for (const match of result.matches) {
    if (existingIds.has(match.alertId)) continue;
    const input: ScanInput = {
      watermarkPattern: item.watermarkPattern,
      contentHash: item.contentHash,
      contentName: item.contentName,
      contentType: item.contentType,
    };
    const alert = buildAlert(
      match.alertId,
      input,
      match.source as AlertSource,
      match.url,
      match.title,
      {
        confidence: match.confidence,
        reason: `${match.source} scan — ${match.confidence}% match`,
        layers: { exact: match.confidence === 100, levenshtein: 0, tokenOverlap: 0, cosine: match.confidence },
      }
    );
    await saveAlert(alert);
    alerts.push(alert);
    existingIds.add(match.alertId);
  }

  return alerts;
}

// ── Client-side scan path ─────────────────────────────────────────────────────

async function runClientScan(items: ScanItem[]): Promise<SigilAlert[]> {
  const allAlerts: SigilAlert[] = [];
  const existingAlerts = await getAlerts();
  const existingIds = new Set(existingAlerts.map((a) => a.id));

  for (const item of items) {
    const input: ScanInput = {
      watermarkPattern: item.watermarkPattern,
      contentHash: item.contentHash,
      contentName: item.contentName,
      contentType: item.contentType as ContentType,
      rawOriginal: item.rawContent,
    };
    const results = await Promise.allSettled(CLIENT_SCANNERS.map((s) => s.scan(input)));
    for (const r of results) {
      if (r.status === 'fulfilled') {
        for (const alert of r.value) {
          if (!existingIds.has(alert.id)) {
            await saveAlert(alert);
            allAlerts.push(alert);
            existingIds.add(alert.id);
          }
        }
      }
    }
  }

  return allAlerts;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runFullScan(registeredContent: ScanItem[]): Promise<SigilAlert[]> {
  if (registeredContent.length === 0) return [];

  const online = await isOnline();
  if (!online) {
    Logger.warn('scanner', 'Offline — queuing scan');
    await queueScan(registeredContent as QueuedScan[]);
    await updateHealth({ lastScanMode: 'queued' });
    return [];
  }

  const locked = await acquireLock();
  if (!locked) return [];

  await updateHealth({ isLocked: true });
  const startAt = Date.now();

  try {
    Logger.info('scanner', `Starting full scan of ${registeredContent.length} items`);

    // Determine scan mode: API if reachable + authenticated
    const [apiUp, token] = await Promise.all([isApiReachable(), getStoredToken()]);
    const useApi = apiUp && !!token;

    Logger.info('scanner', `Scan mode: ${useApi ? 'API' : 'client-side fallback'}`);

    let allAlerts: SigilAlert[] = [];

    if (useApi) {
      // API path: submit jobs in parallel (one per content item)
      const jobResults = await Promise.allSettled(
        registeredContent.map((item) => runApiScan(item))
      );
      for (const r of jobResults) {
        if (r.status === 'fulfilled') allAlerts.push(...r.value);
      }
    } else {
      // Client fallback
      allAlerts = await runClientScan(registeredContent);
    }

    const elapsed = Date.now() - startAt;
    Logger.info('scanner', `Scan complete in ${elapsed}ms — ${allAlerts.length} new alerts (${useApi ? 'api' : 'client'})`);

    const h = await getScanHealth();
    await updateHealth({
      lastScanAt: Date.now(),
      lastScanSuccess: true,
      lastScanError: '',
      totalScans: h.totalScans + 1,
      totalMatches: h.totalMatches + allAlerts.length,
      isLocked: false,
      lastScanMode: useApi ? 'api' : 'client',
    });

    // Drain offline queue
    const queued = await getQueue();
    if (queued.length > 0) {
      Logger.info('scanner', `Resuming ${queued.length} queued scans`);
      await clearQueue();
      setTimeout(() => runFullScan(queued), 3000);
    }

    return allAlerts;
  } catch (err: any) {
    Logger.error('scanner', 'Full scan error', { msg: err?.message });
    await updateHealth({
      lastScanAt: Date.now(),
      lastScanSuccess: false,
      lastScanError: err?.message ?? 'Unknown error',
      isLocked: false,
    });
    return [];
  } finally {
    await releaseLock();
  }
}

/** Returns new alerts that haven't been push-notified yet. */
export async function getUnnotifiedAlerts(): Promise<SigilAlert[]> {
  const all = await getAlerts();
  const fresh: SigilAlert[] = [];
  for (const a of all) {
    if (!(await wasNotified(a.id))) fresh.push(a);
  }
  return fresh;
}
