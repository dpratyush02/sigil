/**
 * SIGIL — Ownership Confidence Scoring
 *
 * Computes a confidence score (0–100) for an ownership CLAIM based on
 * verifiable evidence signals. This is NOT a legal determination.
 *
 * Signals (weighted):
 *  - On-chain registration timestamp vs. content creation date   (30pts)
 *  - IPFS metadata integrity (CID resolvable)                    (20pts)
 *  - Content hash consistency                                     (20pts)
 *  - GitHub commit / publication date prior to registration      (15pts)
 *  - EXIF / file metadata timestamps                             (10pts)
 *  - Provenance chain depth (number of attached sources)          (5pts)
 */

export type ConfidenceLevel = 'Low' | 'Medium' | 'High';

export interface ConfidenceSignals {
  /** Unix ms — when the chain tx was confirmed */
  chainRegisteredAt?: number;
  /** Unix ms — earliest known creation date from EXIF / git / publication */
  earliestCreationDate?: number;
  /** Whether the IPFS CID is resolvable */
  ipfsPinned?: boolean;
  /** Whether the stored content hash matches a re-hash of original */
  contentHashConsistent?: boolean;
  /** Number of provenance sources attached */
  provenanceSourceCount?: number;
  /** Whether we found a GitHub commit dated before registration */
  githubCommitPreDates?: boolean;
  /** Whether EXIF data is present and consistent */
  exifPresent?: boolean;
}

export interface ConfidenceResult {
  score: number;           // 0–100
  level: ConfidenceLevel;
  label: string;           // e.g. "High (87%)"
  breakdown: Record<string, number>; // signal → points awarded
}

export function computeConfidence(signals: ConfidenceSignals): ConfidenceResult {
  const breakdown: Record<string, number> = {};

  // 1. Chain registration timestamp (30pts)
  if (signals.chainRegisteredAt) {
    const hasTimestamp = signals.chainRegisteredAt > 0;
    if (hasTimestamp && signals.earliestCreationDate) {
      // Full points if on-chain registration is at/after creation date (expected)
      const delta = signals.chainRegisteredAt - signals.earliestCreationDate;
      if (delta >= 0) {
        breakdown['chain_timestamp'] = 30;
      } else {
        // Creation date is AFTER registration — suspicious, partial credit
        breakdown['chain_timestamp'] = 15;
      }
    } else if (hasTimestamp) {
      // Registration exists but no creation date to compare against
      breakdown['chain_timestamp'] = 20;
    }
  }

  // 2. IPFS pin (20pts)
  if (signals.ipfsPinned === true) {
    breakdown['ipfs_pinned'] = 20;
  } else if (signals.ipfsPinned === false) {
    breakdown['ipfs_pinned'] = 0;
  }

  // 3. Content hash consistency (20pts)
  if (signals.contentHashConsistent === true) {
    breakdown['content_hash'] = 20;
  } else if (signals.contentHashConsistent === false) {
    breakdown['content_hash'] = 0;
  }

  // 4. GitHub commit pre-dates registration (15pts)
  if (signals.githubCommitPreDates === true) {
    breakdown['github_commit'] = 15;
  } else if (signals.githubCommitPreDates === false) {
    breakdown['github_commit'] = 0;
  }

  // 5. EXIF metadata (10pts)
  if (signals.exifPresent === true) {
    breakdown['exif'] = 10;
  }

  // 6. Provenance sources (5pts)
  const srcCount = signals.provenanceSourceCount ?? 0;
  if (srcCount >= 3) {
    breakdown['provenance_sources'] = 5;
  } else if (srcCount >= 1) {
    breakdown['provenance_sources'] = Math.round((srcCount / 3) * 5);
  }

  const score = Math.min(100, Object.values(breakdown).reduce((s, v) => s + v, 0));
  const level: ConfidenceLevel = score >= 75 ? 'High' : score >= 45 ? 'Medium' : 'Low';

  return {
    score,
    level,
    label: `${level} (${score}%)`,
    breakdown,
  };
}

export function levelColor(level: ConfidenceLevel): string {
  switch (level) {
    case 'High': return '#22C55E';
    case 'Medium': return '#F97316';
    case 'Low': return '#EF4444';
  }
}

export function levelIcon(level: ConfidenceLevel): string {
  switch (level) {
    case 'High': return 'shield-checkmark';
    case 'Medium': return 'shield-half';
    case 'Low': return 'shield-outline';
  }
}
