# GhostRegistry — Deploy Guide (Remix IDE + Polygon Mumbai)

## Prerequisites

- MetaMask installed with Polygon Mumbai testnet added
- Test MATIC from faucet: https://faucet.polygon.technology/
- Remix IDE: https://remix.ethereum.org

---

## Step 1 — Add Mumbai to MetaMask

| Field            | Value                                    |
|------------------|------------------------------------------|
| Network Name     | Polygon Mumbai                           |
| RPC URL          | `https://rpc-mumbai.maticvigil.com`      |
| Chain ID         | `80001`                                  |
| Currency Symbol  | `MATIC`                                  |
| Block Explorer   | `https://mumbai.polygonscan.com`         |

---

## Step 2 — Load Contract in Remix

1. Open https://remix.ethereum.org
2. Create a new file: `GhostRegistry.sol`
3. Paste the contents of `GhostRegistry.sol` from this repo
4. Solidity compiler tab → select version **0.8.20**
5. Enable **Optimization** (200 runs) → click **Compile GhostRegistry.sol**

---

## Step 3 — Deploy

1. Go to **Deploy & Run Transactions** tab
2. Environment: **Injected Provider - MetaMask**
3. Make sure MetaMask is on **Polygon Mumbai** network
4. Contract: select `GhostRegistry`
5. Click **Deploy** → confirm in MetaMask

---

## Step 4 — Record Contract Address

After deployment, copy the contract address from Remix (under "Deployed Contracts").

Update `packages/mobile/services/blockchain.ts`:

```typescript
const CONTRACT_ADDRESS = '0xYOUR_DEPLOYED_CONTRACT_ADDRESS';
```

Also update `packages/mobile/app.json` if you store it there.

---

## Step 5 — Verify on PolygonScan (Optional)

1. Go to https://mumbai.polygonscan.com
2. Search your contract address
3. Click **Contract** tab → **Verify and Publish**
4. Compiler: Solidity, version `0.8.20`, Optimization: Yes (200 runs)
5. Paste source code → Submit

---

## ABI Reference (Key Functions)

```solidity
// Register a new asset
register(bytes32 contentHash, string ipfsCid, string assetName)

// Check if already registered
isRegistered(bytes32 contentHash) → bool

// Get full registration record
getRegistration(bytes32 contentHash) → Registration

// Get all assets by owner
getAssetsByOwner(address owner) → bytes32[]

// Verify ownership
verify(bytes32 contentHash, address claimedOwner) → bool

// Transfer ownership
transfer(bytes32 contentHash, address newOwner)
```

---

## Events

```solidity
AssetRegistered(bytes32 contentHash, address owner, string ipfsCid, string assetName, uint256 timestamp)
AssetTransferred(bytes32 contentHash, address from, address to)
```

---

## Mainnet (Polygon)

Same steps, but use:
- RPC URL: `https://polygon-rpc.com`
- Chain ID: `137`
- Block Explorer: `https://polygonscan.com`

Use real MATIC for mainnet deployment.
