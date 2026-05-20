/**
 * SIGIL API — In-process scan job queue
 *
 * No Redis or BullMQ dependency. Designed for single-instance portability.
 * Workers run in the same process, concurrency-limited.
 *
 * States: pending → running → completed | failed
 * Persistence: in-memory (survives deploys only via in-process state)
 *
 * Max queued jobs: 500
 * Max concurrent workers: 3
 * Retry on failure: 2 attempts with exponential backoff
 * TTL: jobs expire from memory after 2h
 */

import { v4 as uuidv4 } from 'uuid';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ScanJobInput {
  walletAddress: string;
  contentHash: string;
  contentName: string;
  contentType: string;
  watermarkPattern: string;
  rawContent?: string; // optional — for pHash image scanning
}

export interface ScanMatch {
  source: string;
  url: string;
  title: string;
  confidence: number;
  detectedAt: number;
  alertId: string;
}

export interface ScanJob {
  id: string;
  status: JobStatus;
  input: ScanJobInput;
  matches: ScanMatch[];
  error?: string;
  attempts: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

type WorkerFn = (job: ScanJob) => Promise<ScanMatch[]>;

// ── State ─────────────────────────────────────────────────────────────────────
const jobs = new Map<string, ScanJob>();
const queue: string[] = []; // ordered list of pending job IDs
const MAX_JOBS = 500;
const MAX_CONCURRENCY = 3;
const JOB_TTL = 2 * 60 * 60 * 1000; // 2h
const MAX_RETRIES = 2;

let activeWorkers = 0;
let workerFn: WorkerFn | null = null;

// ── Job management ────────────────────────────────────────────────────────────

export function registerWorker(fn: WorkerFn) {
  workerFn = fn;
}

export function enqueueJob(input: ScanJobInput): ScanJob {
  // Deduplicate: one pending/running job per (walletAddress + contentHash)
  for (const job of jobs.values()) {
    if (
      job.input.walletAddress === input.walletAddress &&
      job.input.contentHash === input.contentHash &&
      (job.status === 'pending' || job.status === 'running')
    ) {
      return job; // return existing job
    }
  }

  if (jobs.size >= MAX_JOBS) {
    // Evict oldest completed/failed jobs to make space
    const evictable = [...jobs.values()]
      .filter((j) => j.status === 'completed' || j.status === 'failed')
      .sort((a, b) => a.createdAt - b.createdAt);
    if (evictable.length > 0) {
      jobs.delete(evictable[0].id);
    } else {
      throw new Error('Scan queue full. Please try again later.');
    }
  }

  const job: ScanJob = {
    id: uuidv4(),
    status: 'pending',
    input,
    matches: [],
    attempts: 0,
    createdAt: Date.now(),
  };

  jobs.set(job.id, job);
  queue.push(job.id);
  tick();
  return job;
}

export function getJob(id: string): ScanJob | null {
  return jobs.get(id) ?? null;
}

export function getJobsByWallet(walletAddress: string): ScanJob[] {
  return [...jobs.values()]
    .filter((j) => j.input.walletAddress.toLowerCase() === walletAddress.toLowerCase())
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getQueueStats() {
  const all = [...jobs.values()];
  return {
    pending: all.filter((j) => j.status === 'pending').length,
    running: all.filter((j) => j.status === 'running').length,
    completed: all.filter((j) => j.status === 'completed').length,
    failed: all.filter((j) => j.status === 'failed').length,
    total: all.length,
  };
}

// ── Evict expired jobs ────────────────────────────────────────────────────────
setInterval(() => {
  const cutoff = Date.now() - JOB_TTL;
  for (const [id, job] of jobs) {
    if (
      (job.status === 'completed' || job.status === 'failed') &&
      job.createdAt < cutoff
    ) {
      jobs.delete(id);
    }
  }
}, 10 * 60 * 1000);

// ── Worker dispatcher ─────────────────────────────────────────────────────────

function tick() {
  if (!workerFn || activeWorkers >= MAX_CONCURRENCY || queue.length === 0) return;

  const jobId = queue.shift();
  if (!jobId) return;

  const job = jobs.get(jobId);
  if (!job || job.status !== 'pending') {
    tick(); // skip deleted/stale entries
    return;
  }

  job.status = 'running';
  job.startedAt = Date.now();
  job.attempts += 1;
  activeWorkers++;

  workerFn(job)
    .then((matches) => {
      job.status = 'completed';
      job.matches = matches;
      job.completedAt = Date.now();
    })
    .catch((err: any) => {
      console.error(`[ScanQueue] Job ${job.id} failed (attempt ${job.attempts}):`, err?.message);
      if (job.attempts < MAX_RETRIES) {
        // Exponential backoff re-queue
        const delay = 2000 * Math.pow(2, job.attempts - 1);
        job.status = 'pending';
        setTimeout(() => {
          queue.push(job.id);
          tick();
        }, delay);
      } else {
        job.status = 'failed';
        job.error = err?.message ?? 'Unknown error';
        job.completedAt = Date.now();
      }
    })
    .finally(() => {
      activeWorkers--;
      tick(); // pull next job
    });

  // Pull more jobs up to concurrency limit
  if (activeWorkers < MAX_CONCURRENCY && queue.length > 0) tick();
}
