# Red Team Adversarial Audit — 2026-05-28

**Scope:** `contracts/`, `backend/src/`, `backend/tests/`, `mobile/src/`
**Posture:** Adversarial. Goal was to steal money, cheat the game, double-spend, forge receipts, or escalate privilege.
**Result:** 1 CRITICAL, 2 MEDIUM, 1 LOW exploit fixed in code with regression tests. Several INFO/accepted-risk items documented.

---

## TL;DR

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| RT-CRIT-1 | **CRITICAL** | Server seed reused across hands → guaranteed-win RNG prediction | ✅ Fixed |
| RT-MED-1 | MEDIUM | Cashout above on-chain `MAX_COIN_BALANCE` burns user coins (mint reverts after debit) | ✅ Fixed |
| RT-MED-2 | MEDIUM | Apple receipt not bound to our bundle id → cross-app receipt redemption | ✅ Fixed |
| RT-LOW-1 | LOW | JWT algorithm not pinned → alg-confusion / `none` token risk | ✅ Fixed |
| RT-LOW-2 | LOW | Validation errors returned HTTP 500 instead of 400 | ✅ Fixed |
| RT-INFO-1 | INFO | "Public" balance-verify key is symmetric (HMAC) — display-only control | Documented |
| RT-INFO-2 | INFO | Jurisdiction gate is fail-open when edge geo header missing | Accepted (documented) |
| RT-INFO-3 | INFO | In-memory auth nonce store does not survive multi-instance scale-out | Accepted (documented) |
| RT-INFO-4 | INFO | Contract admin (`emergencyWithdrawUSDC`, role grants) is a single EOA | Accepted — Phase 5 Gnosis Safe + timelock |

---

## RT-CRIT-1 — Server seed reuse enables guaranteed-win RNG prediction

**Files:** `backend/src/routes/game.ts` (`/deal`, `/draw`), `backend/src/services/videoPoker.ts`

### Attack vector
The provably-fair scheme commits to a `serverSeed` (publishing `keccak256(serverSeed)` at session start) and reveals the `serverSeed` in the `/game/draw` response so the player can verify the hand. The deck for hand *n* is `generateDeck(serverSeed, clientSeed, n)`.

The flaw: `/game/draw` reset the session back to `ACTIVE` **without rotating `serverSeed`**, and `/game/deal` is callable again on the same session (`handNumber` simply increments). The legitimate mobile client starts a brand-new session for each "Play Again", so it never re-deals — but a hand-rolled API client can:

1. `POST /game/start-session` → get `sessionId`, `clientSeed`.
2. `POST /game/deal` (hand 0), then `POST /game/draw` → **server reveals `serverSeed`**.
3. The session is now `ACTIVE` again with the **same** `serverSeed`.
4. Attacker computes `generateDeck(serverSeed, clientSeed, 1)` locally — the full 10-card deck for hand 1 is now known **before dealing**.
5. `POST /game/deal` (hand 1), choose the `holds` that yield the best 5-card hand (the draw pool is also known), `POST /game/draw` → guaranteed maximum payout.
6. Repeat for hands 2, 3, … inflating `coinBalance` arbitrarily, then `POST /game/cashout` → mint an NFT voucher → redeem for USDC.

### Impact
Unlimited coin inflation → direct theft of USDC from the redemption liquidity pool. **CRITICAL** — total loss of game integrity and treasury.

### Proof of concept (pseudo)
```js
const { sessionId, clientSeed } = await post('/game/start-session', { betAmount: 5 });
await post('/game/deal', { sessionId });
const { serverSeed } = await post('/game/draw', { sessionId, holds: [false,false,false,false,false] });
// session is ACTIVE again, same serverSeed
const deck = generateDeck(serverSeed, clientSeed, 1);   // hand 1 fully known
await post('/game/deal', { sessionId });                 // matches deck[0..4]
const holds = optimalHolds(deck);                        // pick the winning keep pattern
const { payout } = await post('/game/draw', { sessionId, holds }); // guaranteed royal/quads
```

### Fix
Rotate the server seed on **every** draw. The draw response reveals the seed used for the *just-completed* hand, then commits a fresh, unrevealed seed (and publishes its hash as `nextServerSeedHash`) for any subsequent hand on the same session. A revealed seed is therefore never reused, so future hands remain unpredictable. State still returns to `ACTIVE` so cashout continues to work.

```ts
const nextServerSeed = generateServerSeed();
const nextServerSeedHash = hashServerSeed(nextServerSeed);
await tx.gameSession.update({
  where: { id: sessionId, state: "AWAITING_DRAW" },
  data: { state: "ACTIVE", /* ... */ serverSeed: nextServerSeed, serverSeedHash: nextServerSeedHash },
});
// response: { serverSeed: <old, revealed>, nextServerSeedHash, ... }
```

### Regression test
`backend/tests/integration/security.test.ts` → *"commits a fresh, unrevealed seed for the next hand after a draw"*: deals a 2nd hand on the same session and asserts the deck predicted from the revealed seed does **not** match the actual dealt cards, and that `nextServerSeedHash !== firstHash`.

---

## RT-MED-1 — Cashout above on-chain max burns user coins

**File:** `backend/src/routes/game.ts` (`/cashout`)

### Attack vector / bug
`NFTProxyVoucher.mint()` reverts when `coinAmount > MAX_COIN_BALANCE` (100,000). The backend `/cashout` had no upper bound on `coinsToCashout`. A cashout of >100,000:
1. Passes the balance check, **debits the coins from the DB**, creates a `PENDING` voucher (all in one transaction).
2. The async `triggerMint` calls `mint()` which **reverts** → voucher marked `FAILED`.
3. The coins are already gone; the user is permanently short with no on-chain asset. Not attacker profit, but a real-money loss to users and a support/chargeback liability.

