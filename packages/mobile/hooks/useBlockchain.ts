import { useState, useCallback } from 'react';
import { registerContent as registerOnChain, syncAllEarnings } from '../services/blockchain';
import { uploadToIPFS } from '../services/pinata';
import { generateWatermark } from '../utils/watermark';
import { hashContent } from '../utils/hash';
import { buildCertificate, CertificateData } from '../utils/certificate';
import { Storage } from '../utils/storage';
import { Logger } from '../utils/logger';

const CONTENT_KEY = 'sigil_content';

export interface RegisteredContent {
  id: string;
  contentName: string;
  contentType: string;
  contentHash: string;
  watermarkPattern: string;
  ipfsCid: string;
  txHash: string;
  terms: 0 | 1 | 2;
  licensePrice: string;     // stringified bigint (wei)
  registeredAt: number;
  matchCount: number;
  earnings: string;         // stringified bigint (wei) — synced from chain
}

export interface RegisterInput {
  contentName: string;
  contentType: string;
  rawContent: string;
  isFile: boolean;
  terms: 0 | 1 | 2;
  licensePrice?: bigint;    // wei — set when terms===2
  walletAddress: string;
  signer?: any;             // ethers.Signer
}

export function useBlockchain() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = useCallback(async (
    input: RegisterInput
  ): Promise<{ certificate: CertificateData; content: RegisteredContent } | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const contentHash = await hashContent(input.rawContent, input.isFile);
      const watermarkPattern = generateWatermark(contentHash);

      Logger.info('blockchain', 'Uploading metadata to IPFS', { contentHash });
      const ipfsLink = await uploadToIPFS({
        contentHash,
        watermarkPattern,
        contentName: input.contentName,
        contentType: input.contentType,
        terms: input.terms,
        ownerWallet: input.walletAddress,
        timestamp: Date.now(),
      });
      Logger.info('blockchain', 'IPFS upload complete', { ipfsLink });

      Logger.info('blockchain', 'Registering on-chain', { contentHash });
      const txHash = await registerOnChain({
        contentHash,
        ipfsLink,
        watermarkPattern,
        terms: input.terms,
        licensePrice: input.licensePrice,
        signer: input.signer,
      });
      Logger.info('blockchain', 'Registration TX confirmed', { txHash });

      const ipfsCid = ipfsLink.replace('ipfs://', '');

      const certificate = buildCertificate({
        contentName: input.contentName,
        contentType: input.contentType,
        ownerWallet: input.walletAddress,
        txHash,
        ipfsCid,
        watermark: watermarkPattern,
        contentHash,
        terms: input.terms,
        licensePrice: input.licensePrice,
      });

      const content: RegisteredContent = {
        id: contentHash.slice(0, 16),
        contentName: input.contentName,
        contentType: input.contentType,
        contentHash,
        watermarkPattern,
        ipfsCid,
        txHash,
        terms: input.terms,
        licensePrice: (input.licensePrice ?? BigInt(0)).toString(),
        registeredAt: Date.now(),
        matchCount: 0,
        earnings: '0',
      };

      const existing = await getStoredContent();
      await Storage.setItem(CONTENT_KEY, JSON.stringify([content, ...existing]));

      return { certificate, content };
    } catch (err: any) {
      Logger.error('blockchain', 'Registration failed', { msg: err?.message });
      setError(err?.message || 'Registration failed');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Pull on-chain earnings for all stored content and update local storage.
   * Returns updated content array.
   */
  const syncEarnings = useCallback(async (): Promise<RegisteredContent[]> => {
    const all = await getStoredContent();
    if (all.length === 0) return [];

    const hashes = all.map((c) => c.contentHash);
    Logger.info('blockchain', `Syncing earnings for ${hashes.length} items`);
    const earningsMap = await syncAllEarnings(hashes);

    const updated = all.map((c) => ({
      ...c,
      earnings: (earningsMap.get(c.contentHash) ?? BigInt(0)).toString(),
    }));

    await Storage.setItem(CONTENT_KEY, JSON.stringify(updated));
    return updated;
  }, []);

  return { register, syncEarnings, isLoading, error };
}

/** Returns only content the user has actually registered. No mock data. */
export async function getStoredContent(): Promise<RegisteredContent[]> {
  try {
    const raw = await Storage.getItem(CONTENT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RegisteredContent[];
  } catch {
    return [];
  }
}

/** Increment match count for a given content id */
export async function incrementMatchCount(contentId: string): Promise<void> {
  try {
    const all = await getStoredContent();
    const updated = all.map((c) =>
      c.id === contentId ? { ...c, matchCount: c.matchCount + 1 } : c
    );
    await Storage.setItem(CONTENT_KEY, JSON.stringify(updated));
  } catch {}
}
