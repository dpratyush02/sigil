/**
 * SIGIL — Dispute Service
 *
 * Handles the full lifecycle of an ownership dispute:
 *   pending → under_review → resolved | rejected
 *
 * All dispute data is stored locally (AsyncStorage) + optionally IPFS-pinned.
 * No on-chain writes required.
 *
 * Challenge window: 7 days from registration.
 * After 7 days with no active dispute → status upgrades to "uncontested".
 */

import { Storage } from '../utils/storage';

const DISPUTES_KEY = 'sigil_disputes';
const CHALLENGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Types ─────────────────────────────────────────────────────────────────────

export type DisputeStatus =
  | 'pending'       // submitted, awaiting review
  | 'under_review'  // community / moderator reviewing
  | 'resolved'      // dispute upheld — claim challenged successfully
  | 'rejected';     // dispute dismissed — original claim stands

export type ClaimStatus =
  | 'newly_claimed'      // < 7 days, no disputes
  | 'challenge_active'   // dispute is pending or under_review
  | 'uncontested'        // > 7 days, no active disputes
  | 'disputed';          // has a resolved dispute against it

export interface Dispute {
  id: string;
  contentHash: string;
  contentName: string;
  status: DisputeStatus;

  /** Who filed the dispute */
  claimantAddress: string;
  claimantStatement: string;

  /** Evidence / links provided by disputer */
  evidenceUrls: string[];
  evidenceNote: string;

  /** IPFS CID of dispute evidence package (optional) */
  evidenceCid?: string;

  createdAt: number;   // unix ms
  updatedAt: number;   // unix ms
  resolvedAt?: number;

  /** Admin / moderator response (filled when status changes to resolved/rejected) */
  resolution?: string;
}

type DisputeStore = Record<string, Dispute>; // keyed by dispute id

// ── Storage ───────────────────────────────────────────────────────────────────

async function load(): Promise<DisputeStore> {
  try {
    const raw = await Storage.getItem(DISPUTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function save(store: DisputeStore): Promise<void> {
  await Storage.setItem(DISPUTES_KEY, JSON.stringify(store));
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function submitDispute(params: {
  contentHash: string;
  contentName: string;
  claimantAddress: string;
  claimantStatement: string;
  evidenceUrls?: string[];
  evidenceNote?: string;
}): Promise<Dispute> {
  const store = await load();
  const id = `dispute_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();

  const dispute: Dispute = {
    id,
    contentHash: params.contentHash,
    contentName: params.contentName,
    status: 'pending',
    claimantAddress: params.claimantAddress,
    claimantStatement: params.claimantStatement,
    evidenceUrls: params.evidenceUrls ?? [],
    evidenceNote: params.evidenceNote ?? '',
    createdAt: now,
    updatedAt: now,
  };

  store[id] = dispute;
  await save(store);
  return dispute;
}

export async function getDispute(id: string): Promise<Dispute | null> {
  const store = await load();
  return store[id] ?? null;
}

export async function getDisputesForContent(contentHash: string): Promise<Dispute[]> {
  const store = await load();
  return Object.values(store).filter((d) => d.contentHash === contentHash);
}

export async function getAllDisputes(): Promise<Dispute[]> {
  const store = await load();
  return Object.values(store).sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateDisputeStatus(
  id: string,
  status: DisputeStatus,
  resolution?: string
): Promise<Dispute | null> {
  const store = await load();
  if (!store[id]) return null;

  store[id] = {
    ...store[id],
    status,
    resolution,
    updatedAt: Date.now(),
    resolvedAt: status === 'resolved' || status === 'rejected' ? Date.now() : undefined,
  };

  await save(store);
  return store[id];
}

export async function deleteDispute(id: string): Promise<void> {
  const store = await load();
  delete store[id];
  await save(store);
}

// ── Claim Status Logic ────────────────────────────────────────────────────────

/**
 * Compute the ClaimStatus for a registered content item.
 *
 * @param registeredAt  unix ms when the content was registered on-chain
 * @param contentHash   content hash to check disputes against
 */
export async function getClaimStatus(
  contentHash: string,
  registeredAt: number
): Promise<ClaimStatus> {
  const disputes = await getDisputesForContent(contentHash);
  const now = Date.now();

  // Check for active disputes first
  const activeDispute = disputes.find(
    (d) => d.status === 'pending' || d.status === 'under_review'
  );
  if (activeDispute) return 'challenge_active';

  // Check for resolved disputes
  const resolvedDispute = disputes.find((d) => d.status === 'resolved');
  if (resolvedDispute) return 'disputed';

  // Check challenge window
  const windowExpired = now - registeredAt > CHALLENGE_WINDOW_MS;
  if (windowExpired) return 'uncontested';

  return 'newly_claimed';
}

/**
 * How many ms remain in the challenge window. Returns 0 if expired.
 */
export function challengeWindowRemaining(registeredAt: number): number {
  const remaining = CHALLENGE_WINDOW_MS - (Date.now() - registeredAt);
  return Math.max(0, remaining);
}

/**
 * Human-readable time remaining in challenge window.
 */
export function formatChallengeWindow(registeredAt: number): string {
  const ms = challengeWindowRemaining(registeredAt);
  if (ms === 0) return 'Challenge window closed';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h remaining`;
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}
