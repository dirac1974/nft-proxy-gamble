# Roadmap

**Last updated**: 2026-05-26
**Status**: Phase 3 complete, pre-beta polish underway.

---

## Where we are right now

| Layer | State |
|---|---|
| Smart contract (`NFTProxyVoucher`) | Deployed + verified on Polygon Amoy (`0x2Ed681d659E67A0ef154875CA4743Ed865B60255`). 40/40 Hardhat tests passing. |
| Backend (Express + Prisma) | All routes implemented. Supabase Postgres live. 107/107 unit tests passing (B-1/B-2/B-3/B-4 bug fixes shipped with regression tests). |
| Mobile (Expo SDK 54) | Built against the live backend + contract. 81/81 jest tests, all TS clean. PR #11 (expo-iap restoration) merged. 5 Maestro flows written; device pass pending. |
| Security | Internal audit complete (4 bugs found + fixed). Threat-model export ready for external pentester. Slither/MythX run still needed before mainnet. |
| Docs | USER_GUIDE, ROLLBACK_PLAYBOOK, MONITORING_ALERTS_SPEC, TEST_COVERAGE_REPORT, THREAT_MODEL_FOR_PENTEST all written. |
| Ops | Jurisdiction gate live. In-app feedback widget live. Monitoring spec written (integration pending). |

**Test totals on main HEAD `4c8069c`**: 40 contracts + 107 backend + 81 mobile = **228 passing**.

---

## Milestone M0: Closed beta launch

**Goal**: 5-15 invited beta testers on TestFlight + Google Play Internal Testing exercising the full flow against Amoy.

**Remaining work** (anything unchecked here is what stands between us and starting M0):

| # | Item | Blocked by | Owner | Notes |
|---|---|---|---|---|
| 1 | EAS secrets populated for production profile | EAS CLI access + Apple / Google credentials | David | `eas secret:create` for `CERT_PIN_PRIMARY`, `CERT_PIN_BACKUP`, `EXPO_PUBLIC_BALANCE_VERIFY_KEY` |
| 2 | EAS dev/testnet build for iOS + Android | Item 1 | David | `eas build --platform ios --profile testnet` (same for android) |
| 3 | TestFlight + Internal Testing tracks set up | Item 2 + App Store Connect / Play Console | David | upload builds, add beta-tester emails |
| 4 | Maestro E2E flows passing on device | Item 2 | Claude on next session | execute the 5 YAMLs we already wrote against the dev build |
| 5 | Sentry SDK wired backend + mobile | Free Sentry org + DSN | Claude — autonomous when blocked unblocked | spec in `MONITORING_ALERTS_SPEC.md` §6 |
| 6 | On-chain event listener for the 4 audit events | RPC budget + small Node worker | Claude — design ready, deferable to M1 | `VoucherRedeemed`, `PurchaseCommitted`, `Paused`, `EmergencyWithdrawal` |
| 7 | Privacy Policy + Terms of Service live and linked | Legal review | David / counsel | needs to exist before App Store submission |
| 8 | Closed-user-group / NDA email sent to testers | Items 3, 7 | David | template in `BETA_LAUNCH_RUNBOOK.md` |

**Launch criteria for M0**:
- All of items 1-7 above closed
- One full manual flow on iOS device with sandbox IAP — recorded
- One full manual flow on Android device with internal-test IAP — recorded
- Hot wallet has ≥ 5 MATIC for cashout mints across beta period
- On-call rotation established for the first week

---

## Milestone M1: Open testnet beta

**Goal**: Remove invite gate; anyone can connect a wallet and play on Amoy.

**Pre-requisites**:
- 50+ shadow-mode device-attestation samples collected → flip `DEVICE_ATTESTATION_ENFORCE=true`
- M0 ran for 2+ weeks without a P0 alert
- Sentry crash-free rate ≥ 99.5% over the M0 window
- Behavioral analytics tuned (current thresholds are guesses; M0 data tells us if they're right)

**New work in M1**:
- Slither + MythX static analysis pass on the contract — required gate
- Replace device-attestation stubs with real Apple App Attest + Google Play Integrity API calls
- Move auth nonce store from in-memory `Map` to Redis
- Add `/health` exposure of `getPendingBatchSize()` so monitoring can poll commit backlog
- Onboard a Sentry-aware DOM/log dashboard so on-call can triage in one place

---

## Milestone M2: Mainnet launch

**Goal**: Switch from Amoy → Polygon mainnet. Real USDC. Real KYC for cashout.

**Hard requirements** (NONE of these can be waived):
- External pentest engagement (using `docs/THREAT_MODEL_FOR_PENTEST.md` as the brief) — at least one round of findings + fixes
- KYC integration (probably Persona, Veriff, or Sumsub) — replaces the self-attestation age gate
- Admin role moved to a Gnosis Safe with 2-of-3 multisig
- Deployer wallet (`0x1B87...7C1d`) rotated — its PRIVATE_KEY was exposed during development
- Real Cert Pin SPKI hashes captured from production TLS cert and set in EAS
- Timelock on `emergencyWithdrawUSDC` (currently instant) — at least 24h delay
- Static analysis (Slither + MythX) green
- Legal: ToS + Privacy + jurisdictional carve-outs reviewed by counsel; jurisdiction block list re-reviewed
- USDC liquidity provisioning plan — how much initial liquidity, who funds it, refill mechanism

**Punt to M3 if needed**: full atomicity of cashout daily limit (the LOW finding in audit — bounded by B-1 fix, but worth tightening), correlation IDs replacing userId in some log lines.

---

## Milestone M3: Public launch

**Goal**: App Store and Play Store public listings. No invitation needed.

**Pre-requisites**:
- M2 ran for 4+ weeks without a P0
- App Store + Play Store metadata, screenshots, age rating, privacy nutrition labels submitted and approved
- Marketing site live with the docs from `USER_GUIDE.md`
- Customer-support channel staffed (Discord, email queue, or both)
- 24/7 on-call coverage

---

## Out-of-scope / explicitly deferred

These were considered and explicitly deferred to keep scope contained:

- Subscriptions / recurring purchases — Phase 3 is consumables only
- Multi-game support (currently 9/6 Jacks-or-Better only)
- Social features (leaderboards, friend invites)
- Custom NFT art per voucher (currently a uniform metadata template)
- L2 settlement on a cheaper chain — Polygon PoS is the choice for now

---

## Update cadence

- This file is rewritten by Claude after each major milestone (M0/M1/M2/M3 transitions) or whenever the next-blocking item list changes substantively.
- Grok reviews and may append a "Grok 2026-MM-DD" note below if priorities shift.

---

**Maintained by**: Claude (Lead Developer)
