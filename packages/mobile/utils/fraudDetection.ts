/**
 * SIGIL — Fraud / Abuse Detection
 *
 * Detects patterns that indicate fraudulent or bad-faith claim activity:
 *  - Mass claiming (too many registrations in short window)
 *  - Duplicate content (same hash registered multiple times)
 *  - Bot-like patterns (rapid sequential registration, suspiciously uniform hashes)
 *  - Claim-then-accuse pattern (register → immediately dispute popular content)
 *
 * All checks are client-side. No server, no on-chain reads.
 */

import { Storage } from './storage';

const FRAUD_LOG_KEY = 'sigil_fraud_log';

// ── Thresholds ────────────────────────────────────────────────────────────────
const MASS_CLAIM_WINDOW_MS = 60 * 60 * 1000;   // 1 hour
const MASS_CLAIM_THRESHOLD = 20;                // > 20 claims in 1h = suspicious
const RAPID_CLAIM_GAP_MS = 2000;               // < 2s between claims = bot-like
const RAPID_CLAIM_COUNT = 5;                   // 5+ claims that fast

// ── Types ─────────────────────────────────────────────────────────────────────

export type FraudType =
  | 'mass_claiming'
  | 'duplicate_content'
  | 'bot_pattern'
  | 'claim_then_dispute'
  | 'suspicious_similarity';

export interface FraudFlag {
  id: string;
  type: FraudType;
  severity: 'low' | 'medium' | 'high';
  description: string;
  detectedAt: number;
  contentHash?: string;
  walletAddress?: string;
}

export interface FraudLog {
  flags: FraudFlag[];
  updatedAt: number;
}

// ── Storage ───────────────────────────────────────────────────────────────────

async function loadLog(): Promise<FraudLog> {
  try {
    const raw = await Storage.getItem(FRAUD_LOG_KEY);
    return raw ? JSON.parse(raw) : { flags: [], updatedAt: 0 };
  } catch {
    return { flags: [], updatedAt: 0 };
  }
}

async function saveLog(log: FraudLog): Promise<void> {
  await Storage.setItem(FRAUD_LOG_KEY, JSON.stringify(log));
}

async function addFlag(flag: Omit<FraudFlag, 'id' | 'detectedAt'>): Promise<FraudFlag> {
  const log = await loadLog();
  const newFlag: FraudFlag = {
    ...flag,
    id: `fraud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    detectedAt: Date.now(),
  };
  log.flags = [...log.flags, newFlag];
  log.updatedAt = Date.now();
  await saveLog(log);
  return newFlag;
}

// ── Detection Functions ───────────────────────────────────────────────────────

/**
 * Check if a wallet is mass-claiming (too many registrations in short window).
 * Pass the list of registration timestamps for this wallet.
 */
export async function checkMassClaiming(
  registrationTimestamps: number[],
  walletAddress: string
): Promise<FraudFlag | null> {
  const now = Date.now();
  const recentCount = registrationTimestamps.filter(
    (t) => now - t < MASS_CLAIM_WINDOW_MS
  ).length;

  if (recentCount > MASS_CLAIM_THRESHOLD) {
    return addFlag({
      type: 'mass_claiming',
      severity: 'high',
      description: `${recentCount} claims within 1 hour — possible mass-claiming abuse`,
      walletAddress,
    });
  }
  return null;
}

/**
 * Check for bot-like rapid-fire registration patterns.
 * Timestamps should be sorted ascending.
 */
export async function checkBotPattern(
  registrationTimestamps: number[],
  walletAddress: string
): Promise<FraudFlag | null> {
  if (registrationTimestamps.length < RAPID_CLAIM_COUNT) return null;

  const sorted = [...registrationTimestamps].sort((a, b) => a - b);
  let rapidCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] < RAPID_CLAIM_GAP_MS) {
      rapidCount++;
    } else {
      rapidCount = 0;
    }
    if (rapidCount >= RAPID_CLAIM_COUNT - 1) {
      return addFlag({
        type: 'bot_pattern',
        severity: 'high',
        description: `${RAPID_CLAIM_COUNT}+ claims in under ${RAPID_CLAIM_GAP_MS / 1000}s intervals — possible bot activity`,
        walletAddress,
      });
    }
  }
  return null;
}

/**
 * Check if the same content hash appears more than once (duplicate claim).
 */
export async function checkDuplicateClaim(
  contentHash: string,
  existingHashes: string[]
): Promise<FraudFlag | null> {
  const count = existingHashes.filter((h) => h === contentHash).length;
  if (count > 0) {
    return addFlag({
      type: 'duplicate_content',
      severity: 'medium',
      description: `Content hash ${contentHash.slice(0, 12)}... has been claimed ${count + 1} times`,
      contentHash,
    });
  }
  return null;
}

/**
 * Check for suspiciously high similarity score on a NEW claim (possible copying).
 * If you're registering content that is 90%+ similar to existing content, flag it.
 */
export async function checkSuspiciousSimilarity(
  contentHash: string,
  similarityScore: number
): Promise<FraudFlag | null> {
  if (similarityScore >= 90) {
    return addFlag({
      type: 'suspicious_similarity',
      severity: 'medium',
      description: `New claim shows ${similarityScore}% similarity to existing content — possible plagiarism attempt`,
      contentHash,
    });
  }
  return null;
}

/**
 * Get all fraud flags (optionally filtered by severity).
 */
export async function getFraudFlags(
  severity?: FraudFlag['severity']
): Promise<FraudFlag[]> {
  const log = await loadLog();
  if (!severity) return log.flags;
  return log.flags.filter((f) => f.severity === severity);
}

/**
 * Clear all fraud flags (admin/debug use only).
 */
export async function clearFraudFlags(): Promise<void> {
  await saveLog({ flags: [], updatedAt: Date.now() });
}
