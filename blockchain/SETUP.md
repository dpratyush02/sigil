# SIGIL — Full Setup Guide

Complete step-by-step to go from zero to a fully working app with real blockchain, IPFS, wallet, and GitHub scanning.

---

## STEP 1 — Pinata (IPFS storage)

1. Go to **https://pinata.cloud** → Sign up (free)
2. After login → click **API Keys** in the left sidebar
3. Click **New Key** → toggle on `pinJSONToIPFS` → name it `sigil` → Create
4. Copy the **API Key** and **API Secret** — you'll need both

---

## STEP 2 — GitHub Token (for scanning)

1. Go to **https://github.com/settings/tokens**
2. Click **Generate new token (classic)**
3. Name it `sigil-scanner`
4. Check only: `public_repo` (under repo section)
5. Set expiry to **No expiration** or 1 year
6. Click **Generate token** → copy it immediately (shown once)

---

## STEP 3 — Alchemy RPC (blockchain reads)

1. Go to **https://alchemy.com** → Sign up (free)
2. Click **Create new app**
3. Choose **Chain: Polygon** → **Network: Polygon Amoy** (Mumbai is deprecated, Amoy is the new testnet)
   - Or **Polygon Mainnet** if you want production
4. Click **Create** → go to the app → click **API Key**
5. Copy the **HTTPS** URL — looks like:
   `https://polygon-amoy.g.alchemy.com/v2/your-key-here`

---

## STEP 4 — WalletConnect Project ID

1. Go to **https://cloud.walletconnect.com** → Sign up
2. Click **Create Project**
3. Name: `SIGIL` → Type: `App` → Create
4. Copy the **Project ID** from the dashboard

---

## STEP 5 — Deploy the Smart Contract

### Install Remix (browser-based, no install needed)
1. Go to **https://remix.ethereum.org**
2. In the file explorer (left panel) → click the `+` icon → name it `GhostRegistry.sol`
3. Paste the full contents of `blockchain/GhostRegistry.sol` (this repo)
4. Click the **Solidity compiler** tab (left sidebar, looks like `<S>`)
   - Compiler version: `0.8.19`
   - Click **Compile GhostRegistry.sol**
5. Click the **Deploy & Run** tab (looks like Ethereum logo)
   - Environment: **Injected Provider - MetaMask**
   - This will connect MetaMask — make sure it's on **Polygon Amoy** network
   - Click **Deploy** → confirm in MetaMask
6. After deployment — in the **Deployed Contracts** section at the bottom, copy the contract address (looks like `0x...`)

### Add Polygon Amoy to MetaMask (if not already there)
- Network Name: `Polygon Amoy`
- RPC URL: `https://rpc-amoy.polygon.technology`
- Chain ID: `80002`
- Symbol: `MATIC`
- Get free test MATIC from: **https://faucet.polygon.technology**

---

## STEP 6 — Add all keys to the app

Once you have everything above, go back to the app and enter:

| Key | Where you got it |
|-----|-----------------|
| Pinata API Key | Step 1 |
| Pinata Secret | Step 1 |
| GitHub Token | Step 2 |
| Alchemy RPC URL | Step 3 |
| WalletConnect Project ID | Step 4 |
| Contract Address | Step 5 |

---

## Network Summary

| | Testnet (recommended to start) | Mainnet (production) |
|-|-------------------------------|---------------------|
| Network | Polygon Amoy | Polygon Mainnet |
| Chain ID | 80002 | 137 |
| MATIC cost | Free (faucet) | Real money |
| Alchemy | polygon-amoy | polygon-mainnet |
