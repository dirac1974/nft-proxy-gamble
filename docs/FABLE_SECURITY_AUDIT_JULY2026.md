# FABLE Security Audit & Architecture Review — NFT Proxy Gamble

**Date:** 2026-07-05
**Auditor:** Claude (Opus 4.8) — full-stack adversarial review
**Scope:** Solidity contracts (`contracts/`), backend (`backend/`), mobile app (`mobile/`), docs, config, CI
**Method:** Manual line-by-line review of all money-path code + 5 adversarial attack simulations (parallel sub-agents) + cross-check against prior audits (`SECURITY_AUDIT_2026-05-25.md`, `THREAT_MODEL_FOR_PENTEST.md`, `ADR-002`).
**Prior audits reviewed:** Note — `docs/RED_TEAM_AUDIT_2026-05-28.md` referenced in the tasking **does not exist** in the repo; the most recent on-disk audit is `SECURITY_AUDIT_2026-05-25.md`. Findings below are cross-referenced against it.

---

## 0. Executive Summary

The platform is well-engineered for a beta: OpenZeppelin contracts with 40 passing tests incl. reentrancy, atomic balance mutations that close the prior TOCTOU races (B-1/B-3), unique-constrained IAP receipts, and a signed-balance channel. The prior audit's fixes are real and held up.

**However, this review found one CRITICAL, directly player-exploitable money bug that all prior audits missed**, plus a CRITICAL deployment-config bug that mints free coins, and several HIGH issues around provable-fairness integrity, admin authz, and key custody. **The single most important finding (C-1) lets any player guarantee wins and drain the house** — it is a textbook provably-fair seed-reuse flaw that contradicts the platform's own `ADR-002`.

| # | Severity | Title | Status |
|---|----------|-------|--------|
| **C-1** | 🔴 CRITICAL | Server-seed reuse: player predicts every hand after first draw | ✅ **FIXED & PUSHED** |
| **C-2** | 🔴 CRITICAL | Google IAP verification bypass in non-prod (deployed `NODE_ENV=development`) → free coins | ✅ **FIXED & PUSHED** |
| **C-3** | 🔴 CRITICAL | Live minter key + prod DB password in working-tree `.env` | ⚠️ **ACTION REQUIRED (rotate)** |
| **H-1** | 🟠 HIGH | Apple receipt replay: dedup on raw-bytes hash, not `transaction_id` | ✅ **FIXED & PUSHED** |
| **H-2** | 🟠 HIGH | Provably-fair is not fair vs. the house (server controls both seeds) | ✅ **FIXED** (§8, seed chain) |
| **H-3** | 🟠 HIGH | Admin authz trusts unverifiable self-asserted `isAdmin` JWT claim | ✅ **FIXED** (§8, DB role) |
| **H-4** | 🟠 HIGH | `emergencyWithdrawUSDC` = single-EOA instant drain of all USDC, no timelock | ✅ **FIXED** (§8, timelock) |
| **H-5** | 🟠 HIGH | `jwt.verify` had no algorithm allowlist | ✅ **FIXED & PUSHED** |
| **M-1** | 🟡 MED | Device attestation is forgeable/fail-open theater wired to money paths | 🟨 **PARTIAL** (§8, fail-closed) |
| **M-2** | 🟡 MED | Jurisdiction override honored in `development` (deployed env) | ✅ **FIXED & PUSHED** |
| **M-3** | 🟡 MED | On-chain `mint()` not idempotent per `sessionId` (double-mint on retry) | 📋 Documented |
| **M-4** | 🟡 MED | No request body-size limit (DoS) | ✅ **FIXED & PUSHED** |
| **M-5** | 🟡 MED | Open CORS (`cors()` no config) on a real-money API | 📋 Documented |
| **M-6** | 🟡 MED | Contract solvency: vouchers mintable beyond USDC liquidity | 📋 Documented |
| **M-7** | 🟡 MED | 14-day JWT, no `jti`/tokenVersion, no revocation path | 📋 Documented |
| **M-8** | 🟡 MED | On-chain purchase-commit batch is in-memory (lost on crash) | 📋 Documented |
| **L-1** | 🔵 LOW | Auth nonce used `Math.random()` | ✅ **FIXED & PUSHED** |
| **L-2** | 🔵 LOW | Signed-balance is symmetric HMAC key shipped in binary (theater) | 📋 Documented |
| **L-3** | 🔵 LOW | `/nfts/:id` param not schema-validated (ownership still enforced) | 📋 Documented |
| **L-4** | 🔵 LOW | In-memory nonce & rate-limit stores (multi-instance) | 📋 Documented (known) |

