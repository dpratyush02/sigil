/**
 * SIGIL — Scan API client
 *
 * Submits scan jobs to the SIGIL backend API.
 * Falls back to direct client-side scanning if the API is unreachable.
 *
 * API URL: EXPO_PUBLIC_SIGIL_API_URL (e.g. https://api.sigil.app)
 *          Defaults to http://localhost:3750 for local dev.
 *
 * Auth: wallet-signed JWT (stored in Storage after first auth).
 */

import axios from 'axios';
import Constants from 'expo-constants';
import { Storage } from '../utils/storage';
import { Logger } from '../utils/logger';

// Fallback chain: env var → app.json extra.apiUrl → '' (offline/client-side mode)
const API_BASE: string = (
  (typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_SIGIL_API_URL : undefined)
  || (Constants.expoConfig?.extra?.apiUrl as string | undefined)
  || ''
).replace(/\/$/, ''); // strip trailing slash

const TOKEN_KEY = 'sigil_api_token';
const TOKEN_WALLET_KEY = 'sigil_api_wallet';

// ── Token management ─────────────────────────────────────────────────────────

export async function getStoredToken(): Promise<string | null> {
  return Storage.getItem(TOKEN_KEY);
}

export async function saveToken(token: string, wallet: string): Promise<void> {
  await Storage.setItem(TOKEN_KEY, token);
  await Storage.setItem(TOKEN_WALLET_KEY, wallet);
}

export async function clearToken(): Promise<void> {
  await Storage.removeItem(TOKEN_KEY);
  await Storage.removeItem(TOKEN_WALLET_KEY);
}

// ── Wallet auth ───────────────────────────────────────────────────────────────

/**
 * Perform wallet-signature auth and store JWT.
 * `signer` must be an ethers.Signer with a `signMessage` method.
 */
export async function authenticateWallet(wallet: string, signer: any): Promise<string | null> {
  try {
    // Step 1: Get nonce
    const nonceRes = await axios.post(`${API_BASE}/api/auth/nonce`, { address: wallet }, { timeout: 8000 });
    const { nonce, message } = nonceRes.data as { nonce: string; message: string };

    // Step 2: Sign message
    const signature = await signer.signMessage(message);

    // Step 3: Verify + get token
    const verifyRes = await axios.post(`${API_BASE}/api/auth/verify`, { address: wallet, nonce, signature }, { timeout: 8000 });
    const { token } = verifyRes.data as { token: string };
    await saveToken(token, wallet);
    Logger.info('scanClient', 'Authenticated with API', { wallet: wallet.slice(0, 10) });
    return token;
  } catch (err: any) {
    Logger.warn('scanClient', 'API auth failed', { msg: err?.message });
    return null;
  }
}

// ── Auth header helper ────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await getStoredToken();
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

// ── Job submission ────────────────────────────────────────────────────────────

export interface SubmitScanInput {
  contentHash: string;
  contentName: string;
  contentType: string;
  watermarkPattern: string;
  rawContent?: string;
}

export interface ScanJobSummary {
  jobId: string;
  status: string;
  createdAt: number;
}

export async function submitScanJob(input: SubmitScanInput): Promise<ScanJobSummary | null> {
  const headers = await authHeaders();
  if (!headers) {
    Logger.warn('scanClient', 'No auth token — cannot submit job to API');
    return null;
  }

  try {
    const res = await axios.post(
      `${API_BASE}/api/scan/submit`,
      {
        contentHash: input.contentHash,
        contentName: input.contentName,
        contentType: input.contentType,
        watermarkPattern: input.watermarkPattern,
        rawContent: input.rawContent,
      },
      { headers, timeout: 10000 }
    );
    Logger.info('scanClient', 'Scan job submitted', { jobId: res.data.jobId });
    return res.data as ScanJobSummary;
  } catch (err: any) {
    Logger.error('scanClient', 'Job submission failed', { msg: err?.message });
    return null;
  }
}

// ── Job polling ───────────────────────────────────────────────────────────────

export interface ScanJobResult {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  matches: Array<{
    source: string;
    url: string;
    title: string;
    confidence: number;
    detectedAt: number;
    alertId: string;
  }>;
  error?: string;
  completedAt?: number;
}

/**
 * Poll for job completion.
 * maxWait: total seconds to wait (default 120s)
 * interval: polling interval ms (default 4s)
 */
export async function pollScanJob(
  jobId: string,
  maxWait = 120,
  interval = 4000
): Promise<ScanJobResult | null> {
  const headers = await authHeaders();
  if (!headers) return null;

  const deadline = Date.now() + maxWait * 1000;
  let backoff = interval;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, backoff));
    backoff = Math.min(backoff * 1.3, 10000); // cap at 10s

    try {
      const res = await axios.get(`${API_BASE}/api/scan/${jobId}`, { headers, timeout: 8000 });
      const job = res.data as ScanJobResult;
      Logger.debug('scanClient', `Poll: job ${jobId} status=${job.status}`);
      if (job.status === 'completed' || job.status === 'failed') {
        return job;
      }
    } catch (err: any) {
      Logger.warn('scanClient', 'Poll request failed', { msg: err?.message });
    }
  }

  Logger.warn('scanClient', `Job ${jobId} did not complete within ${maxWait}s`);
  return null;
}

// ── Dispute submission ────────────────────────────────────────────────────────

export interface SubmitDisputeInput {
  alertId: string;
  contentHash: string;
  reason: string;
  evidence?: string;
}

export async function submitDispute(input: SubmitDisputeInput): Promise<{ disputeId: string } | null> {
  const headers = await authHeaders();
  if (!headers) {
    Logger.warn('scanClient', 'No auth token — cannot submit dispute');
    return null;
  }

  try {
    const res = await axios.post(`${API_BASE}/api/disputes/submit`, input, { headers, timeout: 8000 });
    Logger.info('scanClient', 'Dispute submitted', { disputeId: res.data.disputeId });
    return res.data as { disputeId: string };
  } catch (err: any) {
    Logger.error('scanClient', 'Dispute submission failed', { msg: err?.message });
    return null;
  }
}

// ── Health check ──────────────────────────────────────────────────────────────

/** Returns true if the backend API is reachable */
export async function isApiReachable(): Promise<boolean> {
  try {
    const res = await axios.get(`${API_BASE}/api/health`, { timeout: 4000 });
    return res.data?.ok === true;
  } catch {
    return false;
  }
}
