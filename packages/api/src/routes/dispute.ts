/**
 * SIGIL API — Dispute routes
 *
 * POST /api/disputes/submit      { alertId, contentHash, reason, evidence? }
 *                                  → { disputeId }
 *
 * GET  /api/disputes/             → disputes for authenticated wallet
 * GET  /api/disputes/queue        → all open disputes (admin)
 * GET  /api/disputes/:disputeId   → single dispute detail
 *
 * PATCH /api/disputes/:disputeId/resolve
 *   { resolution: 'upheld' | 'dismissed' | 'pending', notes? }
 *   → updated dispute (admin only)
 *
 * DELETE /api/disputes/:disputeId → withdraw dispute (owner only)
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';

export const disputeRouter: import("express").Router = Router();

export type DisputeStatus = 'open' | 'reviewing' | 'upheld' | 'dismissed' | 'withdrawn';

export interface Dispute {
  id: string;
  walletAddress: string;
  alertId: string;
  contentHash: string;
  reason: string;
  evidence?: string;    // URL or short description
  status: DisputeStatus;
  adminNotes?: string;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  resolvedBy?: string;  // admin wallet
}

// ── In-memory store ───────────────────────────────────────────────────────────
const disputes = new Map<string, Dispute>();
const MAX_DISPUTES = 2000;
const MAX_OPEN_PER_WALLET = 10;

// ── Helper ────────────────────────────────────────────────────────────────────
function sanitize(s: string): string {
  return s.replace(/[<>"]/g, '').replace(/javascript:/gi, '').trim();
}

// ── POST /api/disputes/submit ─────────────────────────────────────────────────
disputeRouter.post('/submit', requireAuth, (req: AuthRequest, res) => {
  const { alertId, contentHash, reason, evidence } = req.body as {
    alertId?: string;
    contentHash?: string;
    reason?: string;
    evidence?: string;
  };

  if (!alertId || !contentHash || !reason) {
    res.status(400).json({ error: 'alertId, contentHash, and reason are required' });
    return;
  }

  if (reason.trim().length < 20) {
    res.status(400).json({ error: 'reason must be at least 20 characters' });
    return;
  }

  // Rate limit: max open disputes per wallet
  const walletDisputes = [...disputes.values()].filter(
    (d) => d.walletAddress === req.wallet && d.status === 'open'
  );
  if (walletDisputes.length >= MAX_OPEN_PER_WALLET) {
    res.status(429).json({ error: `Maximum ${MAX_OPEN_PER_WALLET} open disputes allowed` });
    return;
  }

  // Prevent duplicate submission for same alert
  const existing = [...disputes.values()].find(
    (d) => d.alertId === alertId && d.walletAddress === req.wallet && d.status !== 'dismissed' && d.status !== 'withdrawn'
  );
  if (existing) {
    res.status(409).json({ error: 'Dispute already submitted for this alert', disputeId: existing.id });
    return;
  }

  if (disputes.size >= MAX_DISPUTES) {
    res.status(503).json({ error: 'Dispute queue full. Please try again later.' });
    return;
  }

  const dispute: Dispute = {
    id: uuidv4(),
    walletAddress: req.wallet!,
    alertId: sanitize(alertId),
    contentHash: sanitize(contentHash),
    reason: sanitize(reason).slice(0, 1000),
    evidence: evidence ? sanitize(evidence).slice(0, 500) : undefined,
    status: 'open',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  disputes.set(dispute.id, dispute);
  res.status(201).json({ disputeId: dispute.id, status: dispute.status });
});

// ── GET /api/disputes/ ────────────────────────────────────────────────────────
disputeRouter.get('/', requireAuth, (req: AuthRequest, res) => {
  const walletDisputes = [...disputes.values()]
    .filter((d) => d.walletAddress === req.wallet)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 100);
  res.json({ disputes: walletDisputes });
});

// ── GET /api/disputes/queue ───────────────────────────────────────────────────
disputeRouter.get('/queue', requireAdmin, (_req, res) => {
  const open = [...disputes.values()]
    .filter((d) => d.status === 'open' || d.status === 'reviewing')
    .sort((a, b) => a.createdAt - b.createdAt); // oldest first
  res.json({ disputes: open, total: disputes.size });
});

// ── GET /api/disputes/:disputeId ──────────────────────────────────────────────
disputeRouter.get('/:disputeId', requireAuth, (req: AuthRequest, res) => {
  const d = disputes.get(req.params.disputeId);
  if (!d) { res.status(404).json({ error: 'Dispute not found' }); return; }
  if (d.walletAddress !== req.wallet && req.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  res.json(d);
});

// ── PATCH /api/disputes/:disputeId/resolve ────────────────────────────────────
disputeRouter.patch('/:disputeId/resolve', requireAdmin, (req: AuthRequest, res) => {
  const d = disputes.get(req.params.disputeId);
  if (!d) { res.status(404).json({ error: 'Dispute not found' }); return; }

  const { resolution, notes } = req.body as { resolution?: string; notes?: string };
  const valid: DisputeStatus[] = ['upheld', 'dismissed', 'reviewing'];
  if (!resolution || !valid.includes(resolution as DisputeStatus)) {
    res.status(400).json({ error: `resolution must be one of: ${valid.join(', ')}` });
    return;
  }

  d.status = resolution as DisputeStatus;
  d.adminNotes = notes ? sanitize(notes).slice(0, 500) : undefined;
  d.updatedAt = Date.now();
  if (resolution !== 'reviewing') {
    d.resolvedAt = Date.now();
    d.resolvedBy = req.wallet;
  }

  res.json(d);
});

// ── DELETE /api/disputes/:disputeId ──────────────────────────────────────────
disputeRouter.delete('/:disputeId', requireAuth, (req: AuthRequest, res) => {
  const d = disputes.get(req.params.disputeId);
  if (!d) { res.status(404).json({ error: 'Dispute not found' }); return; }
  if (d.walletAddress !== req.wallet) { res.status(403).json({ error: 'Forbidden' }); return; }
  if (d.status !== 'open') { res.status(400).json({ error: 'Only open disputes can be withdrawn' }); return; }

  d.status = 'withdrawn';
  d.updatedAt = Date.now();
  res.json({ ok: true });
});