**Bottom line:** After the pushed fixes, the directly-exploitable player-theft and free-coin paths are closed. Before any real-money / mainnet promotion, the team **must** rotate the exposed secrets (C-3), redesign provable-fairness to include committed client entropy (H-2), move admin to a Safe + timelock with a DB-backed admin role (H-3/H-4), and implement real device attestation or stop gating on it (M-1).

---

## 1. Randomness & Provable Fairness (the critical casino question)

### C-1 🔴 CRITICAL — Server-seed reuse lets a player predict every hand after the first draw

**Location:** `backend/src/routes/game.ts` (`/deal` reused `session.serverSeed`; `/draw` at line ~206 reveals `serverSeed` then returns the session to `ACTIVE`), `backend/src/services/videoPoker.ts:34` (`generateDeck`).

**The bug.** A `GameSession` holds one `serverSeed`, revealed to the client in the `/draw` response (`serverSeed: session.serverSeed`) so the player can verify the hand. But after a draw the session transitions **back to `ACTIVE`**, and `/deal` was allowed to deal another hand on the **same** session with an incremented `handNumber`, reusing the same `serverSeed`:

```
deck_N = FisherYates(keccak256(serverSeed : clientSeed : handNumber_N))
```

`clientSeed` is revealed at session start and `serverSeed` is revealed after the first draw. So once a player has drawn hand 0, they know **both** seeds and can compute `deck_1, deck_2, …` **before dealing them** — including the 5 face-down draw-pool cards. They then choose holds with perfect information and hit a Royal Flush / max hand at will.

**Exploit (any authenticated user, no special access):**
1. `POST /game/start-session` → get `clientSeed`, `serverSeedHash`.
2. `POST /game/deal` (hand 0), `POST /game/draw` → response reveals `serverSeed`.
3. Locally compute `generateDeck(serverSeed, clientSeed, 1)` → full 10-card layout of hand 1.
4. `POST /game/deal` (hand 1) on the **same session**; choose holds that yield the top hand; `POST /game/draw` → guaranteed max payout.
5. Repeat for hands 2..∞. Cash out to on-chain USDC.

**This directly contradicts the platform's own design.** `ADR-002` states verbatim: *"serverSeed must never be returned in any API response until the session is COMPLETE or CASHED_OUT"* and *"Each hand uses keccak256(serverSeed:clientSeed:handNumber) … so hand N cannot be predicted from hand N-1's output."* The prediction protection only holds while `serverSeed` is secret; revealing it mid-session while still accepting deals breaks it.

**Was it caught before?** ❌ No. `SECURITY_AUDIT_2026-05-25.md` signed off Section 2 (Balance Integrity) and Section 5 (Smart Contract) but never modeled seed reuse across hands. The integration tests actually *encoded* the vulnerable behavior (`security.test.ts:109` "draw reveals serverSeed").

**Fix (shipped).** Enforce **one hand per session**. `/game/deal` now rejects a deal when the session already has a hand:

```ts
// backend/src/routes/game.ts
if (hands.length >= 1) {
  throw new AppError(409, "This session already played its hand. Start a new session for the next hand.");
}
```

This is safe and minimal because the official client already starts a fresh session per hand (`mobile/src/app/(tabs)/play.tsx:86` — "PLAY AGAIN" calls `startSession`, not `deal`), and `ProvablyFairModal` hard-codes `handNumber=0`. The multi-hand-per-session capability was **never used by the client** and existed only as the exploitable path. Revealing `serverSeed` at draw is now harmless: no further hand can be dealt on a session whose seed is public, and the next hand always uses a fresh, still-secret seed. Regression test added (`game.test.ts` — "second deal on same session (after draw) returns 409").

**Future (if multi-hand sessions are ever wanted):** implement **per-hand seed rotation with chained commitments** — each hand gets its own `serverSeed`, its hash committed in the *previous* response, revealed only at *its own* draw. Then revealing hand N's seed tells nothing about hand N+1. This preserves per-hand verification and is the gold standard. Documented here rather than shipped because it is a cross-stack protocol change requiring coordinated mobile updates + QA.