### Impact
User fund loss; trust/regulatory exposure. **MEDIUM.**

### Fix
Cap `coinsToCashout` at the on-chain `MAX_COIN_BALANCE` in the Zod schema (`.max(100_000)`), rejecting up-front with 400 before any debit. This mirrors an **immutable contract invariant**, not a tunable risk threshold.

### Regression test
`security.test.ts` → *"rejects coinsToCashout above 100_000 with 400 and does not deduct"* — asserts balance is untouched.

---

## RT-MED-2 — Apple receipt not bound to our app bundle id

**File:** `backend/src/services/iapVerifier.ts`

### Attack vector
Apple's `verifyReceipt` returns `status: 0` for **any** valid receipt from **any** app. The verifier only checked `status === 0` and that the `product_id` exists in `IAP_PRODUCTS`. The legacy product ids (`coins_100`, `coins_500`, …) are common strings; an attacker could purchase a same-named product in a different (free/cheap) app and submit that receipt to mint our coins for free.

### Impact
Coin grants without paying our prices. **MEDIUM.**

### Fix
When `APPLE_APP_ATTEST_BUNDLE_ID` is configured, reject any receipt whose `receipt.bundle_id` does not match. Enforced only when configured so dev/sandbox without the env var is unaffected.

### Regression test
`backend/tests/unit/iapVerifier.test.ts` → *"verifyAppleReceipt — bundle_id binding"*: foreign bundle id → `valid: false`; our bundle id → `valid: true`. (`global.fetch` mocked.)

### Residual / follow-up (not yet fixed — tracked)
Receipt replay dedup is keyed on `sha256(receiptData)`. Apple may return differently-encoded receipt blobs for the same underlying transaction. Phase 4 should additionally dedup on `original_transaction_id` extracted from the validated receipt.

---

## RT-LOW-1 — JWT algorithm not pinned

**File:** `backend/src/middleware/auth.ts`

`jwt.verify(token, secret)` accepted whatever algorithm the token header declared, leaving the door open to algorithm-confusion (`none`, or RS256 verified against the symmetric secret). **Fix:** pin `algorithms: ["HS256"]` on verify and `algorithm: "HS256"` on sign. **Regression test:** `security.test.ts` → *"rejects an alg=none unsigned token"*.

---

## RT-LOW-2 — Validation errors surfaced as HTTP 500

**File:** `backend/src/middleware/errorHandler.ts`

A `ZodError` from `schema.parse()` fell through to the 500 branch. This is information-poor for clients and noisy for alerting (a 500 wrongly implies a possible side effect). **Fix:** map `ZodError` → `400 { error: "Invalid request", details }`.

---

## Items reviewed and found SOUND (no change needed)

- **Balance integrity / double-spend (B-1, B-3):** `/deal`, `/draw`, `/cashout` all use atomic conditional updates (`where: { coinBalance: { gte } }` / `state: ...`) inside `$transaction`, with `P2025` → 402/409. Parallel-request races close correctly.
- **IAP replay:** `IAPReceipt.receiptHash` is globally `@unique`; duplicate submission (same or cross-account) → `P2002` → 409. Credit + receipt insert are atomic.
- **NFT IDOR:** `/nfts/:id` enforces `voucher.userId === req.user.userId` → 404 otherwise. `/nfts` filters by `userId`.
- **Voucher double-mint:** `NFTVoucher.sessionId` is `@unique`; cashout transitions session `ACTIVE → CASHED_OUT` atomically (one voucher per session).
- **Smart contract `redeem`:** CEI ordering (`_burn` + `delete coinBalance` before `safeTransfer`), `nonReentrant`, ownership/`coins>0` checks. Reentrancy and double-redeem not feasible. `ReentrantERC20` mock test confirms.
- **Auth (SIWE):** single-use nonce with 60s TTL, `verifyMessage` recovery, address-bound. No `isAdmin` is ever issued by the login flow, so admin escalation requires the JWT secret.
- **Rate limiting / jurisdiction:** helmet + per-route limiters; jurisdiction gate on the money paths (`/cashout`, `/iap`).
- **Prototype pollution (B-4):** `IAP_PRODUCTS` lookup uses `hasOwnProperty` + numeric type guard.

## Accepted risks (documented, not fixed this round)

- **RT-INFO-1:** `balanceVerification.ts` describes its key as "public" but it is the symmetric HMAC key used by `signBalance`. If embedded in the client, it provides no real protection against a client/MITM forging a balance. Impact is limited because the signed balance is **display-only** — the backend never accepts a client-supplied balance to mutate state. Recommend migrating to an asymmetric scheme (Ed25519) so the client holds a genuine public key, or dropping the control.
- **RT-INFO-2:** Jurisdiction gate is fail-open when neither `cf-ipcountry` nor `x-vercel-ip-country` is present. Flip to fail-closed once the edge guarantees the header (tracked in `jurisdictionBlock.ts`).
- **RT-INFO-3:** Auth nonce store is in-process; multi-instance scale-out needs Redis (or sticky routing) or nonces issued on one node fail to verify on another.
- **RT-INFO-4:** Contract admin/minter is a single EOA. Phase 5 plan: Gnosis Safe + timelock for `emergencyWithdrawUSDC` and role management.

---

## Verification

- `npx tsc --noEmit` — clean.
- `npm run test:unit` — 113 passed (includes 2 new RT-MED-2 tests).
- Integration regression tests (RT-CRIT-1, RT-MED-1, RT-LOW-1) added to `security.test.ts`; require Postgres and run in CI (`npm run test:integration`).
