/**
 * SIGIL API — Auth routes
 *
 * POST /api/auth/nonce   { address }            → { nonce }
 * POST /api/auth/verify  { address, nonce, sig } → { token }
 */

import { Router } from 'express';
import {
  generateNonce,
  verifyWalletSignature,
  consumeNonce,
  issueJWT,
} from '../middleware/auth';

export const authRouter: import("express").Router = Router();

// POST /api/auth/nonce
authRouter.post('/nonce', (req, res) => {
  const { address } = req.body as { address?: string };
  if (!address || typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    res.status(400).json({ error: 'Invalid wallet address' });
    return;
  }
  const nonce = generateNonce(address);
  res.json({ nonce, message: `SIGIL nonce:${nonce}` });
});

// POST /api/auth/verify
authRouter.post('/verify', (req, res) => {
  const { address, nonce, signature } = req.body as {
    address?: string;
    nonce?: string;
    signature?: string;
  };

  if (!address || !nonce || !signature) {
    res.status(400).json({ error: 'address, nonce, and signature are required' });
    return;
  }

  // Verify nonce was issued for this address
  const storedNonce = consumeNonce(address);
  if (!storedNonce || storedNonce !== nonce) {
    res.status(401).json({ error: 'Nonce invalid or expired' });
    return;
  }

  // Verify ECDSA signature
  if (!verifyWalletSignature(address, nonce, signature)) {
    res.status(401).json({ error: 'Signature verification failed' });
    return;
  }

  const token = issueJWT(address);
  res.json({ token, wallet: address.toLowerCase(), expiresIn: 14400 });
});