### H-2 🟠 HIGH — "Provably fair" does not protect the player against a dishonest house

**Location:** `backend/src/routes/game.ts:45` (`clientSeed = clientSeedOverride ?? generateClientSeed()`), `mobile/src/services/api.ts:74` (client sends only `betAmount`), `mobile/src/services/provablyFair.ts:38` (`verifyHand`).

**The bug.** The commit-reveal only proves the server didn't *change its mind after committing*. It does **not** stop the server from choosing a rigged seed *at commit time*, because the server generates **both** `serverSeed` **and** `clientSeed` — the player contributes zero entropy. A malicious operator can, at session creation, grind `serverSeed` values until `keccak256(serverSeed:clientSeed:0)` produces a house-favorable deck, then commit that seed's hash. The client's `verifyHand` will still show ✓ (`hash matches`, `deck matches`) because everything is internally consistent — it is reassurance theater.

Additionally, `verifyHand` is never actually called on the `draw` path (`api.ts:86-104` does not invoke it), and it does not validate card range/uniqueness or that the server-echoed `holds` equal the player's chosen holds.

**Exploit:** operator biases every deck against every player; players who "verify" are falsely reassured. (Insider/operator threat — see Adversary 5.)

**Fix (design, not shipped — cross-stack).** Introduce **committed client entropy**:
1. Client generates a high-entropy `clientSeed` locally.
2. Server must have committed `serverSeed` (published `serverSeedHash`) **before** it learns the client seed — the standard way is a **per-user server-seed chain**: the server pre-commits the next `serverSeed`'s hash at the end of the previous session, so it cannot be reground against the new `clientSeed`.
3. `verifyHand` must run automatically on every result and hard-fail the UI + emit a dispute telemetry event when it fails; validate that cards are the 52 distinct values 0–51 and that reconstructed holds match the player's holds.

---

## 2. Smart Contract Security (`contracts/src/NFTProxyVoucher.sol`)

Overall the contract is solid: `nonReentrant` + CEI on `redeem` (burn → delete balance → `safeTransfer`), `MINTER_ROLE`/`PAUSER_ROLE`/`DEFAULT_ADMIN_ROLE` separation, exact USDC math (`10_000` raw units/coin), bounded amounts, 40 tests incl. an active reentrancy attack (T22) and fuzz (T29). No reentrancy, overflow, or unsafe-transfer issues found.

### H-4 🟠 HIGH — Admin can instantly drain all USDC; no timelock, single EOA

**Location:** `NFTProxyVoucher.sol:146` `emergencyWithdrawUSDC(amount, to)`; deployer holds `DEFAULT_ADMIN_ROLE` + `MINTER_ROLE` + `PAUSER_ROLE` (constructor lines 60-62).

`DEFAULT_ADMIN_ROLE` can move **100% of the contract's USDC** to any address in one tx, with no timelock and no multisig. The same single EOA (the deployer, `contracts/scripts/deploy.ts:30`) also holds mint and pause. A compromise of that one key = total loss of every user's redeemable balance, plus the ability to mint unlimited vouchers and freeze redemptions (`redeem` is `whenNotPaused`). The contract comment acknowledges this ("Phase 5 will move admin to a Gnosis Safe and consider adding a timelock") but ships it as-is.

**Was it caught before?** ❌ The prior audit marked "Smart Contract ✅". Centralization/rug risk was not scored.

**Fix:** move `DEFAULT_ADMIN_ROLE` to a Gnosis Safe (≥2/3) **before** holding real user funds; put `emergencyWithdrawUSDC` behind a `TimelockController` (e.g. 24–48 h) so users can exit before an admin drain; split roles across keys. Renounce the deployer's superfluous roles after grant.

### M-3 🟡 MEDIUM — `mint()` is not idempotent per `sessionId`

**Location:** `NFTProxyVoucher.sol:71` — `sessionId` is emitted in `VoucherMinted` but never stored or checked; every call mints a new `tokenId`.

Cashout→mint is fire-and-forget (`game.ts:triggerMint`). If a `FAILED` voucher whose tx actually landed on-chain is ever retried (manual op, future retry worker), the contract will happily mint a **second** NFT for the same cashout. DB-level `NFTVoucher.sessionId @unique` prevents *double cashout*, but not *double mint* of an existing voucher.

