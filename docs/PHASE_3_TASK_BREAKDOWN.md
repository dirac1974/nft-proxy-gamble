# Phase 3 Task Breakdown - Mobile App Development

**Goal**: Build a secure, polished, production-ready mobile casino app for iOS and Android.

**Security First Principle**: All coin balance changes must originate from the backend. The client is untrusted. Every phase embeds security tasks as mandatory deliverables — they are not optional polish.

---

## Phase 3.1: Foundation (Week 1) — ✅ COMPLETE (PR #7, merged)

- [x] Set up Expo project with TypeScript
- [x] Install core dependencies (reanimated, react-query, viem, iap, zustand, secure-store)
- [x] Create folder structure (screens, components, services, hooks, store, theme, utils)
- [x] Implement dark casino theme + design tokens
- [x] Set up navigation (4-tab bottom navigation)
- [x] Configure API client with authentication
- [x] Add secure storage layer (expo-secure-store)
- [x] **[SECURITY - MANDATORY]** JWT stored in `expo-secure-store` only (never AsyncStorage)
- [x] **[SECURITY - MANDATORY]** All API base URLs read from `process.env` — no hardcoded strings

---

## Phase 3.2: Wallet & Authentication (Week 1-2) — ✅ COMPLETE (PR #8, merged)

- [x] Implement WalletConnect v2 integration (viem)
- [x] Add wallet connection screen with QR + deep linking
- [x] Handle connection states, errors, and network switching
- [x] Store connected address securely in expo-secure-store
- [x] Add "Connect Wallet" flow from multiple entry points
- [x] `useWalletConnect` hook with `ConnectionStatus` state machine: `idle → connecting → connected → authenticating → authenticated → error`
- [x] `lastAuthAddress` ref prevents double-signing on StrictMode re-renders
- [x] **[SECURITY - MANDATORY]** SIWE nonce requested from backend per session — nonces are single-use
- [x] **[SECURITY - MANDATORY]** JWT verified on every API call; 401 forces re-auth, not silent failure
- [x] **[SECURITY - MANDATORY]** On-chain purchase commitment: `commitPurchase()` Solidity stub added to `NFTProxyVoucher.sol` (implementation in Phase 3.4)

---

## Phase 3.3: Video Poker Game (Week 2) — ✅ COMPLETE (PR #9, open)

- [x] Card components with staggered deal animation (80ms/position, react-native-reanimated)
- [x] Full state machine: `idle → session_started → dealt → drawn → cashed_out`
- [x] Connect to backend game API (start-session, deal, draw)
- [x] Balance displayed from signed server response only
- [x] Win animations: `WinOverlay` with `big` / `medium` / `small` tier classification
- [x] Sound effects: `expo-av` soundService (deal, hold, win, bigWin, lose, coinDrop)
- [x] Bet selector (1–5 coins)
- [x] Paytable modal (`PaytableModal`) with 9 hands × 5 bet columns
- [x] **[SECURITY - MANDATORY]** Server seed hash committed at session start; revealed on draw (commit-reveal ADR-002)
- [x] **[SECURITY - MANDATORY]** `gameStore.setBalance` called only from `drawMutation.onSuccess` (server response), never computed client-side
- [x] **[SECURITY - MANDATORY]** Signed balance token: backend includes `balanceSig` + `sigTimestamp` on every `/balance` and `/game/draw` response; client verifies with `@noble/hashes` before display

---

## Phase 3.4: Balance & Economy (Week 2-3) — ✅ COMPLETE (PR #9, open)

- [x] Current coin balance fetched and displayed from backend
- [x] IAP purchase flow (`react-native-iap`): `PurchaseStatus` machine `idle → loading → verifying → success | failed`
- [x] 3 coin products: 100 coins ($0.99), 550 coins ($4.99, +10%), 1200 coins ($9.99, +20%)
- [x] IAP receipts forwarded to backend `POST /iap/verify` — balance only set from backend response
- [x] `IAPSheet` bottom-sheet modal with per-product loading indicators
- [x] `finishTransaction({ isConsumable: true })` called even on failure
- [x] **[SECURITY - MANDATORY]** On-chain purchase commitment: backend calls `commitPurchase(address, coinsAdded, receiptHash)` on Polygon before crediting coins in DB
- [x] **[SECURITY - MANDATORY]** Receipt hash stored with UNIQUE constraint — replay attacks rejected with 409
- [x] **[SECURITY - MANDATORY]** Batching service: up to 20 commitments per tx, 5-minute batch window; see `docs/SECURITY_ARCHITECTURE.md` §On-Chain Purchase Commitment

---

## Phase 3.5: NFT Wallet & Redemption (Week 3) — 🔲 PENDING

