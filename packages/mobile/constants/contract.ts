// SIGIL — GhostRegistry Smart Contract config

export const CONTRACT_ADDRESS =
  process.env.EXPO_PUBLIC_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';

export const POLYGON_RPC =
  process.env.EXPO_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com';

export const CHAIN_ID = 137;
export const CHAIN_NAME = 'Polygon Mainnet';
export const NATIVE_CURRENCY = { name: 'POL', symbol: 'POL', decimals: 18 };
export const BLOCK_EXPLORER = 'https://polygonscan.com';

export const WALLETCONNECT_PROJECT_ID =
  process.env.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

export const IS_MOCK_MODE =
  !CONTRACT_ADDRESS ||
  CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000';

// ─── GhostRegistry ABI ──────────────────────────────────────────────────────
export const CONTRACT_ABI = [
  // register(bytes32 contentHash, uint256 licensePrice)
  {
    inputs: [
      { internalType: 'bytes32', name: 'contentHash',  type: 'bytes32' },
      { internalType: 'uint256', name: 'licensePrice', type: 'uint256' },
    ],
    name: 'register',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // buyLicense(bytes32 contentHash) payable
  {
    inputs: [{ internalType: 'bytes32', name: 'contentHash', type: 'bytes32' }],
    name: 'buyLicense',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  // withdraw(bytes32 contentHash)
  {
    inputs: [{ internalType: 'bytes32', name: 'contentHash', type: 'bytes32' }],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // records(bytes32) view => (creator, timestamp, licensePrice, earnings)
  {
    inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    name: 'records',
    outputs: [
      { internalType: 'address', name: 'creator',      type: 'address' },
      { internalType: 'uint256', name: 'timestamp',    type: 'uint256' },
      { internalType: 'uint256', name: 'licensePrice', type: 'uint256' },
      { internalType: 'uint256', name: 'earnings',     type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // events
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: 'bytes32', name: 'contentHash', type: 'bytes32' },
      { indexed: true,  internalType: 'address', name: 'creator',     type: 'address' },
    ],
    name: 'Registered',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: 'bytes32', name: 'contentHash', type: 'bytes32' },
      { indexed: true,  internalType: 'address', name: 'buyer',       type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amount',      type: 'uint256' },
    ],
    name: 'Licensed',
    type: 'event',
  },
] as const;