**Fix:** add `mapping(bytes32 => bool) usedSession;` keyed by `sessionId` and `require(!usedSession[sessionId])` in `mint()` (defense-in-depth; makes mints idempotent against backend retries).

### M-6 🟡 MEDIUM — Solvency: vouchers can be minted beyond USDC liquidity

`mint()` has no check that outstanding voucher coin-value ≤ contract USDC balance. Redemption reverts with "Insufficient USDC liquidity" if underfunded (T13), so users can hold unredeemable vouchers. This is an operational solvency risk, not theft. **Fix:** track `totalOutstandingCoins`, and either gate mint on liquidity or run a funding invariant + monitoring alert.

---

## 3. Backend Security

Architecture: Express/TS, wallet-signature (SIWE-style) → JWT auth, Prisma/Postgres coin ledger, Apple/Google IAP → coins, cashout → on-chain ERC-1155 mint via a hot-wallet minter, plus risk analytics, jurisdiction block, and device attestation (shadow). All money mutations are wrapped in atomic Prisma transactions with conditional `where` guards — the prior B-1/B-3 TOCTOU fixes are correctly in place and were re-verified.

### C-2 🔴 CRITICAL — Google IAP verification bypass grants unlimited free coins

**Location:** `backend/src/services/iapVerifier.ts:60` `verifyGoogleReceipt`; deployed `backend/.env` has `NODE_ENV=development`.

The previous code only failed closed when `NODE_ENV === "production"`. For any other env it returned `valid: true` for **any** client-supplied `productId` in the table with **any** `purchaseToken.length > 10`, and derived `receiptHash` from `productId:purchaseToken` (attacker-controlled). Because the shipped `.env` is `development`, a deployed beta would credit coins for a forged request:

```
POST /iap/verify-purchase { platform:"google", productId:"coins_5000", purchaseToken:"aaaaaaaaaaa" }
→ 5000 coins; change token → new hash → repeat forever → cash out to real USDC.
```

**Was it caught before?** ❌ The prior audit's IAP section (B-4) covered prototype-pollution but not the env-gated bypass; it assumed prod-gating was sufficient while the deployment ships `development`.

**Fix (shipped).** Fail closed everywhere except the automated test harness until real Play Integrity verification lands:

```ts
if (config.NODE_ENV !== "test") {
  return { valid: false, productId, coinsGranted: 0, receiptHash: hashReceipt(`${productId}:${purchaseToken}`) };
}
```

### H-1 🟠 HIGH — Apple receipt replay via raw-bytes hash

**Location:** `iapVerifier.ts:20` `verifyAppleReceipt`; dedup relied on `sha256(receiptData)` (`schema.prisma:96` `receiptHash @unique`).

An Apple StoreKit receipt blob is re-fetchable/re-encodable; the same purchase can be presented with different bytes → different `sha256` → the unique constraint is bypassed and the purchase is credited again. The code also never recorded Apple's `transaction_id`.

**Fix (shipped).** Derive the idempotency key from Apple's stable transaction identifier:

```ts
const txnKey = latestReceipt.transaction_id ?? latestReceipt.original_transaction_id;
const receiptHash = txnKey ? hashReceipt(`apple:${txnKey}`) : hashReceipt(receiptData);
```

One idempotency key per real purchase, keeping the existing `@unique` constraint. (Interface extended to carry the txn ids.)

### H-3 🟠 HIGH — Admin authorization trusts a self-asserted JWT claim

**Location:** `backend/src/routes/admin.ts:11` `requireAdmin` → `payload?.isAdmin === true`; nothing in `signToken` (`middleware/auth.ts`) ever sets `isAdmin`, and there is no DB role.

Admin gating rests entirely on a claim inside the JWT. There is no issuance path and no server-side role check, so admin is authoritative purely from the token. If `JWT_SECRET` is ever exposed (see C-3) or any token-forging bug exists, an attacker self-grants admin and can read every flagged user's wallet and override risk levels (unblock themselves).

**Fix:** add an `isAdmin` (or `role`) column to `User`, and have `requireAdmin` check the DB row, never the claim. Log admin actions.

### H-5 🟠 HIGH (defense-in-depth) — `jwt.verify` without algorithm allowlist — FIXED

