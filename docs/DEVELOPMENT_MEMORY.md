# Development Memory & Standards - NFT Proxy Gamble

**This is the living institutional memory for all AI agents (Claude, Grok, future models) working on this project.**

**Core Directive**: Bug-free code is non-negotiable. We build for real users, real money (via USDC redemption), and regulatory scrutiny. Every line must be defensible in an audit.

---

## 1. Mandatory Process: Think Deeply & Plan Before Any Code

**Rule**: No code is written until a detailed plan exists in the GitHub Issue or PR description.

### Pre-Implementation Checklist (Must Complete in Issue)
Before touching any file:

1. **Deep Analysis** (write 300+ words minimum)
   - Security implications (STRIDE model: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege)
   - Edge cases (0, max values, network partitions, concurrent users, gas spikes)
   - Performance & scalability (gas costs, DB queries under load, mobile battery/CPU)
   - User Experience & Accessibility (error messages, loading states, 18+ age gate)
   - Regulatory & Compliance risks ("Is this still framed as entertainment + collectibles?")
   - Failure modes & blast radius

2. **Implementation Plan** (numbered steps with file paths)
   - Exact files to create/modify
   - Data flow diagram (ASCII or mermaid)
   - State machine / sequence diagram if complex

3. **Test Strategy**
   - Unit tests (what properties to assert)
   - Integration tests (API + contract + DB)
   - E2E (Maestro/Detox flows)
   - Property-based / fuzz tests
   - Negative & adversarial tests

4. **"What Could Go Wrong?" Table**
   | Risk | Likelihood | Impact | Mitigation | Test |
   |------|------------|--------|------------|------|

5. **Documentation Updates Required**
   - Which MD files or ADRs to update

**Only after the Issue has this plan approved (self or Grok review) may implementation begin.**

---

## 2. Structure Output Format Standards (Strict)

All code **must** follow these conventions. PRs violating them will be rejected.

### File-Level
- **Header** (first 10 lines of every source file):
```ts
/**
 * @fileoverview [One-sentence purpose]
 * @module [Folder/Name]
 * @version 0.1.0
 * @lastUpdated 2026-05-22
 * @author Claude (or Grok)
 * @see IMPLEMENTATION_PLAN.md Phase X
 */
```

- **Naming**:
  - TypeScript: `kebab-case.ts` for utils, `PascalCase.tsx` for React components
  - Solidity: `NFTProxyVoucher.sol` (already correct)
  - Folders: `src/services/`, `src/controllers/`, `src/utils/`

### Function / Component Level
Every public function, hook, or component **must** have:

```ts
/**
 * Brief description
 * @param userId - The user's internal ID
 * @param coinAmount - Positive integer > 0
 * @returns Promise<{ tokenId: number; txHash: string }>
 * @throws {InsufficientBalanceError} if user.coinBalance < coinAmount
 * @throws {ContractCallError} on blockchain failure
 * @example
 * await mintVoucher('user_123', 1250)
 */
async function mintVoucher(...) { ... }
```

- **Error Handling**: Never use `any` for errors. Use custom error classes extending `Error` (e.g., `class RedemptionError extends Error {}`).
- **Logging**: Use structured logging with `correlationId` (sessionId or requestId) for traceability.
- **Constants**: All magic numbers/strings → `src/config/constants.ts` or `src/config/economy.ts`
- **Types**: 100% strict TypeScript. `noImplicitAny`, `strictNullChecks`. Document any `as any` with justification.

### Commit & PR Messages
- Conventional Commits: `feat(contracts): add pausable to NFTProxyVoucher`
- PR title: `[Phase 1] Implement mint + redeem with 95% test coverage`

---

## 3. Testing Parameters & Requirements (Non-Negotiable Gates)

### Coverage Thresholds (CI will fail below these)
- **Statements**: ≥ 92%
- **Branches**: ≥ 88%
- **Functions/Methods**: ≥ 95%
- **Lines**: ≥ 92%

### Required Test Types per Phase

**Phase 1 (Contracts)**:
- 20+ Hardhat tests minimum
- Property-based testing (fast-check or hardhat-fuzz) on `coinBalance` math and `redeem`
- Reentrancy test (using `vm.expectRevert` style or hardhat)
- Gas usage benchmarks (< 150k gas for mint, < 80k for redeem)
- Fuzz test with random coin amounts (1 to 1_000_000)

**Phase 2 (Backend)**:
- Jest + ts-jest + Supertest
- Determinism test: Same seeds → identical card sequence 1000x
- Replay attack test on IAP receipts (hash stored + unique constraint)
- Concurrent session test (2 users cashing out same balance simultaneously)
- Full paytable coverage (all 9 hand types + 0 payout)

