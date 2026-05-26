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

## Phase 3.5: NFT Wallet & Redemption (Week 3) — ✅ COMPLETE (on phase-3/security-hardening)

- [x] "My NFTs" screen — list owned ERC-1155 vouchers (`nfts.tsx`)
- [x] Fetch vouchers from backend (`nftApi.list()`)
- [x] Display NFT metadata: coin amount, game type, mint date, PENDING/MINTING/MINTED/FAILED badge
- [x] "Redeem to USDC" flow (`nftRedemptionService.redeemVoucher()` via viem `writeContract`)
- [x] "Transfer NFT" flow (`TransferModal.tsx` + `nftRedemptionService.transferVoucher()`)
- [x] Show mint + redemption transaction status with Polygonscan link
- [x] Auto-refresh every 30s via `refetchInterval`
- [x] **[SECURITY - MANDATORY]** Device attestation at cashout gate (shadow mode; enforce via `DEVICE_ATTESTATION_ENFORCE=true`)
- [x] **[SECURITY - MANDATORY]** Rate limit: ≤ 5 cashouts/wallet/day + `X-Cashout-Remaining` header

---

## Phase 3.6: Security Hardening Sprint (Week 3-4) — ✅ COMPLETE (on phase-3/security-hardening)

> **This sprint is not polish — it is a required security gate before any public beta.**
> See `docs/PHASE_3.6_SECURITY_HARDENING_CHECKLIST.md` for full item-by-item status.

### Signed Balance Token — Full Implementation [DONE ✅]
- [x] Backend: `balanceSigning.ts` — `HMAC-SHA256(JWT_SECRET, "nfpg_balance_v1")` signing key
- [x] All balance-touching endpoints: `/balance`, `/game/draw`, `/game/cashout`, `/iap/verify-purchase`
- [x] Mobile: `balanceVerification.ts` rejects tampered/expired sigs
- [x] 8 unit tests + 9 integration tests

### On-Chain Commitment [DONE ✅]
- [x] `commitPurchase()` in `NFTProxyVoucher.sol` — T35-T40 passing
- [x] `purchaseCommitmentService.ts` — BATCH_SIZE=20, BATCH_WINDOW=5min, 8 unit tests
- [x] Graceful shutdown via `flushPendingCommitments()` on SIGTERM/SIGINT

### Certificate Pinning [DONE ✅]
- [x] OS-level: iOS `NSPinnedDomains`, Android `network_security_config.xml` via Expo config plugin
- [x] `docs/CERT_PINNING_ROTATION.md` — rotation runbook

### Behavioral Analytics [DONE ✅]
- [x] `UserAnalytics` table, `analyticsService.ts`, 4 anomaly flags, BLOCKED gate at cashout
- [x] 9 unit tests
- [x] Admin endpoint: `GET /admin/flagged-users`, `POST /admin/users/:id/set-risk`

### Age Gate [DONE ✅]
- [x] `POST /auth/confirm-age` backend; `User.ageConfirmed` field; 403 at cashout if not confirmed
- [x] `AgeGateModal.tsx` shown to all authenticated users until confirmed

### Device Attestation [DONE — shadow mode ✅, enforce pending]
- [x] `deviceAttestationService.ts` (backend + mobile); shadow mode logs, never blocks
- [x] `DEVICE_ATTESTATION_ENFORCE` flag; enable after 50+ shadow samples

### E2E Testing [✅ FLOWS WRITTEN — execution needs device]
- [x] Maestro flows in `mobile/e2e/flows/`:
  - `01_wallet_connect.yaml` — wallet connect → SIWE sign → age gate → lobby
  - `02_iap_purchase.yaml` — IAP sandbox purchase + cancellation adversarial path
  - `03_game_play_cashout.yaml` — 5 hands → provably fair modal → cashout → NFT tab
  - `04_adversarial_balance.yaml` — forged `balanceSig` payload rejected by client
  - `05_duplicate_iap_rejected.yaml` — replay returns 409, balance not double-credited
- [x] Suite config: `mobile/e2e/.maestro.yaml`
- [ ] Run on real device (deferred — needs EAS dev build deployed to device)