**Location:** `middleware/auth.ts:23`. `jwt.verify(token, secret)` did not pin `algorithms`. Modern `jsonwebtoken` rejects `alg:none` with a string secret, but the allowlist is fragile-by-omission. **Fix (shipped):** `jwt.verify(token, secret, { algorithms: ["HS256"] })` and `jwt.sign(..., { algorithm: "HS256" })`.

### M-1 🟡 MEDIUM — Device attestation is forgeable/fail-open theater on money paths

**Location:** `backend/src/services/deviceAttestationService.ts` (verifiers only check base64 length ≥ 32 / 3-part JWS shape; unconfigured → `valid:true`; shadow → never blocks), `mobile/src/services/deviceAttestationService.ts` (token = HMAC of a hard-coded constant over the EAS `projectId`, identical for all installs). Wired into `/game/cashout` and `/iap/verify-purchase`.

Provides no real protection and, being fail-open by default, blocks nothing — but its presence gives false assurance. **Fix:** implement real Apple App Attest / Google Play Integrity (server-side token verification against Apple/Google), fail **closed** once enforced; until then, treat `x-attestation-*` as untrusted and do not describe it as a control.

### M-2 🟡 MEDIUM — Jurisdiction override honored in `development` — FIXED

**Location:** `middleware/jurisdictionBlock.ts:40`. `x-country-override` was honored whenever `NODE_ENV !== "production"`; the deployed `.env` is `development`, so any client could spoof its country and bypass the geo-block on money paths. **Fix (shipped):** honor the override only when `NODE_ENV === "test"`. (Note: the block is still fail-open when no geo header is present — acceptable for beta per the code comment, but flip to fail-closed in prod and ensure origin is only reachable via the CDN edge.)

### M-4 🟡 MEDIUM — No body-size limit — FIXED

`app.use(express.json())` had no `limit`. **Fix (shipped):** `express.json({ limit: "256kb" })` (Apple receipts fit comfortably).

### M-5 🟡 MEDIUM — Open CORS on a real-money API

`app.ts:19` `app.use(cors())` allows all origins. Native mobile doesn't enforce CORS, but any future web surface + a leaked token becomes cross-origin-callable. **Fix:** restrict `origin` to known front-ends via an `ALLOWED_ORIGINS` config, or drop CORS entirely if only native clients call the API. *(Left as documented to avoid breaking an unknown web client during beta.)*

### M-7 🟡 MEDIUM — 14-day JWT, no revocation

`backend/.env` `JWT_EXPIRY=14d`, no `jti`/`tokenVersion`, no server-side revocation. A single leaked token = 14 days of full account control incl. cashout. **Fix:** add a `tokenVersion` claim checked against the DB user row, shorten access-token expiry, use refresh tokens.

### M-8 🟡 MEDIUM — On-chain purchase-commit batch is in-memory

`purchaseCommitmentService.ts` holds `pendingBatch` in memory, flushed every 5 min / on SIGTERM only; a crash (`kill -9`/OOM) drops the audit commitments while coins are already credited. **Fix:** persist pending commitments to the DB with a status column + a retry/reconciliation worker.

### L-1 🔵 LOW — Auth nonce used `Math.random()` — FIXED

`auth.ts:18` now uses `crypto.randomBytes(16)` for the challenge.

### L-2 🔵 LOW — Signed-balance is a symmetric HMAC key shipped in the app

`balanceSigning.ts` derives the HMAC key from `JWT_SECRET`; the same key is baked into every mobile binary (`EXPO_PUBLIC_BALANCE_VERIFY_KEY`). Server never verifies a client-supplied balance (`verifyBalanceSig` is unused server-side — confirmed), so this is display-integrity only and a modified client can already show anything. The concern is (a) it's security theater and (b) it couples a client-shipped secret to the master `JWT_SECRET`. **Fix:** if kept, use an **asymmetric** signature (server private key, client embeds only the public key); never derive a shipped key from `JWT_SECRET`.

### L-3 🔵 LOW — `/nfts/:id` param not schema-validated

`nfts.ts:31` passes `req.params.id` straight to Prisma. Ownership is checked post-fetch (no IDOR), and Prisma parameterizes, but validate the id shape for consistency.

### L-4 🔵 LOW — In-memory nonce & rate-limit stores

Known/accepted for single-instance beta (`auth.ts:11`, `app.ts:23`). Move to Redis before horizontal scaling.

---

## 4. Adversarial Attack Simulation (Phase 4)