**Phase 3 (Mobile)**:
- React Native Testing Library (unit + component)
- Maestro or Detox E2E: Complete flow (IAP sandbox → play 5 hands → cashout → view NFT → redeem tx)
- Snapshot tests for UI states
- Accessibility tests (screen reader labels)

**All Phases**:
- Negative tests (invalid input, insufficient funds, wrong role, network error)
- Integration tests across layers (mobile → backend → contract)
- Mutation testing score ≥ 80% on critical paths (future Phase 5+)

### CI Enforcement
`.github/workflows/ci.yml` already runs tests. **Add coverage report upload** in future. PRs without green CI + coverage gate are blocked.

---

## 4. Bug-Free Code Mandate

- "If a bug reaches testnet or production, the responsible phase is rolled back and the agent must re-plan."
- Every bug fix PR **must** include a new test that would have caught it.
- After any incident, add a new row to the "What Could Go Wrong?" table in DEVELOPMENT_MEMORY.md
- Update relevant docs immediately (this file, IMPLEMENTATION_PLAN.md, SECURITY.md, GAME_RULES.md)

---

## 5. AI Agent Memory Rules

- **Claude**: After every phase completion, append a "Phase X Retrospective" section to this file with lessons learned and any doc updates made.
- **Grok**: Will periodically review and refine these standards.
- Never delete history — only append.

**Last Updated**: 2026-05-24 by Claude (Lead Dev)
**Version**: 1.5

---

## Phase 1 Retrospective — ERC-1155 NFTProxyVoucher (Completed 2026-05-23)

**Deployed**: `0xf0d9bD16292A06a189220E4369a561442aEC15Cd` on Polygon Amoy  
**Verified**: https://amoy.polygonscan.com/address/0xf0d9bD16292A06a189220E4369a561442aEC15Cd#code  
**Tests**: 34 passing | Coverage: 100% statements / 97% branches / 100% functions / 100% lines

### Key Decisions Made

- **bytes32 for gameType/sessionId** (not string): saves ~30k gas per mint; backend must use `ethers.encodeBytes32String()`. Zero-byte inputs revert.
- **USDC math**: `coins * 10_000` raw units (not `coins / 100`). The division formula underpays by 10^6. 350 coins → 3.50 USDC exactly.
- **emergencyWithdrawUSDC(amount, to)**: admin-only; emits `EmergencyWithdrawal`. Scoped by amount, not sweep-all.
- **EVM `cancun`**: Required for OZ v5 — `Arrays.sol` uses `mcopy` opcode. Any future contract must keep `evmVersion: "cancun"`.
- **No redeemFor(address)**: deferred to Phase 2 per owner decision.
- **MAX_COIN_BALANCE = 100,000**: on-chain enforced. MIN = 100.

### Bugs Caught Before Mainnet

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| OZ v5 import paths | `security/` → `utils/` for Pausable + ReentrancyGuard | Updated imports |
| USDC underpayment | `coins / 100` = 1 USDC for 100 coins, not 10^4 raw units | `coins * USDC_UNITS_PER_COIN` |
| mcopy compile failure | OZ v5 Arrays.sol needs Cancun EVM | `evmVersion: "cancun"` |
| Coverage gate MODULE_NOT_FOUND | Script read `coverage-summary.json`; solidity-coverage writes `coverage.json` | Fixed file path + regex filter |
| .solcover.js broke coverage | `skipFiles` interacts badly with `paths.sources: "./src"` | Removed .solcover.js entirely |
| CI Windows path separator | `file.includes('/mocks/')` misses `\` | `/[\\/]mocks[\\/]/.test(file)` |
| Etherscan V1 deprecated | hardhat etherscan config used network keys | Switched to V2 API: `https://api.etherscan.io/v2/api?chainid=80002` |

### Testnet Deploy Lessons

- Polygon Amoy faucet has 24h rate limit; Alchemy requires mainnet ETH. **Chainlink faucet** (`faucets.chain.link/polygon-amoy`) is the most permissive — no mainnet ETH needed, gives 0.5 MATIC.
- Amoy minimum gas tip cap is **25 gwei**. Contract deploy costs ~0.12–0.19 MATIC depending on base fee. Fund deployer with **at least 0.3 MATIC** before attempting deploy.
- Polygonscan V2 API verification: use `customChains` in hardhat.config with `apiURL: "https://api.etherscan.io/v2/api?chainid=80002"` and single `apiKey` string (not per-network map).

### What to Watch in Phase 2

- Backend must canonicalize gameType/sessionId to exactly 32 bytes before calling `mint()` — trailing zeros matter.
- MINTER_ROLE grant to hot wallet is the first backend task (scripts/grant-minter.ts).
- Fund contract with test USDC before enabling redemptions.
- The deployer key used for testnet must NEVER be reused for mainnet.

---

## Phase 2 Retrospective — Backend (Completed 2026-05-24)

