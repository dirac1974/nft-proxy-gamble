# Next Steps — Testing & Beta Readiness

_Last updated: 2026-05-28 (post Red Team audit)_

This document tracks what remains to test before closed beta and public launch. It complements `docs/RED_TEAM_AUDIT_2026-05-28.md` (security findings) and `docs/TEST_COVERAGE_REPORT.md` (current coverage).

Legend: ✅ done · 🟡 partial / in progress · ⬜ not started

---

## 1. Security testing remaining

| Area | Status | Notes |
|------|--------|-------|
| Backend unit tests | ✅ | 113 passing |
| Backend integration tests | 🟡 | Require Postgres; run in CI. RT-CRIT-1 / RT-MED-1 / RT-LOW-1 regressions added |
| Smart contract tests (Hardhat) | ✅ | Mint/redeem/reentrancy/access-control covered |
| Slither / MythX static analysis | ⬜ | **Blocking mainnet, not beta.** `slither contracts/src/NFTProxyVoucher.sol` as a pre-merge CI gate |
| Provably-fair property fuzzing | 🟡 | `fast-check` used in `videoPoker.test.ts`; extend to seed-rotation invariants |
| API fuzzing (malformed bodies, oversized payloads) | ⬜ | Run schemathesis / restler against the OpenAPI surface |
| Authn/Authz pen test (IDOR sweep across every `:id` route) | 🟡 | `/nfts/:id` verified; sweep all routes |
| Rate-limit bypass test (X-Forwarded-For spoofing, `trust proxy` config) | ⬜ | Confirm `app.set('trust proxy', …)` is correct behind the edge |
| Replay / double-spend race harness | 🟡 | Logic covered by atomic-update tests; add a concurrent load harness firing N parallel `/deal`, `/draw`, `/cashout` |
| Receipt fraud: `original_transaction_id` dedup | ⬜ | RT-MED-2 residual — add in Phase 4 |
| Device attestation enforce-mode test | ⬜ | Currently shadow mode; test `DEVICE_ATTESTATION_ENFORCE=true` paths |
| Secret-handling review (no keys in logs, env only) | ✅ | Config validated via zod; `.env` excluded |
| Dependency / supply-chain scan (npm audit, Dependabot) | ⬜ | Wire into CI |

### Recommended pen-test scope (external)
- Money paths end-to-end: IAP → balance → game → cashout → mint → redeem.
- Wallet auth (SIWE) replay and nonce exhaustion.
- Contract: front-running of mint/redeem, MEV on redemption, liquidity-drain scenarios.
- Mobile: jailbroken/rooted device behavior, cert-pinning bypass, runtime tampering (Frida), local storage inspection (JWT at rest).

---

## 2. UI / UX testing checklist (Android + iOS)

Run on at least: 1 low-end Android, 1 flagship Android, 1 older iPhone (SE), 1 current iPhone. Test light/dark and largest accessibility font.

| Screen / flow | Android | iOS |
|---------------|---------|-----|
| Lobby — connect wallet (WalletConnect deep-link round trip) | ⬜ | ⬜ |
| Age-gate modal (18+) shows once, blocks cashout until confirmed | ⬜ | ⬜ |
| Play — bet selector 1–5, disabled mid-hand | ⬜ | ⬜ |
| Play — deal → tap-to-hold → draw animation + payout confetti | ⬜ | ⬜ |
| Play — "Play Again" starts a fresh session (new seed) | ⬜ | ⬜ |
| Provably-fair modal — verify a real hand passes | ⬜ | ⬜ |
| Cashout → NFT voucher (PENDING → MINTING → MINTED polling) | ⬜ | ⬜ |
| My NFTs tab — list, detail, tx hash link | ⬜ | ⬜ |
| IAP sheet — purchase, restore, cancel, network-fail | ⬜ | ⬜ |
| Profile — disconnect, re-connect, jurisdiction-blocked state | ⬜ | ⬜ |
| Network banner — offline/online transitions | ⬜ | ⬜ |
| Session-expired (401) → forced disconnect to lobby | ⬜ | ⬜ |
| Deep-link / cold-start with stale JWT | ⬜ | ⬜ |

