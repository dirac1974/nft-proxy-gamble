# Security Architecture — NFT Proxy Gamble Platform

**Critical Principle**: This platform handles real money. The highest priority is preventing unauthorized coin creation and fraudulent cashouts. When in doubt, the backend wins. The client is untrusted.

**Last Updated**: 2026-05-24 (Claude, Lead Dev — Grok-requested expansion)

---

## Table of Contents

1. [Threat Model](#threat-model)
2. [Core Security Layers](#core-security-layers)
3. [API Contract: Balance Updates](#api-contract-balance-updates)
4. [Signed Balance Token Specification](#signed-balance-token-specification)
5. [Per-Feature Threat Models](#per-feature-threat-models)
6. [Device Attestation Plan](#device-attestation-plan)
7. [Behavioral Analytics & Anomaly Detection](#behavioral-analytics--anomaly-detection)
8. [On-Chain Purchase Commitment](#on-chain-purchase-commitment)
9. [Monitoring & Incident Response](#monitoring--incident-response)

---

## Threat Model

### 1. Client-Side Coin Spoofing (CRITICAL — Highest Risk)
- **Attack**: Modified app (Frida, jailbreak, Charles Proxy, custom client) injects fake coin balance or purchase events
- **Impact**: Cash out fake coins → redeem real USDC → direct financial loss
- **Mitigations**:
  - All balance mutations originate exclusively on backend — never client
  - Every balance API response is HMAC-signed; client displays only if signature valid
  - `gameStore.setBalance` called only from verified API responses (never from game logic)
  - On-chain purchase commitment events create immutable audit trail
  - Device attestation (Phase 3.6) detects rooted/jailbroken devices

### 2. IAP Receipt Replay / Forgery
- **Attack**: Reuse a valid receipt to credit coins multiple times; forge receipts
- **Impact**: Unlimited free coins → USDC drain
- **Mitigations**:
  - Server-side receipt validation via Apple/Google HTTPS APIs (never trust receipt content alone)
  - `SHA-256(receipt)` stored in `iap_receipts` table with `UNIQUE` constraint
  - Any second insertion of same hash → `409 Conflict` → coins not credited
  - On-chain `PurchaseCommitted` event emitted after DB credit — replay would fail at DB unique constraint before reaching chain

### 3. Video Poker Card/Result Manipulation
- **Attack**: Intercept game API responses, modify card values or payout amounts, replay winning sessions
- **Impact**: Unlimited coins via fake Royal Flushes
- **Mitigations**:
  - Commit-reveal RNG: `serverSeedHash` committed at session start; `serverSeed` revealed only at draw
  - Client cannot predict or alter the deck — it was determined before deal
  - Payout calculation runs entirely on backend from final drawn cards; client-reported result is ignored
  - `sessionId` is UUID, single-use, marked `completed` on draw — cannot replay
  - `betAmount` validated against user's current balance before session creation

### 4. Backend Compromise
- **Attack**: Attacker gains backend access and mints coins or NFTs arbitrarily
- **Impact**: Unlimited USDC drain
- **Mitigations**:
  - MINTER_ROLE held by a separate hot wallet with minimal MATIC balance
  - Multi-sig required for production minter wallet (Gnosis Safe)
  - Immutable structured audit log of every `coinBalance` change with `correlationId`
  - Anomaly detection alerts on unusual mint patterns

### 5. Smart Contract Attacks
- **Attack**: Reentrancy on `redeem()`, unauthorized `mint()`, USDC drain via `emergencyWithdraw`
- **Impact**: User funds stolen, NFT double-spent
- **Mitigations**:
  - `ReentrancyGuard` on `redeem()` — burn-before-transfer pattern
  - Only `MINTER_ROLE` can call `mint()` — hot wallet address, rotatable
  - `emergencyWithdrawUSDC(amount, to)` is admin-only, scoped by amount, emits `EmergencyWithdrawal`
  - OpenZeppelin v5 audited libraries throughout
  - `Pausable` — contract can be halted within 1 block of incident detection

### 6. NFT Double-Redeem / Front-Running
- **Attack**: Submit two redeem transactions in the same block; MEV bot front-runs redemption to steal USDC
- **Impact**: USDC stolen or NFT burned with no payout
- **Mitigations**:
  - ERC-1155 `_burn()` is atomic — balance drops to 0 before USDC transfer; any re-entry hits 0-balance check
  - USDC price is fixed (no oracle) — front-running gains nothing; the payout is deterministic
  - `msg.sender` must own the token; cannot be called on behalf of another address

---

## Core Security Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 0: Device                                                     │
│  - App Attest / Play Integrity (Phase 3.6)                         │
│  - Certificate pinning (Phase 3.6)                                 │
│  - Jailbreak/root detection (Phase 3.6)                            │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTPS + cert pin
┌────────────────────────────▼────────────────────────────────────────┐
│ Layer 1: Purchase (IAP)                                             │
│  Client → Apple/Google → receipt → backend HTTPS verify            │
│  Backend: SHA-256(receipt) → DB unique constraint                  │
│  Backend: credits balance atomically in DB                         │
│  Backend: emits PurchaseCommitted event on Polygon (async/batched) │
│  Backend: returns signed balance response                          │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│ Layer 2: Game Play                                                  │
│  All sessions are server-authoritative                             │
│  Client sends moves; server validates + returns signed results     │
│  Commit-reveal provably fair RNG; payout on backend only           │
│  sessionId: UUID, one-time use                                     │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│ Layer 3: Cashout to NFT                                             │
│  Backend verifies session integrity + DB balance ≥ 100             │
│  Backend calls contract.mint() via MINTER_ROLE hot wallet          │
│  DB balance set to 0 atomically before mint tx sent                │
│  NFT coinBalance immutably on-chain                                │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│ Layer 4: Redemption (On-Chain)                                      │
│  User calls redeem() directly from self-custodial wallet           │
│  Contract: burn NFT → transfer USDC atomically (ReentrancyGuard)   │
│  Backend listens for Redeemed events (analytics only)              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## API Contract: Balance Updates

All endpoints that modify or return `coinBalance` **must** include a signed balance token in their response. The client **must** validate the signature before displaying or acting on the balance. Any response without a valid signature is rejected.

### GET /balance

```typescript
// Request
// Headers: Authorization: Bearer <jwt>

// Response 200
{
  coinBalance: number,          // integer ≥ 0
  balanceSig: string,           // HMAC-SHA256 hex — see Signed Balance Token spec
  sigTimestamp: number          // Unix seconds — token expires after 60s
}
```

### POST /game/start-session

```typescript
// Request
{ betAmount: 1 | 2 | 3 | 4 | 5 }

// Response 200
{
  sessionId: string,            // UUID
  serverSeedHash: string,       // SHA-256(serverSeed) — commitment
  clientSeed: string            // random 16-byte hex from backend
  // Note: no balance in response — balance deducted on deal, not start
}
```

### POST /game/draw

```typescript
// Request
{ sessionId: string, holds: [boolean, boolean, boolean, boolean, boolean] }

// Response 200
{
  drawnCards: number[],         // array of 5 card indices 0-51
  rank: string,                 // e.g. "Full House"
  payout: number,               // coins won (0 if loss)
  serverSeed: string,           // revealed — client can verify RNG fairness
  newBalance: number,           // authoritative post-draw balance
  balanceSig: string,           // HMAC-SHA256 of newBalance
  sigTimestamp: number
}
```

### POST /iap/verify

```typescript
// Request
{ platform: "apple" | "google", receipt: string }

// Response 200
{
  coinsAdded: number,           // coins credited for this purchase
  newBalance: number,           // authoritative post-purchase balance
  balanceSig: string,           // HMAC-SHA256 of newBalance
  sigTimestamp: number,
  onChainTxHash: string | null  // Polygon tx hash of PurchaseCommitted event (null if batched/pending)
}
```

### POST /game/cashout

```typescript
// Request
{ sessionId: string, coinsToCashout: number }

// Response 200
{
  voucherId: string,            // internal DB ID
  mintTxHash: string,           // Polygon mint transaction hash
  tokenId: number,              // ERC-1155 token ID
  newBalance: number,           // = 0 after cashout
  balanceSig: string,
  sigTimestamp: number
}
```

**Client-side rule**: If `balanceSig` is absent or fails verification → display cached balance and surface an error. Never act on an unsigned balance.

---

## Signed Balance Token Specification

### Key Derivation

```
SIGNING_KEY = HMAC-SHA256(JWT_SECRET, "nfpg_balance_v1")
```

Use a separate derived key — not the JWT auth secret — so a balance token cannot be mistaken for a JWT.

### Payload

```
payload = "<userId>:<coinBalance>:<sigTimestamp>"
```

Example: `"usr_abc123:1500:1716570000"`

### Signature

```
balanceSig = HMAC-SHA256(SIGNING_KEY, payload).hex()
```

### Verification (Client — TypeScript)

```typescript
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

function verifyBalanceSig(
  userId: string,
  coinBalance: number,
  sigTimestamp: number,
  balanceSig: string,
  signingKey: Uint8Array   // derived from JWT_SECRET at backend; baked into build as env var
): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (now - sigTimestamp > 60) return false;          // expired

  const payload = `${userId}:${coinBalance}:${sigTimestamp}`;
  const expected = bytesToHex(
    hmac(sha256, signingKey, new TextEncoder().encode(payload))
  );
  return expected === balanceSig;
}
```

### Security Properties
- Tokens expire after **60 seconds** — prevents replay of old balances
- Separate key prevents JWT confusion attacks
- `userId` binds the token to a specific account — cannot be transferred between users
- Client only reads the public balance display key via `EXPO_PUBLIC_BALANCE_VERIFY_KEY` — never the signing secret

---

## Per-Feature Threat Models

### Video Poker

| Attack | Vector | Mitigation | Test |
|--------|--------|------------|------|
| Card manipulation | Modify API response to claim Royal Flush | Payout calc on backend from actual drawn cards; client result display only | `gameStore.test.ts`: `setResult` takes `newBalance` from server |
| Bet spoofing | Send `betAmount: 0` or negative | Backend validates `1 ≤ betAmount ≤ 5` and `balance ≥ betAmount` at `start-session` | Integration: `POST /game/start-session` with `betAmount: 0` → 400 |
| Hold manipulation | Send forged `holds` array | Server draws replacement cards for non-held positions using server-generated deck; payout is deterministic from the drawn cards, not from client's claimed holds | Server re-runs draw from its RNG state regardless of hold validity |
| Session replay | Reuse a completed `sessionId` | `sessionId` marked `status: "completed"` on draw; duplicate draw → 409 | Integration: double-draw test |
| Parallel sessions | Open multiple sessions simultaneously | Enforce max 1 active session per user in DB (unique constraint on `userId` + `status: active`) | Integration: parallel start-session test |
| RNG prediction | Predict deck from `serverSeedHash` | Pre-image resistance of SHA-256; `serverSeed` is 32 random bytes — 2^256 search space | Property test: 1000 sessions, verify no seed repeats |

### NFT Redemption

| Attack | Vector | Mitigation | Test |
|--------|--------|------------|------|
| Double-redeem | Call `redeem()` twice in same block | `ReentrancyGuard` + burn-before-transfer; second call hits balance = 0 | Hardhat: reentrancy attack contract test |
| Unauthorized redeem | Call `redeem(tokenId)` for token owned by another | `balanceOf(msg.sender, tokenId) ≥ 1` check in contract | Hardhat: unauthorized redeem → revert |
| Front-running | MEV bot front-runs redemption to steal USDC | USDC price is fixed; front-runner gains nothing — user's `msg.sender` receives the USDC | N/A — no oracle dependency |
| Griefing via dust NFT | Spam tiny NFTs to DoS the backend listener | `MIN_COIN_BALANCE = 100` enforced in contract mint; sub-threshold NFTs cannot be minted | Hardhat: mint below minimum → revert |
| Replay after refund | Apple refunds IAP → coins already spent on NFT | Refund webhook (Phase 3.6) flags account; retroactive balance adjustment limited to unspent coins | Webhook integration test |

### IAP (In-App Purchase)

| Attack | Vector | Mitigation | Test |
|--------|--------|------------|------|
| Receipt replay | Reuse same receipt on same or different account | `SHA-256(receipt)` unique constraint in DB; second attempt → 409, no coins | Integration: duplicate receipt → 409 |
| Receipt forgery | Craft a fake Apple/Google receipt | Server validates against Apple/Google HTTPS APIs, not local parsing; forged receipts fail sig check | Mock Apple API returning failure → no coins |
| Cross-account replay | Use another user's receipt | Apple/Google bind receipts to their account; backend verifies `originalTransactionId` is not already used | Integration: cross-user receipt test |
| Refund abuse | Purchase → redeem NFT → refund → keep USDC | Minimum 5-min delay between purchase and cashout (Phase 3.6); refund webhook retro-flags account | Webhook test: refund after cashout |
| Receipt interception | MITM to capture receipt before backend | Certificate pinning (Phase 3.6); receipt only travels over HTTPS with pinned cert | N/A until cert pinning implemented |
| Cross-device exploit | Use iOS receipt on Android path | `platform` parameter validated; Apple receipts go to Apple API, Google to Google Play API | Unit: platform mismatch → 400 |

---

## Device Attestation Plan

### Goal
Detect rooted/jailbroken devices and emulators before allowing cashouts.

### Phase 3.6 Implementation

**iOS — Apple App Attest**
```typescript
// mobile/src/services/attestationService.ts
import DCAppAttestService from "@react-native-app-attest/DCAppAttestService";

export async function getAttestationToken(): Promise<string | null> {
  try {
    const supported = await DCAppAttestService.isSupported();
    if (!supported) return null;           // simulator / old iOS — soft fail
    const keyId = await DCAppAttestService.generateKey();
    const challenge = await fetchChallengeFromBackend();
    const attestation = await DCAppAttestService.attestKey(keyId, challenge);
    return attestation;
  } catch {
    return null;
  }
}
```

**Android — Google Play Integrity API**
```typescript
export async function getPlayIntegrityToken(nonce: string): Promise<string | null> {
  try {
    const { PlayIntegrity } = await import("@anush008/react-native-play-integrity");
    return await PlayIntegrity.requestIntegrityToken(nonce);
  } catch {
    return null;
  }
}
```

**Backend Verification**
```typescript
// POST /attestation/verify
// Body: { token: string, platform: "ios" | "android", nonce: string }
// Verifies with Apple/Google APIs; stores result in user record
// Response: { trusted: boolean, riskLevel: "low" | "medium" | "high" }
```

### Enforcement Policy

| Phase | Behaviour |
|-------|-----------|
| 3.1–3.5 | Stub endpoint returns `{ trusted: true }` — no enforcement |
| 3.6 | Attestation required at first launch; re-attested daily |
| Production | `riskLevel: "high"` → block cashout; log event; flag for manual review |
| All phases | Attestation failure is **never** a hard block for play — only for cashout |

### Fallback
If attestation service is unavailable (no network, Apple/Google outage), fall back to "trusted" for play but require re-attestation before next cashout attempt. Never silently assume untrusted.

---

## Behavioral Analytics & Anomaly Detection

### Metrics Tracked Per User (Backend, stored in `user_analytics` table)

```sql
CREATE TABLE user_analytics (
  user_id         VARCHAR(36) PRIMARY KEY,
  hands_played    INT DEFAULT 0,
  total_wagered   INT DEFAULT 0,
  total_won       INT DEFAULT 0,
  win_rate_30d    DECIMAL(5,4),        -- rolling 30-day win rate
  cashouts_today  INT DEFAULT 0,
  last_cashout_at TIMESTAMP,
  coins_added_1h  INT DEFAULT 0,       -- coins added in last 60 min
  coins_added_24h INT DEFAULT 0,       -- coins added in last 24 h
  flagged         BOOLEAN DEFAULT FALSE,
  flag_reason     TEXT
);
```

### Anomaly Triggers (Auto-Flag)

| Condition | Threshold | Response |
|-----------|-----------|----------|
| Win rate (50+ hands) | > 42% sustained | Flag + manual review |
| Coins added in 1 hour | > 10,000 | Soft block cashout + alert |
| Cashouts per day | > 5 | Rate-limit cashout to 1 per 4 hours |
| Balance increase without IAP event | Any amount > 0 | Hard block + alert (should be impossible) |
| Duplicate purchase within 5 min | Same productId | Flag |
| Session created < 5 min after large purchase | Purchase > 1,000 coins | Require attestation re-check |

### Alert Channels
- Structured log entry with `severity: "SECURITY_ALERT"` on every trigger
- Future: Slack/PagerDuty webhook for `severity: "SECURITY_ALERT"`

### Response Ladder

1. **Soft flag**: record `flag_reason`; analytics visible to admin; no user impact
2. **Rate limit**: cashout limited to 1 per 4 hours
3. **Soft block**: cashout blocked; user sees "Account under review — contact support"
4. **Hard block**: all game actions blocked; requires manual admin review

---

## On-Chain Purchase Commitment

See `docs/IAP_BLOCKCHAIN_ANCHORING_DESIGN.md` for full design rationale. This section specifies the exact implementation.

### Smart Contract Addition (Phase 3.5)

Add to `NFTProxyVoucher.sol`:

```solidity
event PurchaseCommitted(
    address indexed user,
    uint256 coinsAdded,
    bytes32 receiptHash,    // SHA-256(original receipt string) — off-chain binding
    uint256 timestamp
);

/// @notice Called by backend after successful IAP validation
/// @dev MINTER_ROLE only; emits event only (no storage — gas optimized)
function commitPurchase(
    address user,
    uint256 coinsAdded,
    bytes32 receiptHash
) external onlyRole(MINTER_ROLE) {
    emit PurchaseCommitted(user, coinsAdded, receiptHash, block.timestamp);
}
```

### Gas Estimates (Polygon Amoy / Mainnet)

| Operation | Gas | Cost at 100 Gwei | Cost at 200 Gwei |
|-----------|-----|-------------------|-------------------|
| Single `commitPurchase` | ~25,000 gas | ~$0.0025 | ~$0.005 |
| Batch of 20 purchases | ~35,000 gas total | ~$0.00175/purchase | ~$0.0035/purchase |
| `mint()` (cashout) | ~85,000 gas | ~$0.0085 | ~$0.017 |

*Costs in USD at MATIC = $1.00. At $0.50 MATIC: halve above.*

### Batching Strategy

```typescript
// backend/src/services/purchaseCommitmentService.ts

const BATCH_SIZE = 20;
const BATCH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

interface PendingCommitment {
  user: Address;
  coinsAdded: number;
  receiptHash: `0x${string}`;
  iapRecordId: string;
}

let pendingBatch: PendingCommitment[] = [];
let batchTimer: NodeJS.Timeout | null = null;

export async function queuePurchaseCommitment(c: PendingCommitment): Promise<void> {
  pendingBatch.push(c);
  if (pendingBatch.length >= BATCH_SIZE) {
    await flushBatch();
  } else if (!batchTimer) {
    batchTimer = setTimeout(flushBatch, BATCH_WINDOW_MS);
  }
}

async function flushBatch(): Promise<void> {
  if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }
  const batch = pendingBatch.splice(0);
  if (batch.length === 0) return;

  // Call commitPurchase for each in a single multicall or sequentially
  for (const c of batch) {
    const tx = await contract.commitPurchase(c.user, c.coinsAdded, c.receiptHash);
    await updateIAPRecord(c.iapRecordId, tx.hash);
  }
}
```

### Cashout Verification Enhancement

When a cashout request arrives, the backend should optionally verify the user has on-chain purchase commitment events covering their current balance (for large cashouts):

```typescript
// Soft check: warn if on-chain commits don't cover balance
// Hard check (Phase 3.6): block cashout if gap is > 10,000 coins and no commits
async function verifyCashoutIntegrity(userId: string, amount: number): Promise<boolean> {
  if (amount < 1000) return true;  // skip check for small cashouts
  const onChainCommits = await getOnChainCommits(userId);
  const totalCommitted = onChainCommits.reduce((s, c) => s + c.coinsAdded, 0);
  const dbPurchases = await getTotalIAPCoins(userId);
  // Allow 10% tolerance for timing gap
  return totalCommitted >= dbPurchases * 0.9;
}
```

---

## Monitoring & Incident Response

### Real-Time Monitoring (Phase 3.6+)

```
ALERT: large_redemption        — any single redeem > 10,000 coins
ALERT: rapid_cashout_sequence  — 3+ cashouts within 10 minutes from same wallet
ALERT: balance_without_purchase — coinBalance > 0 with 0 IAP records (should be impossible)
ALERT: mint_without_cashout    — NFT minted without corresponding DB cashout record
```

### Emergency Controls

- **Contract pause**: `contract.pause()` via admin wallet — halts `mint()` and `redeem()` within 1 block
- **Backend disable**: env flag `CASHOUT_ENABLED=false` — returns 503 on `/game/cashout`
- **User soft-block**: set `users.blocked = true` — blocks all game + cashout actions for that user

### Incident Response Playbook

1. **Detect**: anomaly alert fires or user reports
2. **Contain**: pause contract + set `CASHOUT_ENABLED=false`
3. **Assess**: query DB for affected users, correlate with on-chain events
4. **Mitigate**: block affected wallets, revoke MINTER_ROLE if hot wallet compromised, rotate to backup wallet
5. **Resume**: re-enable with `CASHOUT_ENABLED=true` after root cause confirmed
6. **Post-mortem**: add new row to threat model table; add regression test

**Golden Rule**: If in doubt, the backend wins. The client is untrusted.
