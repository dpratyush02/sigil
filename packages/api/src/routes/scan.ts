/**
 * SIGIL API — Scan routes
 *
 * POST /api/scan/submit   { contentHash, contentName, contentType, watermarkPattern, rawContent? }
 *                          → { jobId, status: 'pending' }
 *
 * GET  /api/scan/:jobId   → ScanJob (poll for status + matches)
 *
 * GET  /api/scan/          → all jobs for authenticated wallet
 *
 * GET  /api/scan/stats     → queue stats (admin only)
 */

import { Router } from 'express';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import {
  enqueueJob,
  getJob,
  getJobsByWallet,
  getQueueStats,
  registerWorker,
  ScanJob,
} from '../queues/scanQueue';
import { runScanners, ScanInput } from '../scanners/index';

export const scanRouter: import("express").Router = Router();

// ── Register the scan worker ──────────────────────────────────────────────────
registerWorker(async (job: ScanJob) => {
  const input: ScanInput = {
    watermarkPattern: job.input.watermarkPattern,
    contentHash: job.input.contentHash,
    contentName: job.input.contentName,
    contentType: job.input.contentType as any,
    rawOriginal: job.input.rawContent,
  };
  return runScanners(input);
});

// ── POST /api/scan/submit ─────────────────────────────────────────────────────
scanRouter.post('/submit', requireAuth, (req: AuthRequest, res) => {
  const { contentHash, contentName, contentType, watermarkPattern, rawContent } = req.body as {
    contentHash?: string;
    contentName?: string;
    contentType?: string;
    watermarkPattern?: string;
    rawContent?: string;
  };

  if (!contentHash || !contentName || !contentType || !watermarkPattern) {
    res.status(400).json({ error: 'contentHash, contentName, contentType, watermarkPattern are required' });
    return;
  }

  // Validate contentHash is hex-like
  if (!/^[0-9a-fA-F]{8,}$/.test(contentHash)) {
    res.status(400).json({ error: 'Invalid contentHash format' });
    return;
  }

  // Validate contentType
  const validTypes = ['text', 'code', 'image', 'document'];
  if (!validTypes.includes(contentType)) {
    res.status(400).json({ error: `contentType must be one of: ${validTypes.join(', ')}` });
    return;
  }

  // Limit rawContent size server-side (2MB guard)
  if (rawContent && rawContent.length > 2 * 1024 * 1024) {
    res.status(413).json({ error: 'rawContent too large (max 2MB)' });
    return;
  }

  try {
    const job = enqueueJob({
      walletAddress: req.wallet!,
      contentHash,
      contentName: contentName.slice(0, 200),
      contentType,
      watermarkPattern: watermarkPattern.slice(0, 200),
      rawContent,
    });

    res.status(202).json({
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt,
    });
  } catch (err: any) {
    res.status(503).json({ error: err?.message ?? 'Queue unavailable' });
  }
});

// ── GET /api/scan/stats ───────────────────────────────────────────────────────
scanRouter.get('/stats', requireAdmin, (_req, res) => {
  res.json(getQueueStats());
});

// ── GET /api/scan/ ────────────────────────────────────────────────────────────
scanRouter.get('/', requireAuth, (req: AuthRequest, res) => {
  const jobs = getJobsByWallet(req.wallet!);
  res.json({ jobs: jobs.slice(0, 50) });
});

// ── GET /api/scan/:jobId ──────────────────────────────────────────────────────
scanRouter.get('/:jobId', requireAuth, (req: AuthRequest, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  // Only the job owner can see results
  if (job.input.walletAddress.toLowerCase() !== req.wallet!.toLowerCase()) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(job);
});
