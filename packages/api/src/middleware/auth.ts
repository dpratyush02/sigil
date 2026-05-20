/**
 * SIGIL API — Wallet-signed JWT auth middleware
 *
 * Flow:
 *  1. Client calls POST /api/auth/nonce  → receives a one-time nonce
 *  2. Client signs: `SIGIL nonce:<nonce>` with their MetaMask wallet
 *  3. Client calls POST /api/auth/verify { address, nonce, signature }
 *     → receives short-lived JWT (4h TTL)
 *  4. All protected routes require: Authorization: Bearer <jwt>
 *
 * JWT payload: { sub: walletAddress, iat, exp }
 * Secret: env JWT_SECRET (fallback to hardcoded dev secret — NEVER in prod)
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';

const JWT_SECRET = process.env.JWT_SECRET ?? 'sigil-dev-secret-change-in-prod';
const NONCE_TTL = 5 * 60 * 1000; // 5 minutes

// ── In-memory nonce store (small, ephemeral) ─────────────────────────────────
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();

// Clean up expired nonces every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [addr, entry] of nonceStore) {
    if (entry.expiresAt < now) nonceStore.delete(addr);
  }
}, 5 * 60 * 1000);

// ── Nonce generation ──────────────────────────────────────────────────────────

export function generateNonce(address: string): string {
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  nonceStore.set(address.toLowerCase(), {
    nonce,
    expiresAt: Date.now() + NONCE_TTL,
  });
  return nonce;
}

// ── Signature verification ────────────────────────────────────────────────────

export function verifyWalletSignature(
  address: string,
  nonce: string,
  signature: string
): boolean {
  try {
    const message = `SIGIL nonce:${nonce}`;
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}

export function consumeNonce(address: string): string | null {
  const entry = nonceStore.get(address.toLowerCase());
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    nonceStore.delete(address.toLowerCase());
    return null;
  }
  nonceStore.delete(address.toLowerCase()); // one-time use
  return entry.nonce;
}

// ── JWT issuance ──────────────────────────────────────────────────────────────

export function issueJWT(walletAddress: string): string {
  return jwt.sign(
    { sub: walletAddress.toLowerCase(), role: 'user' },
    JWT_SECRET,
    { expiresIn: '4h' }
  );
}

export function issueAdminJWT(walletAddress: string): string {
  return jwt.sign(
    { sub: walletAddress.toLowerCase(), role: 'admin' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
}

// ── Auth middleware ───────────────────────────────────────────────────────────

export interface AuthRequest extends Request {
  wallet?: string;
  role?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    req.wallet = payload.sub;
    req.role = payload.role ?? 'user';
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    const ADMIN_WALLETS = (process.env.ADMIN_WALLETS ?? '').toLowerCase().split(',');
    if (req.role === 'admin' || ADMIN_WALLETS.includes(req.wallet ?? '')) {
      next();
    } else {
      res.status(403).json({ error: 'Admin access required' });
    }
  });
}
