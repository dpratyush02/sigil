import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI, POLYGON_RPC, IS_MOCK_MODE } from '../constants/contract';
import { Logger } from '../utils/logger';

// ── Provider (singleton, with RPC timeout) ───────────────────────────────────
let _provider: ethers.JsonRpcProvider | null = null;
const RPC_TIMEOUT_MS = 15_000;

function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(POLYGON_RPC);
  }
  return _provider;
}

/** Wraps an async RPC call with a timeout rejection. */
function withRpcTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`RPC timeout: ${label}`)), RPC_TIMEOUT_MS)
    ),
  ]);
}

export interface RegisterParams {
  contentHash: string;       // 64-char hex from hashContent()
  ipfsLink: string;
  watermarkPattern: string;
  terms: 0 | 1 | 2;
  licensePrice?: bigint;
  signer?: ethers.Signer;
}

/**
 * Register content on-chain.
 * Duplicate guard: checks if content hash is already registered before sending tx.
 */
export async function registerContent(params: RegisterParams): Promise<string> {
  if (IS_MOCK_MODE || !params.signer) {
    Logger.info('blockchain', 'Mock mode — returning mock TX hash');
    return mockTxHash(params.contentHash);
  }

  const hashHex = params.contentHash.startsWith('0x')
    ? params.contentHash
    : `0x${params.contentHash}`;
  const contentHashBytes32 = ethers.zeroPadValue(hashHex, 32);

  // ── Duplicate guard ───────────────────────────────────────────────────────
  try {
    const existing = await withRpcTimeout(
      getRecord(params.contentHash),
      'getRecord (dup check)'
    );
    if (existing && existing.creator !== ethers.ZeroAddress) {
      Logger.warn('blockchain', 'Content already registered on-chain', {
        contentHash: params.contentHash,
        creator: existing.creator,
      });
      throw new Error('Content already registered on this wallet');
    }
  } catch (err: any) {
    if (err.message?.includes('already registered')) throw err;
    // RPC error on dup-check — proceed (fail-open)
    Logger.warn('blockchain', 'Dup check failed — proceeding', { msg: err?.message });
  }

  let licensePrice: bigint;
  if (params.licensePrice !== undefined) {
    licensePrice = params.licensePrice;
  } else if (params.terms === 2) {
    licensePrice = ethers.parseEther('0.01');
  } else {
    licensePrice = BigInt(0);
  }

  Logger.info('blockchain', 'Sending register tx', {
    contentHash: params.contentHash.slice(0, 12),
    licensePrice: licensePrice.toString(),
  });

  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, params.signer);
  const tx = await withRpcTimeout(
    contract.register(contentHashBytes32, licensePrice),
    'contract.register'
  );

  Logger.info('blockchain', 'Tx sent, waiting for receipt', { hash: (tx as any).hash });
  const receipt: any = await withRpcTimeout(tx.wait(), 'tx.wait()');
  if (!receipt) throw new Error('Transaction failed — no receipt');

  Logger.info('blockchain', 'Tx confirmed', { hash: receipt.hash, block: receipt.blockNumber });
  return receipt.hash as string;
}

export interface OnChainRecord {
  creator: string;
  timestamp: bigint;
  licensePrice: bigint;
  earnings: bigint;
}

export async function getRecord(contentHash: string): Promise<OnChainRecord | null> {
  if (IS_MOCK_MODE) return null;
  try {
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, getProvider());
    const hashHex = contentHash.startsWith('0x') ? contentHash : `0x${contentHash}`;
    const bytes32 = ethers.zeroPadValue(hashHex, 32);
    const r = await withRpcTimeout(contract.records(bytes32), 'contract.records');
    if (r.creator === ethers.ZeroAddress) return null;
    return {
      creator: r.creator as string,
      timestamp: BigInt(r.timestamp),
      licensePrice: BigInt(r.licensePrice),
      earnings: BigInt(r.earnings),
    };
  } catch (err: any) {
    Logger.error('blockchain', 'getRecord failed', { msg: err?.message });
    return null;
  }
}

export async function getEarnings(contentHash: string): Promise<bigint> {
  const record = await getRecord(contentHash);
  return record?.earnings ?? BigInt(0);
}

export async function syncAllEarnings(
  contentHashes: string[]
): Promise<Map<string, bigint>> {
  Logger.info('blockchain', `Syncing earnings for ${contentHashes.length} items`);
  const results = await Promise.allSettled(
    contentHashes.map((h) => getEarnings(h))
  );
  const map = new Map<string, bigint>();
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      Logger.warn('blockchain', 'earnings fetch failed', { hash: contentHashes[i], msg: r.reason?.message });
    }
    map.set(contentHashes[i], r.status === 'fulfilled' ? r.value : BigInt(0));
  });
  return map;
}

export async function getOwner(contentHash: string): Promise<string | null> {
  const record = await getRecord(contentHash);
  return record?.creator ?? null;
}

export async function flagMatch(
  contentHash: string,
  _evidence: string,
  _signer?: ethers.Signer
): Promise<string> {
  Logger.info('blockchain', 'flagMatch called (off-chain only)', { contentHash });
  return mockTxHash(contentHash + '_flag');
}

function mockTxHash(seed: string): string {
  const chars = '0123456789abcdef';
  let hash = '0x';
  for (let i = 0; i < 64; i++) {
    hash += chars[(seed.charCodeAt(i % seed.length) + i) % 16];
  }
  return hash;
}
