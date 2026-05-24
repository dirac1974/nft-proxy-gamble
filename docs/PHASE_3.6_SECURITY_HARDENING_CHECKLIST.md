# Phase 3.6 Security Hardening Checklist

**Purpose**: Gate checklist before any public beta. Every item must be completed or explicitly deferred with a tracked issue. "Deferred" items block production (not beta) launch.

**Owner**: Claude (Lead Dev) + Grok (Security PM)
**Target completion**: End of Week 4

---

## Tier 1 — BLOCKING for Beta

### 1. Signed Balance Token — Backend [DONE ✅]
- [x] `backend/src/services/balanceSigning.ts` — `signBalance(userId, coinBalance)` returns `{ coinBalance, balanceSig, sigTimestamp }`
- [x] Key derivation: `HMAC-SHA256(JWT_SECRET, "nfpg_balance_v1")` — separate from auth key
- [x] `timingSafeEqual` comparison in `verifyBalanceSig` — prevents timing attacks
- [x] All balance-touching endpoints updated: `GET /balance`, `POST /game/draw`, `POST /game/cashout`, `POST /iap/verify-purchase`
- [x] Token expiry: 60 seconds (server-side check via `sigTimestamp`)
- [x] Tests: 8 unit tests covering correct sig, wrong userId, wrong balance, tampered sig, expired token, invalid hex, different secret

### 2. Signed Balance Token — Mobile [DONE ✅]
- [x] `mobile/src/services/balanceVerification.ts` — `verifyAndExtractBalance(response)` validates HMAC before returning balance
- [x] `mobile/src/services/api.ts` — `extractVerifiedBalance()` called on all balance-touching responses; throws if invalid
- [x] `EXPO_PUBLIC_BALANCE_VERIFY_KEY` environment variable (64-char hex) required in production
- [x] `mobile/src/stores/walletStore.ts` — `userId` now stored + persisted in SecureStore (needed for sig payload)
- [x] `mobile/src/services/walletService.ts` — `signAndAuthenticate` passes `userId` to `setJwt(token, userId)`
- [ ] TODO: Write mobile unit tests for `balanceVerification.ts` (mock `EXPO_PUBLIC_BALANCE_VERIFY_KEY`)

### 3. Cashout Rate Limiting [DONE ✅]
- [x] `POST /game/cashout` — counts `CASHOUT_MINT` transactions in current UTC day per user
- [x] Returns `429` with message `Daily cashout limit reached (5/day)` when exceeded
- [x] Integration test: `security.test.ts` — seeds 5 cashouts, verifies 6th returns 429
- [ ] TODO: Add response header `X-Cashout-Remaining: N` so mobile can show remaining quota

### 4. IAP Route Path Consistency [DONE ✅]
- [x] Backend route: `POST /iap/verify-purchase`
- [x] Mobile api.ts: corrected from `/iap/verify` → `/iap/verify-purchase`
- [x] Mobile IAP payload field corrected: `receiptData` (not `receipt`) for Apple path

### 5. IAP Product ID Alignment [DONE ✅]
- [x] Backend `IAP_PRODUCTS` updated: `nfpg.coins.100` (100), `nfpg.coins.550` (550), `nfpg.coins.1200` (1200)
- [x] Legacy product IDs kept for backward compatibility

---

## Tier 2 — BLOCKING for Production

### 6. On-Chain Purchase Commitment — Contract [DONE ✅]
- [x] `contracts/src/NFTProxyVoucher.sol` — `commitPurchase(address user, uint256 coinsAdded, bytes32 receiptHash)` added
- [x] `PurchaseCommitted` event emitted — indexed by `user`
- [x] Gas: ~25,000 per call (event-only, no storage)
- [x] `MINTER_ROLE` required, inputs validated (`user != 0`, `coinsAdded > 0`, `receiptHash != 0`)
- [ ] TODO: Add Hardhat tests for `commitPurchase` (success, role check, zero-address revert)
- [ ] TODO: Deploy updated contract to Polygon Amoy testnet

