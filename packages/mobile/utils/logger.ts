/**
 * SIGIL — Structured production logger
 * Persists last N entries to storage for the debug screen.
 * Zero dependencies — pure RN.
 */

import { Storage } from './storage';

const LOG_KEY = 'sigil_logs';
const MAX_ENTRIES = 500;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogDomain =
  | 'wallet'
  | 'blockchain'
  | 'scanner'
  | 'notification'
  | 'api'
  | 'task'
  | 'ipfs'
  | 'similarity'
  | 'offlineQueue'
  | 'image-scanner'
  | 'scanClient'
  | 'contract'
  | 'planGating'
  | 'general';

export interface LogEntry {
  ts: number;
  level: LogLevel;
  domain: LogDomain;
  msg: string;
  data?: unknown;
}

// In-memory buffer (no I/O on every log line)
let _buffer: LogEntry[] = [];
let _flushTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (_flushTimeout) return;
  _flushTimeout = setTimeout(async () => {
    _flushTimeout = null;
    await flush();
  }, 2000);
}

async function flush() {
  try {
    const raw = await Storage.getItem(LOG_KEY);
    const existing: LogEntry[] = raw ? JSON.parse(raw) : [];
    const merged = [..._buffer, ...existing].slice(0, MAX_ENTRIES);
    await Storage.setItem(LOG_KEY, JSON.stringify(merged));
    _buffer = [];
  } catch {
    _buffer = [];
  }
}

function log(level: LogLevel, domain: LogDomain, msg: string, data?: unknown) {
  const entry: LogEntry = { ts: Date.now(), level, domain, msg, data };
  _buffer.push(entry);
  scheduleFlush();
  if (__DEV__) {
    const prefix = `[SIGIL:${domain}]`;
    if (level === 'error') console.error(prefix, msg, data ?? '');
    else if (level === 'warn') console.warn(prefix, msg, data ?? '');
    else console.log(prefix, msg, data ?? '');
  }
}

export const Logger = {
  debug: (domain: LogDomain, msg: string, data?: unknown) => log('debug', domain, msg, data),
  info: (domain: LogDomain, msg: string, data?: unknown) => log('info', domain, msg, data),
  warn: (domain: LogDomain, msg: string, data?: unknown) => log('warn', domain, msg, data),
  error: (domain: LogDomain, msg: string, data?: unknown) => log('error', domain, msg, data),

  async getLogs(): Promise<LogEntry[]> {
    try {
      await flush(); // drain buffer first
      const raw = await Storage.getItem(LOG_KEY);
      return raw ? (JSON.parse(raw) as LogEntry[]) : [];
    } catch {
      return [];
    }
  },

  async clearLogs(): Promise<void> {
    _buffer = [];
    await Storage.removeItem(LOG_KEY);
  },

  /** Return the N most recent log entries (newest first). */
  async getRecent(limit = 100): Promise<LogEntry[]> {
    const all = await Logger.getLogs();
    return all.slice(0, limit);
  },
};
