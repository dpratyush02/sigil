/**
 * SIGIL — Certificate builder
 * Produces a full proof artifact for registration.
 */

import { shortHash } from './hash';

export interface CertificateData {
  // Identity
  contentName: string;
  contentType: string;
  ownerWallet: string;

  // On-chain proof
  txHash: string;
  chainId: number;
  chain: string;
  registrationDate: string;

  // IPFS
  ipfsCid: string;
  metadataCid: string;        // same as ipfsCid for now; split if metadata separate

  // Content
  contentHash: string;        // hex SHA-256 of original content
  watermark: string;

  // License
  licenseType: 'none' | 'non-commercial' | 'pay-per-use';
  licensePrice: string;       // '0' or wei string

  // Optional chain data (filled after tx confirms)
  blockTimestamp?: number;    // unix seconds from polygon
  blockNumber?: number;
}

export function buildCertificate(params: {
  contentName: string;
  contentType: string;
  ownerWallet: string;
  txHash: string;
  ipfsCid: string;
  watermark: string;
  contentHash: string;
  terms: 0 | 1 | 2;
  licensePrice?: bigint;
  chainId?: number;
  blockTimestamp?: number;
  blockNumber?: number;
}): CertificateData {
  const licenseMap: Record<0 | 1 | 2, CertificateData['licenseType']> = {
    0: 'none',
    1: 'non-commercial',
    2: 'pay-per-use',
  };

  return {
    contentName: params.contentName,
    contentType: params.contentType,
    ownerWallet: params.ownerWallet,
    registrationDate: new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    txHash: params.txHash,
    chainId: params.chainId ?? 137,
    chain: 'Polygon Mainnet',
    ipfsCid: params.ipfsCid,
    metadataCid: params.ipfsCid,
    contentHash: params.contentHash,
    watermark: params.watermark,
    licenseType: licenseMap[params.terms],
    licensePrice: (params.licensePrice ?? 0n).toString(),
    blockTimestamp: params.blockTimestamp,
    blockNumber: params.blockNumber,
  };
}

export function formatWalletAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function getVerifyUrl(txHash: string): string {
  return `https://polygonscan.com/tx/${txHash}`;
}

/**
 * Build a sharable plain-text evidence summary for Share.share()
 */
export function buildEvidenceText(cert: CertificateData): string {
  return [
    '═══ SIGIL OWNERSHIP CLAIM RECORD ═══',
    '',
    'LEGAL NOTICE: This record documents a timestamped blockchain claim.',
    'It is NOT legal proof of copyright ownership. Consult a qualified',
    'attorney before taking legal action based on this document.',
    '',
    `Asset:         ${cert.contentName}`,
    `Type:          ${cert.contentType}`,
    `Claimant:      ${cert.ownerWallet}`,
    `Claim Date:    ${cert.registrationDate}`,
    '',
    '── On-Chain Proof ──',
    `TX Hash:       ${cert.txHash}`,
    `Chain:         ${cert.chain} (${cert.chainId})`,
    cert.blockNumber ? `Block:         #${cert.blockNumber}` : '',
    cert.blockTimestamp
      ? `Block Time:    ${new Date(cert.blockTimestamp * 1000).toLocaleString()}`
      : '',
    '',
    '── IPFS Metadata ──',
    `Metadata CID:  ${cert.metadataCid}`,
    `IPFS URL:      https://ipfs.io/ipfs/${cert.metadataCid}`,
    '',
    '── Content Identity ──',
    `Content Hash:  ${cert.contentHash}`,
    `Watermark:     ${cert.watermark}`,
    '',
    '── License ──',
    `Terms:         ${cert.licenseType}`,
    cert.licenseType === 'pay-per-use' ? `Price:         ${cert.licensePrice} wei` : '',
    '',
    `Verify on PolygonScan: https://polygonscan.com/tx/${cert.txHash}`,
    `═══════════════════════════════════`,
  ]
    .filter((l) => l !== '')
    .join('\n');
}
