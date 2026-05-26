# Test Coverage Report

**Date**: 2026-05-26
**Main HEAD**: `81504ff`
**Source**: Run locally via `npm test --coverage` on each workspace.

---

## Summary

| Workspace | Test Suites | Tests | Status |
|---|---:|---:|---|
| `contracts/` (Hardhat) | 6 | **40 / 40 passing** | ✅ |
| `backend/` unit (Jest) | 6 | **81 / 81 passing** | ✅ |
| `mobile/` (jest-expo) | 11 | **81 / 81 passing** | ✅ |
| **Total** | 23 | **202 / 202** | ✅ |

Backend integration tests (`tests/integration/*`) are excluded from CI/local default runs because `setupTestDb()` calls `prisma db push --force-reset` which would wipe the connected Supabase. They are expected to run only against a dedicated local Postgres / preview branch.

---

## Backend coverage (jest --coverage)

```
Statements   : 89.78% ( 246/274 )
Branches     : 78.26% (  72/91  )
Functions    : 87.80% (  36/41  )
Lines        : 90.79% ( 217/239 )
```

| File | Statements | Branches | Functions | Lines | Uncovered notes |
|---|---:|---:|---:|---:|---|
| `services/analyticsService.ts` | 100% | 88.88% | 100% | 100% | Branches at 88% — the else-fallback for `winRate > THRESHOLD` when `handsLastHour < 20` |
| `services/balanceSigning.ts` | 100% | 75% | 100% | 100% | The `??` fallback `config.JWT_SECRET` only fires when `process.env.JWT_SECRET` is unset — not exercised in tests because tests set the env var |
| `services/mintOrchestrator.ts` | 89.74% | 50% | 100% | 89.74% | The `catch {}` in the parseLog loop (lines 87-89) is exercised by the "logs[0]=TransferSingle, logs[1]=VoucherMinted" test but coverage tool counts it as a branch miss for the no-throw path |
| `services/purchaseCommitmentService.ts` | 94.87% | 100% | 71.42% | 97.22% | Function coverage at 71% — the `_resetForTest` test helper plus the timer-driven `setTimeout(flushBatch)` callback aren't counted as covered until they fire in a test |
| `services/videoPoker.ts` | 98.83% | 100% | 100% | 98.43% | One uncovered line is a defensive branch in `evaluateHand` for a 5-card path we never feed |
| `services/iapVerifier.ts` | covered via 10 tests | — | — | — | Apple verifier path calls external HTTP (skipped per `LIGHTWEIGHT_SECURITY_AUDIT_TEMPLATE.md` Section 3 — integration test only); Google verifier dev/test branch + prototype-pollution defense (B-4) covered |

**Branch threshold is set to 80% in jest config; we sit at 78.26%.** Remaining gaps are error-path `catch` blocks that require an integration test against a real DB or a real network failure to exercise. Acceptable for the current phase — documented as deferred.

---

## Mobile coverage (jest-expo)

```
Statements   : 64.74% ( 191/295 )
Branches     : 69.40% (  93/134 )
Functions    : 57.44% (  54/94  )
Lines        : 64.09% ( 166/259 )
```

Mobile coverage is structurally lower because most React Native components are not unit-tested — they require a device or simulator to exercise the layout, navigation, animation, and wallet-connection flows. The tested portions:

| Area | Tests | Notes |
|---|---:|---|
| `services/balanceVerification` (HMAC) | 6 | 3 brittle mock-setup tests are documented in audit; logic is sound |
| `services/walletService` (decodeCard + helpers) | 10 | Including card-21 edge case (B-2 era discovery) |
| `services/provablyFair` (keccak deck reimplementation) | 3 | Verifies it matches backend deterministically |
| `stores/walletStore` (zustand state machine) | 14 | connectionStatus transitions, JWT lifecycle |
| `stores/gameStore` (game phase + balance) | 7 | All phases reachable |
| `stores/iapStore` | 7 | Status + history + products |
| `components/Card` | 8 | Rank/suit decode, hold toggle, accessibility |
| `components/WinOverlay` | 9 | Tier-based rendering, BIG WIN label, a11y role |
| `components/NetworkBanner` | 5 | Mismatch + error-derived show states |
| `tests/nftRedemption` | 12 | `polygonscanUrl` + redemption helpers |

