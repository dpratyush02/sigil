# SIGIL — prompt-4 completion pass

## Status: DONE ✓

## What was built

### 1. Backend (`packages/api/`) — fully scaffolded
- `src/index.ts` — Express server, CORS, morgan, port 3750
- `src/middleware/auth.ts` — wallet-sig nonce → JWT flow (ethers.verifyMessage)
- `src/routes/auth.ts` — POST /api/auth/nonce + POST /api/auth/verify
- `src/routes/scan.ts` — POST /api/scan/submit (202 + jobId), GET /api/scan/:jobId (poll), GET /api/scan/ (list by wallet)
- `src/routes/dispute.ts` — full CRUD: submit, list, queue (admin), resolve (admin), withdraw
- `src/queues/scanQueue.ts` — in-process job queue, max 3 concurrent workers, 2 retries, exponential backoff, 2h TTL
- `src/scanners/` — server-side GitHub, Reddit, HuggingFace, npm, Web, Image scanners
- `src/scanners/image.ts` — proper DCT pHash + dHash server-side (no canvas dependency)

### 2. Mobile scan client (`services/scanClient.ts`)
- Auth: GET nonce → sign → POST verify → store JWT
- Job submission + polling with exponential backoff
- Dispute submission
- isApiReachable() health check

### 3. Scanner orchestrator upgrade (`services/scanner/index.ts`)
- API path: submit job → poll for results → save as SigilAlert
- Client fallback: runs all scanners directly if API unreachable or no token
- New `lastScanMode` in ScanHealth

### 4. pHash + dHash upgrade (`services/scanner/image.ts`)
- Replaced aHash with proper DCT-based pHash (8×8 frequency domain)
- Added dHash (8×7 horizontal gradient)
- Combined score: pHash 60% + dHash 40%
- Threshold lowered to 68% for combined

### 5. Contract abstraction layer (`utils/contractAbstraction.ts`)
- Wraps v1 blockchain calls
- v2 stubs: fileChallenge(), resolveChallenge(), verifyOnChain()
- getContractVersion() → 'v1'

### 6. Admin dispute console (`app/admin/disputes.tsx`)
- Queue view with open/reviewing stats
- Dispute detail with resolve/dismiss/mark-reviewing actions
- Plan gating: canAccessAdmin() guard

### 7. DMCA template expansion (`components/DMCATemplate.tsx`)
- 4 variants: generic, github, cloudflare, hosting
- Variant selector tabs with pro lock UI
- GitHub template includes counter-notice info and copyright@github.com

### 8. Plan gating (`utils/planGating.ts`)
- Free: 3 registrations, 2 scans/day, 50 alerts, generic DMCA only
- Pro: unlimited all
- canRegister(), canScan(), recordScan(), canAccessAdmin(), getAllowedDMCAVariants()

### 9. Register.tsx plan gating integration
- canRegister() check before tx submission
- Alert with upgrade prompt on limit

### 10. Security + copy audit
- URL validation in evidence [id].tsx: only http/https can be openURL'd
- LogDomain extended: scanClient, contract, planGating
- Copy: "Get protected" → "Timestamp your claim"
- Copy: "protected by SIGIL" → "claim is timestamped on the Polygon blockchain"
- Copy: "register ownership" → "record a timestamped claim ... not a legal determination"

## Test results
- Mobile TS: 0 errors
- API TS: 0 errors
- API health: {"ok":true} at :3750
- Auth nonce: working
- Auth protection: 401 on unauthed routes
