/**
 * SIGIL — Offline Queue + Network Monitor
 *
 * Persists pending jobs across app restart.
 * Retries automatically when network is restored.
 */

import { Storage } from './storage';
import { Logger } from './logger';

const QUEUE_KEY = 'sigil_offline_queue';
const NET_KEY = 'sigil_network_online';

export type QueueJobType = 'scan' | 'blockchain' | 'upload';

export interface QueueJob {
  id: string;
  type: QueueJobType;
  payload: any;
  addedAt: number;
  retries: number;
}

// ── Persistence ───────────────────────────────────────────────────────────────
async function loadQueue(): Promise<QueueJob[]> {
  try {
    const raw = await Storage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(jobs: QueueJob[]): Promise<void> {
  await Storage.setItem(QUEUE_KEY, JSON.stringify(jobs));
}

export async function enqueueJob(type: QueueJobType, payload: any): Promise<void> {
  const jobs = await loadQueue();
  jobs.push({
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    addedAt: Date.now(),
    retries: 0,
  });
  await saveQueue(jobs);
  Logger.info('offlineQueue', `Queued ${type} job (total: ${jobs.length})`);
}

export async function getPendingJobs(): Promise<QueueJob[]> {
  return loadQueue();
}

export async function removeJob(id: string): Promise<void> {
  const jobs = await loadQueue();
  await saveQueue(jobs.filter((j) => j.id !== id));
}

export async function incrementRetry(id: string): Promise<void> {
  const jobs = await loadQueue();
  const job = jobs.find((j) => j.id === id);
  if (job) {
    job.retries += 1;
    await saveQueue(jobs);
  }
}

export async function clearQueue(): Promise<void> {
  await Storage.removeItem(QUEUE_KEY);
  Logger.info('offlineQueue', 'Queue cleared');
}

export async function getQueueCount(): Promise<number> {
  const jobs = await loadQueue();
  return jobs.length;
}

// ── Network state (simple polling, no native netinfo dep) ─────────────────────
let _isOnline = true;
let _listeners: Array<(online: boolean) => void> = [];

export function getNetworkState(): boolean {
  return _isOnline;
}

export function addNetworkListener(fn: (online: boolean) => void): () => void {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}

async function checkConnectivity(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('https://www.google.com/generate_204', {
      method: 'HEAD',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.status === 204 || res.ok;
  } catch {
    return false;
  }
}

let _pollTimer: ReturnType<typeof setInterval> | null = null;

export function startNetworkMonitor() {
  if (_pollTimer) return; // already running

  const poll = async () => {
    const nowOnline = await checkConnectivity();
    if (nowOnline !== _isOnline) {
      _isOnline = nowOnline;
      Logger.info('offlineQueue', `Network: ${nowOnline ? 'ONLINE' : 'OFFLINE'}`);
      _listeners.forEach((l) => l(nowOnline));
    }
  };

  // immediate check
  poll();
  _pollTimer = setInterval(poll, 15_000);
}

export function stopNetworkMonitor() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}