| Adversary | Goal | Result |
|-----------|------|--------|
| **1. Card Counter** | Predict outcomes from RNG chain | ✅ **Broke it** → **C-1**. After the first `/draw` reveals `serverSeed`, all future same-session hands are fully predictable. Fixed. |
| **2. Race-Condition Exploiter** | Double-cashout / double-payout / negative balance | ❌ Blocked. Atomic conditional `update` guards (`coinBalance: { gte }`, `state: "AWAITING_DRAW"`, `state: "ACTIVE"`) close all TOCTOU windows (prior B-1/B-3 fixes verified). Minor: daily-cashout `count` is pre-transaction (at most one extra small cashout; L-tier). |
| **3. Contract Exploiter** | Drain contract funds | ❌ via reentrancy/overflow/unsafe-transfer (CEI + `nonReentrant` + `SafeERC20`). ✅ via **admin key** (H-4) and forged mint if minter key leaks (C-3). |
| **4. Frontend Manipulator** | Negative bets, oversized cashout, bad holds, forged payout | ❌ Blocked. Server recomputes payout; Zod enforces `betAmount∈[1,5]`, `holds` = 5 booleans, `coinsToCashout ≥ 100`; balance decremented atomically. Client clamps are cosmetic (correctly server-enforced). |
| **5. Insider / Malicious Operator** | Rig games, steal funds | ⚠️ **High blast radius.** Operator can rig decks (H-2, provable-fairness gives players no real protection), drain all USDC (H-4), mint free vouchers / self-grant admin (C-3/H-3). This is the platform's largest residual risk surface and is mostly *by construction* (centralized custody + weak fairness proof). |

---

## 5. Architecture Review (Phase 5)

**Sound foundations.** The on-chain/off-chain split is reasonable for a mobile casino: coins are an off-chain ledger (fast, cheap gameplay), and only cashout crosses to chain as a redeemable ERC-1155 → USDC voucher. Atomic DB transactions are the ledger's integrity backbone and are used correctly. ERC-1155 vouchers are transferable and independently redeemable (good — users aren't locked to the app).

**Key weaknesses / single points of failure:**
1. **Trust is fully centralized.** The backend is the source of truth for balances and outcomes; the "provably fair" and "signed balance" mechanisms don't actually constrain a dishonest operator (H-2, L-2). For a real-money product this is the core architectural gap — fairness must be *provable to the player*, not asserted.
2. **One hot key does everything on-chain** (mint + admin + pause). Compromise = total loss (H-4, C-3). Split roles; Safe + timelock for admin; minter key in a KMS/HSM, never on the app host.
3. **Backend-down mid-game.** Sessions are DB-persisted, so a crash between `/deal` and `/draw` leaves a session `AWAITING_DRAW` with the bet already debited and no refund path — the player simply loses the bet. Consider a session-timeout/refund reconciliation job.
4. **Disputes.** There is no dispute mechanism beyond client-side verification (which H-2 undermines). Recommend a signed, append-only server-side hand log the player can export and an independent verifier.
5. **Reveal for abandoned sessions.** With the C-1 fix, a session's `serverSeed` is still only revealed on `/draw`; that's fine, but add an explicit end-of-session reveal endpoint so players can always verify.

**Recommended target architecture for real money:** Safe-governed contracts + timelock; per-user server-seed chain with committed client entropy; minter key in cloud KMS with a signing service; DB-persisted on-chain commit queue with reconciliation; real device attestation; Redis-backed nonce/rate-limit; DB-backed admin roles; external audit (Slither/MythX + a firm) before mainnet.

---

## 6. Casino Game Expansion (Phase 6)

