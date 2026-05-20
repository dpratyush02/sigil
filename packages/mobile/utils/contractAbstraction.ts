/**
 * SIGIL — Contract Abstraction Layer (v1 → v2 compatibility shim)
 *
 * All callers MUST go through this module rather than directly importing
 * from services/blockchain. This lets us add v2 methods, change ABIs,
 * or redirect calls without touching every call site.
 *
 * Contract: 0xf2bF22597e3562253409B57c723dd91ff168D80a (Polygon Mainnet, v1)
 * No redeployment — v2 extension happens here, off-chain where possible.
 */

import { ethers } from 'ethers';
import { registerContent as v1Register, syncAllEarnings as v1SyncEarnings } from '../services/blockchain';
import { Logger } from './logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RegisterParams {
  contentHash: string;
  ipfsLink: string;
  watermarkPattern: string;
  terms: 0 | 1 | 2;
  licensePrice?: bigint;
  signer?: any; // ethers.Signer
}

export interface EarningsSyncResult {
  hash: string;
  earnings: bigint;
}

export interface ChallengeRecord {
  id: string;
  contentHash: string;
  challengerWallet: string;
  reason: string;
  evidence?: string;
  createdAt: number;
  status: 'pending' | 'resolved' | 'dismissed';
}

// ── v1 forwarding ─────────────────────────────────────────────────────────────

/**
 * Register content on-chain.
 * v1: direct contract call via services/blockchain.
 * v2: extend here (e.g. add metadata schema version, emit v2 events).
 */
export async function registerContent(params: RegisterParams): Promise<string> {
  Logger.info('contract', 'registerContent called', {
    hash: params.contentHash.slice(0, 12),
    terms: params.terms,
    contractVersion: 'v1',
  });
  return v1Register(params);
}

/**
 * Sync on-chain earnings for an array of content hashes.
 * v2: may add batch multicall here.
 */
export async function syncEarnings(contentHashes: string[]): Promise<Map<string, bigint>> {
  Logger.info('contract', `syncEarnings for ${contentHashes.length} hashes`, { version: 'v1' });
  return v1SyncEarnings(contentHashes);
}

/**
 * Verify a content hash exists on-chain by tx receipt.
 * Reads Polygon public RPC — no wallet needed.
 */
export async function verifyOnChain(txHash: string): Promise<boolean> {
  try {
    const provider = new ethers.JsonRpcProvider(
      process.env.EXPO_PUBLIC_POLYGON_RPC ?? 'https://polygon-rpc.com'
    );
    const receipt = await provider.getTransactionReceipt(txHash);
    return receipt !== null && receipt.status === 1;
  } catch (err: any) {
    Logger.warn('contract', 'verifyOnChain failed', { msg: err?.message });
    return false;
  }
}

/**
 * v2 stub: file a challenge dispute on-chain.
 * Currently: stores off-chain only, returns a local ID.
 * When v2 contract is deployed, replace body with actual contract call.
 */
export async function fileChallenge(
  contentHash: string,
  reason: string,
  evidence: string,
  wallet: string
): Promise<ChallengeRecord> {
  Logger.info('contract', 'fileChallenge (off-chain stub)', { hash: contentHash.slice(0, 12) });

  const record: ChallengeRecord = {
    id: `challenge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    contentHash,
    challengerWallet: wallet,
    reason,
    evidence,
    createdAt: Date.now(),
    status: 'pending',
  };

  // TODO v2: await contract.fileChallenge(contentHash, reasonHash, { value: bondAmount });
  return record;
}

/**
 * v2 stub: resolve a challenge.
 * Currently no-op. Will call contract.resolveChallenge() when v2 is live.
 */
export async function resolveChallenge(
  challengeId: string,
  resolution: 'resolved' | 'dismissed',
  _adminSigner?: any
): Promise<void> {
  Logger.info('contract', 'resolveChallenge (off-chain stub)', { id: challengeId, resolution });
  // TODO v2: await contract.resolveChallenge(challengeId, resolution === 'resolved');
}

/**
 * Returns current contract version string.
 * Update when v2 is deployed.
 */
export function getContractVersion(): string {
  return 'v1';
}
