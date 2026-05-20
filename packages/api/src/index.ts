/**
 * SIGIL API Server
 *
 * Lightweight Express backend:
 *  - /api/auth        — wallet-signature nonce + JWT issuance
 *  - /api/scan        — async scan job submission + result polling
 *  - /api/disputes    — dispute queue CRUD + admin review
 *  - /api/health      — liveness probe
 *
 * No Redis required. State is in-memory (suitable for single-instance).
 * Flat-file persistence: writes state to ./data/ on process exit / interval.
 */

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { authRouter } from './routes/auth';
import { scanRouter } from './routes/scan';
import { disputeRouter } from './routes/dispute';

const PORT = parseInt(process.env.PORT ?? '3750', 10);
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? '*').split(',');

const app: import('express').Application = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: CORS_ORIGINS,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/scan', scanRouter);
app.use('/api/disputes', disputeRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now(), version: '1.0.0' });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[API Error]', err?.message ?? err);
  res.status(err?.status ?? 500).json({ error: err?.message ?? 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[SIGIL API] Listening on :${PORT}`);
});

export default app;