**Merged**: PR #5 (squash merge) — closed Issue #4
**Tests**: 35 backend tests | Provably fair video poker engine verified

### Key Decisions Made

- **Commit-Reveal RNG (ADR-002)**: `serverSeedHash = SHA-256(serverSeed)` committed at session start; `serverSeed` revealed at draw. Deck = `SHA-256(serverSeed + clientSeed + sessionId)`. Proves fairness post-game.
- **Card encoding**: integer 0–51 where `rank = card % 13`, `suit = floor(card / 13)`. Suits: 0=clubs, 1=diamonds, 2=hearts, 3=spades.
- **IAP receipt uniqueness**: `receipt_hash` stored with `UNIQUE` constraint in DB — replay attack returns 409 before any balance update.
- **Prisma JSON cast**: `session.holds` stored as JSON; must cast `(session.holds as boolean[])` before use in TypeScript.
- **ts-jest moduleNameMapper**: `@/` path aliases require `moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" }` in jest config.
- **Rate limiter skip in tests**: Express `rate-limit` middleware checks `process.env.NODE_ENV !== 'test'`; avoids 429 errors during test runs.

### Bugs Caught Before Mainnet

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Rate limiter blocking tests | `express-rate-limit` applies in test mode by default | Skip when `NODE_ENV === 'test'` |
| Prisma JSON boolean cast | TypeScript infers `session.holds` as `Prisma.JsonValue` | Explicit `as boolean[]` cast |
| ts-jest path alias failure | `@/` imports unresolved in Jest | Add `moduleNameMapper` to jest.config |
| Double-dealing bug | `serverSeed` reused across deal + draw | Derive slot from `SHA-256(serverSeed + clientSeed + sessionId + slotIndex)` |

---

## Phase 3 Progress — Mobile App (In Progress, 2026-05-24)

**Current position**: End of Week 2 — Phases 3.1–3.4 complete, 57 mobile tests

### Branch Stack

| Branch | PR | Status | Content |
|--------|----|--------|---------|
| `phase-3/issue-6-mobile-foundation` | PR #7 | ✅ Merged | Foundation, theme, navigation |
| `phase-3/issue-6-wallet-auth` | PR #8 | ✅ Merged | WalletConnect v2, SIWE, ConnectionStatus |
| `phase-3/issue-6-game-polish-iap` | PR #9 | 🔲 Open (stacked on PR #8) | Video poker polish + IAP UI |

### Architecture Decisions (Phase 3)

- **ConnectionStatus state machine**: `idle → connecting → connected → authenticating → authenticated → error`; retryAuth and switchNetwork exposed from `useWalletConnect` hook
- **`lastAuthAddress` ref**: prevents double-signing on React StrictMode re-renders; only signs if `address !== lastAuthAddress.current`
- **WinOverlay tiers**: `classifyWin(payout, betAmount) → big (≥50×/coin) | medium (≥9×/coin) | small | null`
- **Card deal stagger**: `dealIndex` prop × 80ms with `withDelay(dealIndex * DEAL_STAGGER_MS, withSpring(0))`
- **iapService finishTransaction**: called even on backend verification failure — prevents permanent stuck purchase in OS queue
- **soundService graceful no-op**: `initSounds()` catches missing `.mp3` assets silently; `playSound()` is no-op when sound not loaded
- **Server-authoritative balance**: `gameStore.setBalance` called only from `drawMutation.onSuccess` or `iapApi.verify` response — never computed client-side

### New Files (Phase 3.3 + 3.4)

| File | Purpose |
|------|---------|
| `mobile/src/services/soundService.ts` | expo-av wrapper; 6 keys; graceful no-op |
| `mobile/src/components/Card.tsx` | Updated: `dealIndex` stagger animation |
| `mobile/src/components/PaytableModal.tsx` | 9-hand × 5-bet paytable modal |
| `mobile/src/components/WinOverlay.tsx` | Animated win overlay with tier classification |
| `mobile/src/stores/iapStore.ts` | PurchaseStatus machine, 3 products, history (capped 50) |
| `mobile/src/services/iapService.ts` | react-native-iap integration; receipt forwarding |
| `mobile/src/components/IAPSheet.tsx` | IAP bottom-sheet modal |
| `mobile/src/tests/iapStore.test.ts` | 9 tests |
| `mobile/src/tests/WinOverlay.test.tsx` | 10 tests |
| `mobile/src/tests/PaytableModal.test.tsx` | 6 tests |

### Phase 3.5–3.6 Security Hardening — Architecture Decisions