- [ ] "My NFTs" screen — list owned ERC-1155 vouchers
- [ ] Fetch vouchers from backend + contract (`NFTProxyVoucher.balanceOf`)
- [ ] Display NFT metadata: coin amount, game type, mint date
- [ ] "Redeem to USDC" flow (EIP-712 approve + contract `redeem()`)
- [ ] "Transfer NFT" flow (ERC-1155 `safeTransferFrom`)
- [ ] Show redemption transaction status with Polygonscan link
- [ ] **[SECURITY - MANDATORY]** Device attestation enforced at cashout gate: iOS App Attest + Android Play Integrity (see `docs/SECURITY_ARCHITECTURE.md` §Device Attestation)
- [ ] **[SECURITY - MANDATORY]** Redemption requires `verifyCashoutIntegrity()` — checks on-chain commitment events match claimed balance
- [ ] **[SECURITY - MANDATORY]** Rate limit: ≤ 5 cashouts/wallet/day enforced server-side; client shows remaining

---

## Phase 3.6: Security Hardening Sprint (Week 3-4) — MANDATORY

> **This sprint is not polish — it is a required security gate before any public beta.**

### Signed Balance Token — Full Implementation
- [ ] Backend: derive `SIGNING_KEY = HMAC-SHA256(JWT_SECRET, "nfpg_balance_v1")`
- [ ] Backend: attach `balanceSig` + `sigTimestamp` to ALL balance-touching responses (`/balance`, `/game/draw`, `/iap/verify`, `/game/cashout`)
- [ ] Mobile: verify signature before writing to `gameStore` — reject stale tokens (>60s)
- [ ] Add test: tampered balance returns 400; expired sig returns 401

### On-Chain Commitment — Hardening
- [ ] `commitPurchase()` live on Polygon Amoy testnet (not just stub)
- [ ] `purchaseCommitmentService.ts` batching confirmed working with real receipts
- [ ] `verifyCashoutIntegrity()` tested against 20+ committed purchases

### Certificate Pinning
- [ ] Implement certificate pinning for API calls (react-native-ssl-pinning or OkHttp pin)
- [ ] Test: MITM attempt is rejected

### Behavioral Analytics
- [ ] `user_analytics` table populated on every cashout (win_rate_7d, cashouts_24h, coins_added_1h)
- [ ] Anomaly trigger: win rate >42% → soft flag; coins added >10,000/hr → rate limit; >5 cashouts/day → block
- [ ] Soft block response: 429 with `Retry-After: 3600` header

### E2E Testing
- [ ] Maestro or Detox flow: IAP sandbox → play 5 hands → cashout → view NFT → redeem
- [ ] Adversarial test: forged balance payload rejected
- [ ] Adversarial test: duplicate IAP receipt returns 409

### Accessibility Audit
- [ ] Screen reader pass (VoiceOver + TalkBack)
- [ ] All interactive elements have `accessibilityRole` + `accessibilityLabel`
- [ ] Error states have `accessibilityRole="alert"`

---

## Phase 3.7: Release Preparation (Week 4) — PENDING

- [ ] EAS Build configuration for iOS + Android production
- [ ] App Store / Play Store metadata, screenshots, privacy policy
- [ ] Age gate (18+) with jurisdiction block list
- [ ] Final security audit sign-off (internal checklist + external review prep)
- [ ] Beta testing via TestFlight / Google Internal Testing
- [ ] **[SECURITY - MANDATORY]** All Phase 3.6 hardening tasks confirmed complete before beta invite
- [ ] **[SECURITY - MANDATORY]** Penetration testing prep: export threat model tables from `docs/SECURITY_ARCHITECTURE.md` for external auditor

---

## Security Hardening Summary Table

| Task | Phase | Status |
|------|-------|--------|
| JWT in expo-secure-store | 3.1 | ✅ Done |
| No hardcoded API URLs | 3.1 | ✅ Done |
| SIWE single-use nonce | 3.2 | ✅ Done |
| Commit-reveal RNG (ADR-002) | 3.3 | ✅ Done |
| Server-authoritative balance | 3.3/3.4 | ✅ Done |
| Signed balance token (display) | 3.3/3.4 | ✅ Done (backend spec in SECURITY_ARCHITECTURE.md) |
| On-chain purchase commitment stub | 3.4 | ✅ Spec complete |
| On-chain commitment live on Amoy | 3.6 | 🔲 Pending |
| Signed balance token full impl. | 3.6 | 🔲 Pending |
| Device attestation enforced | 3.5/3.6 | 🔲 Pending |
| Behavioral analytics anomaly triggers | 3.6 | 🔲 Pending |
| Certificate pinning | 3.6 | 🔲 Pending |
| E2E adversarial tests | 3.6 | 🔲 Pending |

**Total Estimated Duration**: 3.5–4 weeks
**Current Position**: End of Week 2 (Phase 3.4 complete)