### Accessibility Audit [✅ CODE PASS COMPLETE — device pass pending]
- [x] All interactive `Pressable`s in user-facing tree have `accessibilityRole` + `accessibilityLabel` (audit run 2026-05-25, 3 gaps closed)
- [x] Error / alert containers have `accessibilityRole="alert"` (NetworkBanner, WinOverlay, IAPSheet status banner, error banners)
- [x] Modals have `accessibilityViewIsModal`
- [x] Toggleable elements (bet chips) have `accessibilityState.selected`
- [ ] Manual VoiceOver pass on iOS device (deferred — needs device)
- [ ] Manual TalkBack pass on Android emulator (deferred — needs running emulator build)

---

## Phase 3.7: Release Preparation (Week 4) — 🚀 IN PROGRESS

- [x] EAS Build configuration for iOS + Android production (`mobile/eas.json` — dev/testnet/production profiles)
- [x] `mobile/env.eas.example` — EAS secrets reference
- [x] `backend/env.production.example` — backend production env reference
- [x] Age gate (18+) with confirmation modal + backend enforcement
- [ ] App Store / Play Store metadata, screenshots, privacy policy URL
- [x] Jurisdiction block list — `backend/src/middleware/jurisdictionBlock.ts` gates `/game/cashout` + `/iap/verify-purchase` via CF-IPCountry / X-Vercel-IP-Country headers; 10 countries blocked at launch; 16 unit tests cover the matrix
- [x] Final security audit sign-off (internal) — `docs/SECURITY_AUDIT_2026-05-25.md` (4 bugs found and fixed during audit); external prep in `docs/THREAT_MODEL_FOR_PENTEST.md`
- [ ] Beta testing via TestFlight / Google Internal Testing
- [x] **[SECURITY - MANDATORY]** Schema applied to Supabase (UserAnalytics + User.ageConfirmed + IAPReceipt.onChainTxHash) — project `yzodntgnaydfkqvibmff`, all 6 tables live
- [ ] **[SECURITY - MANDATORY]** Populate EAS secrets: `CERT_PIN_PRIMARY`, `CERT_PIN_BACKUP`, `EXPO_PUBLIC_BALANCE_VERIFY_KEY` (locally derived BALANCE_VERIFY_KEY is in mobile/.env; certs need real production hash values)
- [x] **[SECURITY - MANDATORY]** All Phase 3.6 hardening tasks confirmed (HMAC tokens, on-chain commits, attestation shadow, analytics, age gate, cert pinning config)
- [x] **[SECURITY - MANDATORY]** Penetration testing prep: threat model exported to `docs/THREAT_MODEL_FOR_PENTEST.md` (self-contained brief for external auditor)

---

## Security Hardening Summary Table

| Task | Phase | Status |
|------|-------|--------|
| JWT in expo-secure-store | 3.1 | ✅ Done |
| No hardcoded API URLs | 3.1 | ✅ Done |
| SIWE single-use nonce | 3.2 | ✅ Done |
| Commit-reveal RNG (ADR-002) | 3.3 | ✅ Done |
| Server-authoritative balance | 3.3/3.4 | ✅ Done |
| Signed balance token (display) | 3.3/3.4 | ✅ Done — backend + mobile HMAC verification |
| On-chain purchase commitment stub | 3.4 | ✅ Done — `commitPurchase()` + batching service |
| On-chain commitment live on Amoy | 3.6 | 🔲 Pending (deploy updated contract) |
| Signed balance token full impl. | 3.6 | ✅ Done — backend + mobile |
| Device attestation enforced | 3.5/3.6 | 🟡 Shadow mode (enable via DEVICE_ATTESTATION_ENFORCE=true) |
| Behavioral analytics anomaly triggers | 3.6 | ✅ Done — 4 flags, BLOCKED gate |
| Age gate 18+ | 3.6 | ✅ Done — modal + backend |
| Certificate pinning | 3.6 | ✅ Done — OS-level (needs real fingerprints in EAS) |
| Provably fair client verifier | 3.5 | ✅ Done — `ProvablyFairModal` + `provablyFair.ts` |
| E2E adversarial tests | 3.6 | 🔲 Pending (Maestro/Detox) |

**Total Estimated Duration**: 3.5–4 weeks
**Current Position**: Phase 3.7 in progress — all Phases 3.5 + 3.6 complete on `phase-3/security-hardening` branch
