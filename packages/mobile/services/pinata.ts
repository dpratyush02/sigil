import axios from 'axios';

const PINATA_API_KEY = process.env.EXPO_PUBLIC_PINATA_API_KEY || '';
const PINATA_SECRET = process.env.EXPO_PUBLIC_PINATA_SECRET || '';
const PINATA_BASE = 'https://api.pinata.cloud';

export interface IPFSMetadata {
  contentHash: string;
  watermarkPattern: string;
  contentName: string;
  contentType: string;
  terms: number;
  ownerWallet: string;
  timestamp: number;
}

export async function uploadToIPFS(metadata: IPFSMetadata): Promise<string> {
  // Mock mode if no API key
  if (!PINATA_API_KEY) {
    return mockIPFSUpload(metadata);
  }

  try {
    const response = await axios.post(
      `${PINATA_BASE}/pinning/pinJSONToIPFS`,
      {
        pinataContent: metadata,
        pinataMetadata: {
          name: `sigil_${metadata.contentHash.slice(0, 8)}`,
        },
      },
      {
        headers: {
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET,
          'Content-Type': 'application/json',
        },
      }
    );
    return `ipfs://${response.data.IpfsHash}`;
  } catch (err) {
    console.warn('IPFS upload failed, using mock:', err);
    return mockIPFSUpload(metadata);
  }
}

function mockIPFSUpload(metadata: IPFSMetadata): string {
  // Generate deterministic mock CID from hash
  const cid = `Qm${metadata.contentHash.slice(0, 44)}`;
  return `ipfs://${cid}`;
}
