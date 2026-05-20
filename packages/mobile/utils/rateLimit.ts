/**
 * SIGIL — Per-source circuit breaker + rate limit manager
 * Tracks remaining API quota, failure counts, and adaptive cooldowns.
 */

import { Storage } from './storage';
import { Logger } from './logger';

const RL_KEY = 'sigil_rate_limits';

interface SourceState {
  /** Remaining requests from last API response header */
  remaining: number;
  /** Unix ms when the window resets */
  resetAt: number;
  /** Consecutive failures */
  failures: number;
  /** Last success timestamp */
  lastSuccess: number;
  /** Circuit open — stop sending requests until resetAt */
  open: boolean;
}

const DEFAULT_STATE: SourceState = {
  remaining: 30,
  resetAt: 0,
  failures: 0,
  lastSuccess: 0,
  open: false,
};

// In-memory state (synced to storage lazily)
let _state: Record<string, SourceState> = {};
let _loaded = false;

async function load() {
  if (_loaded) return;
  try {
    const raw = await Storage.getItem(RL_KEY);
    if (raw) _state = JSON.parse(raw);
    _loaded = true;
  } catch {
    _loaded = true;
  }
}

async function save() {
  try {
    await Storage.setItem(RL_KEY, JSON.stringify(_state));
  } catch {}
}

function getState(source: string): SourceState {
  return _state[source] ?? { ...DEFAULT_STATE };
}

/** Returns true if this source is available (circuit closed and quota remaining) */
export async function canRequest(source: string): Promise<boolean> {
  await load();
  const s = getState(source);
  const now = Date.now();

  // Reset circuit if window expired
  if (s.open && s.resetAt && now > s.resetAt) {
    _state[source] = { ...s, open: false, failures: 0 };
    await save();
    return true;
  }
  if (s.open) {
    Logger.warn('api', `Circuit open for ${source}, skipping`, { resetIn: s.resetAt - now });
    return false;
  }
  if (s.remaining <= 1 && s.resetAt && now < s.resetAt) {
    Logger.warn('api', `Rate limit near-exhausted for ${source}`, { remaining: s.remaining });
    return false;
  }
  return true;
}

/** Update state from a successful response — pass GitHub-style headers */
export async function recordSuccess(
  source: string,
  headers?: { 'x-ratelimit-remaining'?: string; 'x-ratelimit-reset'?: string }
) {
  await load();
  const s = getState(source);
  const now = Date.now();

  _state[source] = {
    ...s,
    failures: 0,
    open: false,
    lastSuccess: now,
    remaining: headers?.['x-ratelimit-remaining']
      ? parseInt(headers['x-ratelimit-remaining'], 10)
      : Math.min(s.remaining + 5, 30),
    resetAt: headers?.['x-ratelimit-reset']
      ? parseInt(headers['x-ratelimit-reset'], 10) * 1000
      : s.resetAt,
  };
  await save();
}

/** Call on request failure — exponential backoff opens circuit at 5 failures */
export async function recordFailure(source: string): Promise<number> {
  await load();
  const s = getState(source);
  const failures = s.failures + 1;
  const backoffMs = Math.min(1000 * Math.pow(2, failures) + jitter(), 300_000); // max 5 min
  const open = failures >= 5;

  _state[source] = {
    ...s,
    failures,
    open,
    resetAt: open ? Date.now() + backoffMs : s.resetAt,
  };

  Logger.warn('api', `Failure #${failures} for ${source}${open ? ' — circuit OPEN' : ''}`, {
    backoffMs,
  });

  await save();
  return backoffMs;
}

export async function getSourceHealth(): Promise<Record<string, SourceState>> {
  await load();
  return { ..._state };
}

function jitter(): number {
  return Math.floor(Math.random() * 500);
}

/** Exponential backoff + jitter helper for retrying requests */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { source, maxRetries = 3, timeoutMs = 10000 }: { source: string; maxRetries?: number; timeoutMs?: number }
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (!(await canRequest(source))) throw new Error(`${source} circuit open`);
    try {
      const result = await withTimeout(fn(), timeoutMs);
      await recordSuccess(source);
      return result;
    } catch (err) {
      lastErr = err;
      const wait = await recordFailure(source);
      if (attempt < maxRetries - 1) {
        Logger.info('api', `Retrying ${source} in ${wait}ms (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Request timeout')), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
