/**
 * SIGIL — Provenance Storage
 *
 * Stores verifiable provenance signals attached to a registered content item.
 * All data is local + optionally IPFS-pinned. No on-chain writes.
 *
 * Provenance sources:
 *  - GitHub repo (commit sha + date)
 *  - Web publication (URL + discovered date)
 *  - EXIF metadata (creation/modification timestamps)
 *  - IPFS CID snapshot
 *  - Manual note (user-provided statement)
 */

import { Storage } from './storage';

const PROV_KEY = 'sigil_provenance';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProvenanceSourceType =
  | 'github_commit'
  | 'web_publication'
  | 'exif_metadata'
  | 'ipfs_snapshot'
  | 'manual_note';

export interface ProvenanceSource {
  id: string;
  type: ProvenanceSourceType;
  label: string;
  url?: string;
  timestamp?: number;   // unix ms — when the source was created (not added)
  addedAt: number;      // unix ms — when user attached this
  metadata?: Record<string, string>;
}

export interface ProvenanceRecord {
  contentHash: string;
  sources: ProvenanceSource[];
  updatedAt: number;
}

type ProvenanceStore = Record<string, ProvenanceRecord>; // keyed by contentHash

// ── Storage helpers ───────────────────────────────────────────────────────────

async function load(): Promise<ProvenanceStore> {
  try {
    const raw = await Storage.getItem(PROV_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function save(store: ProvenanceStore): Promise<void> {
  await Storage.setItem(PROV_KEY, JSON.stringify(store));
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getProvenance(contentHash: string): Promise<ProvenanceRecord | null> {
  const store = await load();
  return store[contentHash] ?? null;
}

export async function addProvenanceSource(
  contentHash: string,
  source: Omit<ProvenanceSource, 'id' | 'addedAt'>
): Promise<ProvenanceRecord> {
  const store = await load();
  const existing = store[contentHash] ?? { contentHash, sources: [], updatedAt: 0 };

  const newSource: ProvenanceSource = {
    ...source,
    id: `prov_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    addedAt: Date.now(),
  };

  existing.sources = [...existing.sources, newSource];
  existing.updatedAt = Date.now();
  store[contentHash] = existing;
  await save(store);
  return existing;
}

export async function removeProvenanceSource(
  contentHash: string,
  sourceId: string
): Promise<void> {
  const store = await load();
  if (!store[contentHash]) return;
  store[contentHash].sources = store[contentHash].sources.filter((s) => s.id !== sourceId);
  store[contentHash].updatedAt = Date.now();
  await save(store);
}

export async function getEarliestTimestamp(contentHash: string): Promise<number | undefined> {
  const record = await getProvenance(contentHash);
  if (!record || record.sources.length === 0) return undefined;
  const timestamps = record.sources
    .map((s) => s.timestamp)
    .filter((t): t is number => typeof t === 'number' && t > 0);
  return timestamps.length > 0 ? Math.min(...timestamps) : undefined;
}

export function provenanceTypeLabel(type: ProvenanceSourceType): string {
  switch (type) {
    case 'github_commit': return 'GitHub Commit';
    case 'web_publication': return 'Web Publication';
    case 'exif_metadata': return 'EXIF Metadata';
    case 'ipfs_snapshot': return 'IPFS Snapshot';
    case 'manual_note': return 'Statement';
  }
}

export function provenanceTypeIcon(type: ProvenanceSourceType): string {
  switch (type) {
    case 'github_commit': return 'git-commit-outline';
    case 'web_publication': return 'globe-outline';
    case 'exif_metadata': return 'camera-outline';
    case 'ipfs_snapshot': return 'cloud-outline';
    case 'manual_note': return 'pencil-outline';
  }
}