---

## 3. Functionality testing matrix (every user flow)

| Flow | Happy path | Edge / failure cases to assert |
|------|-----------|-------------------------------|
| Auth | Connect → sign → JWT | Expired nonce, wrong signer, replayed nonce, invalid address |
| Balance | Read signed balance | Tampered sig rejected, expired sig (>60s) rejected |
| Start session | 201 with hash + clientSeed | Insufficient balance → 402, bet outside 1–5 → 400 |
| Deal | 5 cards, bet debited | Re-deal blocked (not ACTIVE), parallel deal race → single debit |
| Draw | rank/payout/seed, balance credited | Double-draw → 409, **re-deal after draw uses fresh seed (RT-CRIT-1)** |
| Cashout | 202 voucher PENDING | < 100 → 400, > 100k → 400 (RT-MED-1), >5/day → 429, BLOCKED risk → 403, age-unconfirmed → 403, parallel cashout race → single debit |
| IAP | coins credited | Replay → 409, invalid receipt → 422, foreign bundle → invalid (RT-MED-2), unknown product → 422 |
| Mint | voucher MINTED with tokenId | Mint revert → FAILED status surfaced; coins not lost (capped) |
| Redeem (on-chain) | burn → USDC | Non-owner → revert, already-redeemed → revert, low liquidity → revert |
| Admin | flagged-users, set-risk | Non-admin JWT → 403, missing token → 401 |

---

## 4. Performance testing

| Test | Target | Status |
|------|--------|--------|
| `/game/deal` + `/game/draw` p95 latency under load | < 300ms | ⬜ |
| Cashout → mint throughput (Polygon Amoy) | sustained without nonce gaps | ⬜ |
| `commitPurchase` batch flush under burst IAP load | no backlog growth (watch `/health.pendingCommitBatch`) | ⬜ |
| DB index effectiveness (analytics rolling-window queries) | index hit, no seq scans | 🟡 indexes added; verify with `EXPLAIN` |
| Rate-limiter behavior under burst | 429s returned, no crash | ⬜ |
| Mobile cold-start time | < 3s | ⬜ |

---

## 5. Accessibility audit

| Item | Status |
|------|--------|
| `accessibilityRole` / `accessibilityLabel` on interactive elements | 🟡 present on bet chips, buttons, cards — full sweep needed |
| Color contrast (neon-on-dark theme) meets WCAG AA | ⬜ verify with contrast checker |
| Dynamic type / font scaling without clipping | ⬜ |
| Screen-reader (TalkBack / VoiceOver) full play flow | ⬜ |
| Touch target ≥ 44×44 | 🟡 bet chips are 44×44; audit cards + links |
| Reduced-motion respect (payout/card animations) | ⬜ |

---

## 6. Beta readiness assessment

**Green (ready):**
- Core money-path logic is atomic and race-safe.
- RNG integrity restored (RT-CRIT-1 fixed).
- Replay/IDOR/double-spend defenses verified.
- Smart contract manually audited; reentrancy-safe.

**Yellow (do before beta):**
- Run integration suite in CI against Postgres on every PR.
- Manual device pass of the full UI matrix on Android + iOS.
- Confirm `trust proxy` + rate-limit keying behind the production edge.
- Decide on RT-INFO-1 (asymmetric balance signing) — or formally accept display-only risk.

**Red (blocking mainnet, not beta):**
- Slither/MythX static analysis CI gate.
- External smart-contract audit before real-USDC liquidity.
- Move contract admin to Gnosis Safe + timelock (RT-INFO-4).
- Apple `original_transaction_id` dedup (RT-MED-2 residual) before iOS production IAP.

**Overall:** Closed testnet beta is reasonable once the Yellow items are cleared. Public/mainnet launch is gated on the Red items.