**Critical dependency:** every multi-step game (blackjack hit/stand, hold'em streets, craps series) requires the **per-hand/round seed-rotation-with-chained-commitment** scheme described in C-1/H-2. The current single-reveal model is only safe for **one-shot** resolutions. Build the seed-chain first; it unblocks all of these.

| Game | Provably-fair mechanism | Contract changes | Complexity |
|------|------------------------|------------------|-----------|
| **Roulette (Euro single-0)** | One spin = one number `keccak(serverSeed:clientSeed:nonce) % 37`. One-shot → fits current model directly. Inside/outside bets resolved server-side. | None (reuse voucher `gameType`) | **Low** — best first addition. |
| **Slots** | Per-spin reel stops from the hash; publish paytable + RTP; one-shot. Could reuse the existing slot-simulator engine for reels/animation. | None | **Low–Med** (math/paytable design is the work). |
| **Baccarat (Punto Banco)** | Fixed drawing rules, no player decisions → deterministic from the shuffled shoe seed; one-shot per coup. | None | **Low–Med**. |
| **Blackjack** | **Needs seed chain** — each player decision (hit/stand/double/split) consumes the next committed card; commit shoe seed, reveal on round end. Side bets/insurance = extra one-shot resolutions. | None (voucher already carries `gameType` bytes32) | **High** (state machine + seed chain). |
| **Video Poker variants** (Deuces, Bonus) | Same engine as today; new paytables + `evaluateHand` rules. One-shot. | None | **Low** (per variant). |
| **Craps** | Multi-roll series → **needs seed chain**; each roll = committed dice pair. Complex bet resolution. | None | **High**. |
| **Texas Hold'em vs. house** | **Needs seed chain**; commit deck, reveal per street. Heads-up vs. house avoids multi-player collusion. | None | **Very High** (betting rounds, hand eval, house strategy). |
| **Sports / prediction markets** | Fundamentally different — off-chain oracle/settlement, not RNG. Could integrate the existing Polymarket tooling as a separate product line, not a "provably fair" game. | New settlement path/oracle | **Very High** (regulatory + oracle). |

**Sequencing recommendation:** (1) fix H-2 seed chain, (2) add Roulette + a Video Poker variant (reuse infra, one-shot), (3) Baccarat/Slots, (4) Blackjack once the seed chain is battle-tested, (5) defer Craps/Hold'em/Sports.

---

## 7. What Was Fixed & Pushed vs. What Needs the Team

**Shipped in this branch (`security/fable-audit-july2026`)** — backend, all unit tests green (111/111), `tsc` clean:
- C-1 one-hand-per-session (provably-fair seed reuse) + regression test
- C-2 Google IAP fail-closed outside test
- H-1 Apple receipt dedup on `transaction_id`
- H-5 JWT algorithm allowlist
- M-2 jurisdiction override → test-only
- M-4 request body-size limit
- L-1 CSPRNG auth nonce

**Requires the team (cannot/should not be auto-fixed here):**
- **C-3 (do first):** rotate the exposed **minter private key** and **Supabase DB password** now — treat both as compromised. Move to a secrets manager / GitHub Actions secrets; never keep a mainnet-capable key on the app host. *(Per project rules I did not touch `.env`.)*
- **H-2:** provable-fairness redesign (committed client entropy + server-seed chain) — cross-stack, needs mobile changes + QA.
- **H-3:** DB-backed admin role (schema migration).
- **H-4:** Gnosis Safe + timelock for `DEFAULT_ADMIN_ROLE` / `emergencyWithdrawUSDC`; split on-chain roles.
- **M-1:** real device attestation or remove the false control.
- **M-3/M-6:** on-chain `sessionId` idempotency + solvency invariant.
- Run **Slither/MythX** and an external firm audit before mainnet (still open from the prior audit).

---

## Appendix A — Files changed
```
backend/src/routes/game.ts                 C-1: reject 2nd deal per session
backend/src/services/iapVerifier.ts        C-2: Google fail-closed; H-1: Apple txn-id dedup
backend/src/middleware/auth.ts             H-5: HS256 allowlist on verify+sign
backend/src/routes/auth.ts                 L-1: CSPRNG nonce
backend/src/middleware/jurisdictionBlock.ts M-2: override test-only
backend/src/app.ts                         M-4: json body limit 256kb
backend/tests/integration/game.test.ts     C-1 regression test
```

## Appendix B — Prior-audit accuracy
The prior `SECURITY_AUDIT_2026-05-25.md` fixes (B-1 balance TOCTOU, B-2 tokenId parsing, B-3 double-payout, B-4 IAP prototype pollution) are **real and verified present**. Its gaps: it missed the seed-reuse critical (C-1) despite documenting the correct rule in ADR-002, missed the env-gated IAP bypass (C-2), treated the smart contract as fully clear despite the admin-drain centralization (H-4), and accepted "signed balance" / device attestation as controls that this review classifies as theater (L-2/M-1).

---

## 8. Post-audit remediation (branch `feat/expansion-roulette-authz`)

Follow-up work implemented on top of the audit branch. Backend unit suite green
(160), contract suite green (44), mobile type-check + provably-fair tests green.
New integration tests added for each item (run in CI against Postgres).

**Also fixed here (pre-existing, unrelated to the audit):** the cashout
integration-test fixtures never set `ageConfirmed`, so `/game/cashout` returned
403 and main's CI was red on every run. Fixtures corrected.

### H-2 — Provably-fair server-seed chain + committed client entropy ✅
- `User.nextServerSeed` (secret) + `nextServerSeedHash` (published commitment),
  initialized at account creation.
- `start-session` (video poker **and** roulette) consumes the pre-committed seed
  and rotates a fresh one via a **compare-and-swap** (`updateMany WHERE
  nextServerSeed = observed`), so concurrent session creation can never share a
  serverSeed (would re-open C-1). Proven by a concurrency unit test.
- This session's `serverSeedHash` was published as the previous session's
  `nextServerSeedHash`, so the operator cannot regrind the seed against the
  client seed. Clients may supply their own `clientSeed`.
- Client (`mobile`) now verifies automatically and hard-fails the UI on mismatch.
- Files: `backend/src/services/serverSeedChain.ts`, `routes/auth.ts`,
  `routes/game.ts`, `routes/roulette.ts`; `mobile/src/services/provablyFair.ts`.
- Residual: first session for legacy (pre-chain) accounts self-commits; new
  accounts are pre-committed from creation.

### H-3 — DB-backed admin role + audit log ✅
- `User.isAdmin` column; `requireAdmin` authorizes from the DB on every request,
  never from a JWT claim (the `isAdmin` claim was removed from the token type).
  Revoking `isAdmin` in the DB blocks an existing token immediately.
- New `AdminAuditLog` model; every privileged admin action is recorded.
- Files: `prisma/schema.prisma`, `routes/admin.ts`, `types/index.ts`.

### H-4 — Emergency-withdrawal timelock ✅
- `emergencyWithdrawUSDC` replaced by `initiateEmergencyWithdrawal` /
  `executeEmergencyWithdrawal` (after `EMERGENCY_WITHDRAWAL_DELAY = 24h`) /
  `cancelEmergencyWithdrawal`, with lifecycle events and a single-slot queue.
  CEI-clears the pending slot before transfer.
- **Still required:** move `DEFAULT_ADMIN_ROLE` to a Gnosis Safe and split roles.
  The timelock is the on-chain delay layer beneath that governance change, not a
  replacement for it.
- Files: `contracts/src/NFTProxyVoucher.sol`, tests T13/T26/T41–T44.

### M-1 — Device attestation hardening 🟨 (partial)
- Fail **closed** in production / when enforced (missing or malformed token
  blocks cashout + IAP). Failures logged with userId + ip + reason. Unattested
  requests rate-limited to 5/min/IP.
- **Still theater at the crypto layer:** the platform verifiers remain STUBS
  (shape checks only, forgeable). Real Apple App Attest / Google Play Integrity
  server verification is still required before this is a strong control; the code
  says so explicitly.
- Files: `backend/src/services/deviceAttestationService.ts`,
  `middleware/attestationRateLimit.ts`.

### Casino expansion — European roulette (Phase 6, first game) ✅
- One-shot provably-fair (`HMAC_SHA256(serverSeed, clientSeed:nonce) mod 37`);
  full European paytable; inside-bet geometry validated against legal-group sets;
  2.7% single-zero house edge asserted by test. Routes reuse the commit-reveal
  session model and the existing `/game/cashout` path; cross-game guards prevent
  mixing poker/roulette sessions.
- Files: `backend/src/services/roulette.ts`, `routes/roulette.ts`;
  `mobile` roulette tab + verification.

### Still open (unchanged — needs the team)
- **C-3:** rotate the exposed minter key + DB password (per rules, `.env`
  untouched here).
- **H-4 governance:** Gnosis Safe + role split (timelock landed; Safe has not).
- **M-1 crypto:** real App Attest / Play Integrity verification.
- **M-3/M-6:** on-chain `sessionId` mint idempotency + solvency invariant.
- **M-5/M-7/M-8, L-2/L-4:** CORS allowlist, token revocation, persisted commit
  queue, asymmetric signed balance, Redis-backed stores.
- External Slither/MythX + firm audit before mainnet.
