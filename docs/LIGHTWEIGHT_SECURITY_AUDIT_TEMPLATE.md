# Lightweight Security Audit Template

**Use before every Phase milestone PR merge and before any production deployment.**
**Estimated time**: 30–60 minutes for a single feature area.

This template is not a substitute for a professional pentest — it is a structured self-review that catches the most common real-money vulnerabilities before code ships.

---

## 1. Threat Model Review (5 min)

For each change in this PR, answer:

| Question | Answer |
|----------|--------|
| Does this touch coinBalance, payout, or IAP flow? | Y / N |
| Could an attacker trigger this without authentication? | Y / N |
| Does this accept input from the client that affects server state? | Y / N |
| Does this make an on-chain call or modify contract state? | Y / N |
| Does this expose user PII or wallet addresses? | Y / N |

If any answer is **Y**, complete the full checklist below for that area.

---

## 2. Balance Integrity Checks

- [ ] `coinBalance` mutations only occur in backend routes (`/iap/verify-purchase`, `/game/draw`, `/game/cashout`)
- [ ] Every balance mutation is wrapped in `prisma.$transaction([...])` — atomic or nothing
- [ ] Every balance-touching response includes `balanceSig` and `sigTimestamp`
- [ ] `signBalance(userId, coinBalance)` called immediately before `res.json()` — no code path returns balance without sig
- [ ] Client routes verify `verifyAndExtractBalance()` before passing balance to store
- [ ] No balance is stored in Redux/Zustand from client-calculated values — only from server responses

**Test to run**: `jest tests/unit/balanceSigning.test.ts` — all 8 should pass.

---

## 3. IAP Receipt Validation

- [ ] Receipt validated with Apple/Google server API before DB write
- [ ] `receiptHash` inserted atomically with balance update in single `prisma.$transaction`
- [ ] `receiptHash UNIQUE` constraint catches replays (P2002 → 409)
- [ ] `productId` mapped to `coinsGranted` via `IAP_PRODUCTS` — no client-supplied coin amount
- [ ] `platform` field validated: "apple" → Apple API; "google" → Play API (never cross-validated)
- [ ] `finishTransaction({ isConsumable: true })` always called in mobile, even on backend failure

**Test to run**: `jest tests/integration/security.test.ts` (IAP replay section).

---

## 4. Authentication & Session Security

- [ ] All non-`/health` routes use `requireAuth` middleware
- [ ] JWT verified with `jwt.verify(token, config.JWT_SECRET)` — no `{ algorithms: ['none'] }` bypass
- [ ] Nonce is single-use: fetched from backend, used once, invalidated after auth verify
- [ ] `sessionId` is backend-generated UUID — client cannot supply or guess it
- [ ] Session state transitions enforced: `ACTIVE → AWAITING_DRAW → ACTIVE` (cannot re-draw a completed hand)
- [ ] `userId` from JWT is used for DB queries — client-supplied userId is ignored
- [ ] Session `userId` matches authenticated `userId` before any game operation

**Test to run**: `jest tests/integration/auth.test.ts` and `jest tests/integration/security.test.ts` (auth section).

---

## 5. Smart Contract Review

For any Solidity change, check:

- [ ] New functions have appropriate role modifiers (`onlyRole(MINTER_ROLE)`, `onlyRole(DEFAULT_ADMIN_ROLE)`)
- [ ] State-changing functions not marked `nonReentrant` are reviewed for reentrancy paths
- [ ] `require()` conditions are at the top of functions (checks-effects-interactions pattern)
- [ ] No `tx.origin` used for authorization (use `msg.sender`)
- [ ] Integer overflow not possible (Solidity 0.8+ auto-reverts, but check for intentional unchecked blocks)
- [ ] Events emitted for all significant state changes (audit trail)
- [ ] New functions covered by Hardhat tests

**Test to run**: `cd contracts && npx hardhat test`

---

## 6. Rate Limiting & DoS Protection

- [ ] `express-rate-limit` applied to all sensitive routes in `app.ts`
- [ ] Cashout rate limit: ≤ 5 per UTC day per userId (DB count check in `/game/cashout`)
- [ ] Game session rate limit: max 60 req/min per IP (via `gameLimiter` in `app.ts`)
- [ ] Auth route rate limit: max 10 req/min per IP (via `authLimiter`)
- [ ] Rate limits correctly skipped in `NODE_ENV === "test"` (via `skip` option)

---

## 7. Error Handling & Information Disclosure

- [ ] Error handler (`middleware/errorHandler.ts`) strips stack traces from production responses
- [ ] `AppError` is used for known failure modes — no raw `throw new Error()` with internal details
- [ ] Prisma errors other than P2002 are caught and re-wrapped before reaching client
- [ ] No wallet addresses, userIds, or sessionIds leaked in error messages
- [ ] 404 responses do not distinguish "user not found" from "unauthorized" (prevents user enumeration)

---

## 8. Secrets & Config

- [ ] No secrets in source code (`grep -r "sk_" . --include="*.ts"` returns nothing)
- [ ] All secrets accessed via `config.XXXX` from `src/config/index.ts` which reads `process.env`
- [ ] `.env` is in `.gitignore`
- [ ] `JWT_SECRET` is ≥ 32 chars (enforced by Zod schema in `config/index.ts`)
- [ ] `MINTER_PRIVATE_KEY` is `optional()` — contract calls are skipped if not set (safe for CI/test)

---

## 9. On-Chain Security Checklist

For any PR touching contract interaction or `mintOrchestrator.ts`:

- [ ] `mintVoucher()` only callable after DB debit committed — no coins credited before mint initiates
- [ ] `commitPurchase()` failure is logged but non-fatal — coins already credited, receipt unique constraint holds
- [ ] `MINTER_ROLE` hot wallet has minimal MATIC balance (enough for ~1,000 txs)
- [ ] Batch commitment service flushes on server shutdown (`flushPendingCommitments()` in graceful shutdown)
- [ ] `tokenId` parsing from receipt logs is tested (currently uses `log.topics[3]` — verify with ABI)

---

## 10. Mobile Client Security

- [ ] No plaintext storage of JWT or wallet address (SecureStore only)
- [ ] `EXPO_PUBLIC_BALANCE_VERIFY_KEY` not set to a dummy value in production build
- [ ] All API base URLs come from `Constants.expoConfig?.extra?.apiUrl` — no hardcoded prod URLs
- [ ] `react-native-iap` `purchaseUpdatedListener` tears down on unmount
- [ ] No sensitive data logged to console in production (`__DEV__` gates)
- [ ] Deeplink handling validates the host before processing (prevents open redirect)

---

## Sign-off

Complete this table before marking the PR ready for merge:

| Section | Reviewer | Date | Notes |
|---------|----------|------|-------|
| 1. Threat Model | | | |
| 2. Balance Integrity | | | |
| 3. IAP Receipt | | | |
| 4. Auth & Sessions | | | |
| 5. Smart Contract | | | |
| 6. Rate Limiting | | | |
| 7. Error Handling | | | |
| 8. Secrets & Config | | | |
| 9. On-Chain Security | | | |
| 10. Mobile Client | | | |

**Reviewer sign-off**: All applicable sections reviewed. No unresolved issues.