- **Signed balance token**: `HMAC-SHA256(JWT_SECRET, "nfpg_balance_v1")` as signing key; payload = `"nfpg_balance_v1"|userId|balance|timestamp`; 5-min staleness window on mobile. All 4 balance-touching endpoints sign.
- **`commitPurchase()` gas strategy**: Event-only (no storage writes) = ~25k gas. Sufficient for audit trail; off-chain DB is the gate (UNIQUE receipt hash). On-chain = immutable evidence, not the enforcement layer.
- **RiskLevel as string literals**: Not a Prisma enum in TS, to avoid requiring `prisma generate` before tests. Type defined in `analyticsService.ts` as `"LOW" | "MEDIUM" | "HIGH" | "BLOCKED"`.
- **Cert pinning via OS mechanisms**: iOS `NSPinnedDomains` in `Info.plist` (via `app.config.js`), Android `network_security_config.xml` via Expo config plugin. Avoids native module install/link — works with managed workflow.
- **Device attestation defaults**: `DEVICE_ATTESTATION_ENFORCE=false` in all environments. Shadow mode logs denials but never blocks. Enable via env var after 50+ production samples.
- **Age gate flow**: `POST /auth/verify` returns `ageConfirmed`. `AgeGateModal` rendered in `_layout.tsx` when `isAuthenticated && !ageConfirmed`. Cashout gate returns 403 if not confirmed.
- **Admin auth**: `isAdmin: boolean` in JWT claim. No DB table — must be manually set when minting tokens. To revisit for Phase 4.

### New Files (Phase 3.5–3.7)

| File | Purpose |
|------|---------|
| `backend/src/services/balanceSigning.ts` | HMAC-SHA256 sign/verify for balance tokens |
| `backend/src/services/analyticsService.ts` | 4 anomaly flags, RiskLevel ladder, BLOCKED gate |
| `backend/src/services/deviceAttestationService.ts` | iOS App Attest + Android Play Integrity stubs (shadow) |
| `backend/src/services/purchaseCommitmentService.ts` | On-chain batch commitment (BATCH_SIZE=20, 5min) |
| `backend/src/routes/admin.ts` | `GET /admin/flagged-users`, `POST /admin/users/:id/set-risk` |
| `mobile/src/services/balanceVerification.ts` | Client HMAC verify before display |
| `mobile/src/services/provablyFair.ts` | keccak256 deck verifier (matches backend exactly) |
| `mobile/src/services/nftRedemptionService.ts` | viem `writeContract` for redeem + transfer |
| `mobile/src/services/deviceAttestationService.ts` | Returns shadow attestation headers |
| `mobile/src/components/AgeGateModal.tsx` | Full-screen age gate, calls backend on confirm |
| `mobile/src/components/ProvablyFairModal.tsx` | Seed hash + deck match verification display |
| `mobile/src/components/TransferModal.tsx` | NFT transfer UI + viem writeContract |
| `mobile/app.config.js` | Replaces app.json; cert pin config; EAS extra fields |
| `mobile/plugins/withAndroidCertPinning.js` | Expo config plugin for Android network_security_config |
| `mobile/eas.json` | dev/testnet/production EAS build profiles |
| `mobile/e2e/flows/01-05_*.yaml` | Maestro E2E flows: wallet, IAP, game, adversarial |
| `docs/DEPLOYMENT_RUNBOOK.md` | Prisma migration + contract deploy exact commands |
| `mobile/SECRETS_CHECKLIST.md` | EAS secrets pre-beta gate checklist |
| `docs/CERT_PINNING_ROTATION.md` | SPKI hash generation + rotation runbook |

### Pending Production Checklist (updated 2026-05-24)

- [x] Signed balance token HMAC verification wired in mobile client
- [x] `commitPurchase()` in NFTProxyVoucher.sol with Hardhat tests (T35–T40)
- [x] `purchaseCommitmentService.ts` batching service (8 unit tests)
- [x] Device attestation shadow mode implemented
- [x] Behavioral analytics `UserAnalytics` table + 4 anomaly flags (9 tests)
- [x] Certificate pinning (OS-level, via Expo config plugin)
- [x] Provably fair client verifier (7 unit tests)
- [x] E2E Maestro flows written (5 flows: auth, IAP, game, 2 adversarial)
- [x] Accessibility audit passed — all interactive elements have role + label
- [ ] `prisma db push` on deployed DB (UserAnalytics, User.ageConfirmed, IAPReceipt.onChainTxHash)
- [ ] Re-deploy NFTProxyVoucher.sol to Amoy with `commitPurchase()` — see DEPLOYMENT_RUNBOOK.md
- [ ] Populate EAS secrets — see mobile/SECRETS_CHECKLIST.md
- [ ] Enable `DEVICE_ATTESTATION_ENFORCE=true` after 50+ shadow samples
- [ ] Real Apple/Google IAP receipt validation (backend stub → live API)
- [ ] App Store / Play Store metadata, screenshots, privacy policy URL
- [ ] Jurisdiction block list (US, UK recommended to start)
- [ ] External security audit / penetration testing