### 7. On-Chain Purchase Commitment — Backend Service [DONE ✅]
- [x] `backend/src/services/purchaseCommitmentService.ts` — batching service (`BATCH_SIZE=20`, `BATCH_WINDOW_MS=5min`)
- [x] `POST /iap/verify-purchase` — calls `queuePurchaseCommitment()` after coins credited
- [x] `backend/src/services/mintOrchestrator.ts` — `getCommitContract()` exposes contract with `COMMIT_ABI`
- [x] Non-fatal: commitment failure logs error but does not roll back coins (coins already credited + receipt unique)
- [x] `onChainTxHash` stored on `IAPReceipt` record after batch flushes
- [x] `prisma/schema.prisma` — `IAPReceipt.onChainTxHash String?` column added
- [ ] TODO: `prisma db push` / `prisma migrate dev` on deployed DB
- [ ] TODO: Integration test: verify `onChainTxHash` populated after flush (requires Amoy node)

### 8. Certificate Pinning
- [ ] Install `react-native-ssl-pinning` or configure OkHttp pin (Android)
- [ ] Add API hostname + certificate fingerprints to mobile config
- [ ] Test: MITM via mitmproxy fails with cert pin error
- [ ] Fallback strategy: pin rotation procedure for cert expiry

### 9. Device Attestation — Stub to Enforced
- [ ] Install `@react-native-app-attest/DCAppAttestService` (iOS) + `@anush008/react-native-play-integrity` (Android)
- [ ] `backend/src/routes/attestation.ts` — `POST /attestation/verify` route
- [ ] Backend verifies assertion with Apple/Google APIs
- [ ] Enforce at `POST /game/cashout`: reject if `attestation.riskLevel === "high"`
- [ ] Fallback: if Apple/Google attest service unavailable → allow play, require re-attest before cashout
- [ ] Tests: mock high-risk attestation → cashout rejected

### 10. Behavioral Analytics
- [ ] DB: add `user_analytics` table (see `SECURITY_ARCHITECTURE.md` §Behavioral Analytics)
- [ ] Backend: populate `hands_played`, `total_wagered`, `total_won`, `cashouts_today` after each game/cashout
- [ ] Anomaly triggers wired: win_rate > 42% → flag; coins_added_1h > 10,000 → soft block; cashouts_today > 5 → rate limit
- [ ] Admin endpoint: `GET /admin/flagged-users` (requires `ADMIN_ROLE` JWT claim)

---

## Tier 3 — Pre-Launch (App Store Submission)

### 11. Age Gate
- [ ] 18+ confirmation modal on first launch (client-side)
- [ ] Backend: store `ageConfirmed: boolean` per user; refuse cashout if false
- [ ] Jurisdiction block list (high-risk regions per legal review)

### 12. Privacy Policy & Terms
- [ ] Privacy policy URL in app info plist / manifest
- [ ] In-app link to terms of service before first play

### 13. Penetration Testing Prep
- [ ] Export threat model tables from `SECURITY_ARCHITECTURE.md`
- [ ] Document scope: backend API, smart contract, mobile deeplink handling
- [ ] At least one external review of `redeem()` and `commitPurchase()` before mainnet

---

## Schema Changes in This Sprint

```sql
-- Add onChainTxHash to IAPReceipt (nullable — populated after batch commit)
ALTER TABLE "IAPReceipt" ADD COLUMN "onChainTxHash" TEXT;
```

Run: `cd backend && npx prisma db push` (dev) or `npx prisma migrate dev --name add_on_chain_tx_hash` (prod-ready).

---

## Test Coverage Status

| Area | Tests | Status |
|------|-------|--------|
| Balance signing (backend) | 8 unit | ✅ Done |
| Cashout rate limit (backend) | 1 integration | ✅ Done |
| Balance sig in draw/cashout responses | 4 integration | ✅ Done |
| Auth security (401 cases) | 2 integration | ✅ Done |
| IAP replay prevention | 1 integration | ✅ Done |
| `commitPurchase` (contract) | 0 | 🔲 TODO |
| `purchaseCommitmentService` (unit) | 0 | 🔲 TODO |
| `balanceVerification.ts` (mobile) | 0 | 🔲 TODO |
| Certificate pinning | 0 | 🔲 TODO (Phase 3.6 end) |
| Device attestation | 0 | 🔲 TODO (Phase 3.6 end) |

**Total new tests in this sprint**: 16 (8 unit + 8 integration)