Untested-by-unit-test (covered by Maestro E2E instead — see below):
- Screens: `(tabs)/index.tsx`, `play.tsx`, `nfts.tsx`, `profile.tsx`
- Modals: `AgeGateModal`, `ConnectWalletSheet`, `IAPSheet`, `PaytableModal`, `ProvablyFairModal`, `TransferModal`
- Hooks: `useWalletConnect` (requires WalletConnect provider mock)
- IAP flow integration (`services/iapService`)

This is the appropriate split — React Native unit testing of navigation + layout is brittle and high-maintenance; Maestro flows on device give better signal.

---

## Maestro E2E flows

5 flow files in `mobile/e2e/flows/`, suite config at `mobile/e2e/.maestro.yaml`:

| Flow | Tags | Covers |
|---|---|---|
| `01_wallet_connect.yaml` | auth, critical | Connect → SIWE sign → age gate → lobby |
| `02_iap_purchase.yaml` | iap | Sandbox purchase + adversarial cancel-mid-flow |
| `03_game_play_cashout.yaml` | game, critical | 5-hand loop → provably-fair modal → cashout → NFT tab |
| `04_adversarial_balance.yaml` | security, adversarial | Forged `balanceSig` rejected by client |
| `05_duplicate_iap_rejected.yaml` | security, adversarial | Receipt replay returns 409, balance not double-credited |

### testID coverage for Maestro

Audited 2026-05-26: every `id: "..."` reference in any flow file resolves to a real `testID` in the source.

| Flow reference | Source location | Status |
|---|---|---|
| `id: "balance-display"` (04) | `BalanceDisplay.tsx` View, container | ✅ added in commit `fbce5df` |
| `id: "card-0"` (03) | `Card.tsx` Pressable via `testID={\`card-${i}\`}` from `play.tsx:151` | ✅ added in commit `0ddbf01` |

Pre-2026-05-26, both references existed in flows but had no corresponding `testID` in the source — Maestro runs would have failed on the first hold-card step or the adversarial balance assertion. Now resolved.

### Status of flow execution

- **Code-level**: all 5 flows have correct testIDs and matchers. They can be loaded into Maestro without "element not found" errors.
- **Device-level**: not yet executed because we don't have:
  - An EAS dev build deployed to a device or running emulator
  - A test backend with the adversarial endpoints (`POST /test/inject-bad-balance-sig`) wired
  - WalletConnect sandbox configured for automated SIWE
- These deferrals are tracked in `FINAL_PRE_BETA_CHECKLIST.md` section 2 ("5 Maestro E2E flows passing on physical devices").

---

## Contract tests

```
40 passing (3s)
```

Coverage was previously measured at 100% statements / 97% branches / 100% functions / 100% lines by `solidity-coverage` during Phase 1. Re-running coverage is a follow-up; the test list is exhaustive of public surface area:

- `mint()` happy path + role gating + bounds + event emission (T1-T12)
- `redeem()` happy path + reentrancy mock + insufficient liquidity + role/pause gating (T13-T22)
- Pause/unpause behavior (T23-T26)
- `emergencyWithdrawUSDC` (T27-T29)
- Coin math + USDC unit conversion (fuzz, T30-T34)
- `commitPurchase()` event-only, gas < 50_000 (T35-T40)

---

## Recommendations

1. **Run `solidity-coverage` again** to refresh the contracts coverage number for the audit doc and confirm `commitPurchase` is covered.
2. **Lift backend branch coverage to 80%** by adding tests for the error-path `catch` blocks. Either via a Postgres-backed integration test setup, or by mocking Prisma to throw specific error codes in unit tests.
3. **Maestro device run** is the highest-value remaining test gap. Once an EAS dev build exists, run the 5 flows on iOS + Android.
4. **External pentest** — `docs/THREAT_MODEL_FOR_PENTEST.md` is ready for handoff.

---

**Maintained by**: Claude (Lead Developer)
