# Rollback Playbook

When to use this doc: a recent change is suspected of causing user-visible problems and you need to back it out fast. Each section is a self-contained recipe for one specific change, ordered from most-recent first.

For each recipe:
- **Symptom**: what you'll see in the wild if this needs rollback
- **Revert command**: exact git command
- **Rebuild + verify**: how to confirm the rollback worked
- **Side effects**: anything that doesn't auto-revert (DB rows, on-chain state)

---

## How to revert any single commit on main

```bash
# Find the commit by message or hash
git log --oneline -20

# Create a revert commit (preserves history, undoes the change)
git revert <commit-sha>

# Push
git push origin main
```

This is **safer than `git reset --hard`** because it leaves an audit trail. Only use `reset --hard` if the commit was pushed by mistake and never used.

---

## 1. Refactor: /auth/confirm-age uses requireAuth middleware (`0ccdf82`)

**Symptom**: `/auth/confirm-age` returns 401 even with a valid JWT, or accepts requests without a token.

**Revert command**:
```bash
git revert 0ccdf82
```

**Rebuild + verify**:
```bash
cd backend && npm run build
curl -X POST http://your-backend/auth/confirm-age -H "Authorization: Bearer <valid-jwt>"
# Expect 200 with {"ageConfirmed": true}
```

**Side effects**: None. Pure refactor with same external behavior.

---

## 2. B-3 fix: /game/draw double-payout race (`89ec15a`)

**Symptom**: legitimate /game/draw requests return 409 "Session draw already resolved" when they should succeed.

**Revert command**:
```bash
git revert 89ec15a
```

**Rebuild + verify**: Backend should accept a single /draw per session. Note: reverting RE-OPENS the double-payout exploit, so do this only if the new code is genuinely broken AND you can monitor for double-payout attempts.

**Side effects**: None at code level. If exploit was used in the meantime, the audit trail in `Transaction` table will show duplicate GAME_WIN rows with the same sessionId.

---

## 3. UX fix: mobile auto-disconnect on 401 (`fe5c565`)

**Symptom**: mobile users get logged out unexpectedly on minor server errors (e.g. transient 401 from edge network).

**Revert command**:
```bash
git revert fe5c565
```

**Rebuild + verify**: Mobile EAS dev build, hit any 401 from backend, observe that wallet store still says `isAuthenticated: true`.

**Side effects**: Reverting brings back the original UX issue: stale "authenticated" state with no way to recover except manually disconnecting from the Profile tab. The fix is correct for known cases (JWT expiry, JWT_SECRET rotation); if there's a false-positive 401 we need to find which endpoint triggers it.

---

## 4. Perf: DB indexes + conditional NFT polling (`dce3234`)

**Symptom**: Mobile NFT screen stops polling when it shouldn't (e.g. user expects PENDING → MINTED transition to show without refresh).

**Revert command**:
```bash
git revert dce3234
```

**Rebuild + verify**: Mobile NFT screen polls every 30s unconditionally. Note: the DB indexes are also reverted in the Prisma schema, but to drop the indexes from Supabase you must run:
```sql
DROP INDEX IF EXISTS "Transaction_userId_type_createdAt_idx";
DROP INDEX IF EXISTS "NFTVoucher_userId_createdAt_idx";
```

**Side effects**:
- The indexes themselves do not affect correctness — only performance.
- Reverting only the application code while keeping the indexes is fine (Postgres ignores unused indexes during writes; they cost minimal storage).
- Generally **don't revert this commit** unless something specific is broken; the indexes are a clear win and the polling change is a battery win.

---

## 5. B-2 fix: tokenId parsed from VoucherMinted (`a10f36e`)

**Symptom**: New NFT vouchers minted after the fix show `tokenId: "0"` or unexpected values, breaking redemption.

**Revert command**:
```bash
git revert a10f36e
```

**Rebuild + verify**: Mint a voucher on Amoy, check that `nftVoucher.tokenId` in the DB matches the actual on-chain tokenId.

**Side effects (IMPORTANT)**:
- Reverting RE-INTRODUCES the bug where every minted NFT gets a garbage multi-decillion `tokenId` parsed from the recipient address. **All redemptions fail.**
- Any vouchers minted BEFORE this fix (`a10f36e`) have garbage `tokenId` values in the DB. They are unredeemable through the app. The contract itself is fine — `_tokenIdCounter` in the contract is sequential — so the actual on-chain tokenIds exist. A manual DB repair script would need to walk `Transaction` events on-chain and update `NFTVoucher.tokenId` values per `sessionId` correlation.

**This commit should not be rolled back unless it's actively producing wrong tokenIds in some new edge case we missed.**

---

## 6. B-1 fix: balance-decrement TOCTOU (`099b9a5`)

**Symptom**: legitimate /game/deal or /game/cashout requests return 402 / 409 when the user clearly has sufficient balance.

**Revert command**:
```bash
git revert 099b9a5
```

**Rebuild + verify**: Reverting RE-INTRODUCES the parallel-cashout exploit. Only do this if there's a clear false-positive blocking legitimate users. Look at backend logs: how often is P2025 thrown vs successful calls? If P2025 is sometimes thrown when balance is actually sufficient, there might be a Prisma version compatibility issue with the `where: { coinBalance: { gte: required } }` syntax.

**Side effects**:
- If exploit was used during the rollback window, check `Transaction` table for any rows where `balanceAfter < 0`, or `User.coinBalance < 0`. Those need manual investigation and possibly DB correction.

---

## 7. SDK 54 upgrade (`9afff2b`)

**Symptom**: major mobile app breakage — Metro won't start, app crashes on launch, large numbers of new bugs.

**Revert command** (DANGEROUS — large diff):
```bash
git revert -m 1 9afff2b
```

The `-m 1` flag is required because this was a merge commit (squash of objective-grothendieck branch).

**Rebuild + verify**:
```bash
cd mobile
npm install --legacy-peer-deps
npx tsc --noEmit
npx expo start --no-dev --offline
```

**Side effects**:
- Reverting downgrades Expo 54 → 51, RN 0.81 → 0.74, React 19 → 18.2.
- **Breaks the production phone app** — iOS Expo Go is SDK 54-only. After revert, only Android Expo Go users + custom dev builds can run the app.
- Restores `react-native-iap@12` peer-dep failure on RN 0.81.
- Don't revert this unless you have a backup plan (e.g. rebuilding on a different RN version).

---

## 8. Supabase pooler URL in `.env.example` (part of `9afff2b`)

**Symptom**: Backend can't connect to Supabase from CI / dev machines.

This isn't reverted by `git revert` — it's an env-level change. To roll back:
- Edit `backend/.env` to point to local Docker Postgres
- Or use the direct Supabase URL (only works on IPv6 networks): `postgresql://postgres:[pw]@db.yzodntgnaydfkqvibmff.supabase.co:5432/postgres`

---

## Database rollback (DDL changes)

The new indexes on `Transaction` and `NFTVoucher` are non-destructive — keeping them when reverting application code is fine.

If for some reason you need to drop them:

```sql
-- Connect to Supabase via psql or the SQL editor
DROP INDEX IF EXISTS "Transaction_userId_type_createdAt_idx";
DROP INDEX IF EXISTS "NFTVoucher_userId_createdAt_idx";
```

The 6 tables and 4 enums from the initial schema migration are NOT documented as rollback targets here because dropping them would wipe all user data. If a schema rollback is truly needed:
1. Take a Supabase snapshot via dashboard FIRST
2. Use Supabase MCP `apply_migration` with reverse DDL
3. Have a written restore plan

---

## On-chain rollback

There is no rollback for contract state. If the deployed contract behaves wrong:
1. Pause it: call `pause()` from the admin wallet (`onlyRole(PAUSER_ROLE)`). This blocks new mints + redeems but allows transfers, so users can still move tokens.
2. Deploy a new contract with the fix
3. Migrate state by:
   - Snapshotting on-chain `coinBalance[tokenId]` for all live tokens
   - Re-minting on the new contract
   - Burning old tokens (requires user signatures)

**Realistically**: pause + announce, then ship a new contract and ask users to redeem within a deadline. The current contract's `coinBalance` mappings are unbounded so there's no fund-loss risk from pausing.

---

## Verification after any rollback

After any rollback, run:

```bash
# Contracts
cd contracts && npm run compile && npm test

# Backend
cd backend && npm run build && npm test -- --testPathPattern="unit"

# Mobile
cd mobile && npx tsc --noEmit && npm test
```

Expected on `main` HEAD `0ccdf82`:
- Contracts: 40/40
- Backend unit: 77/77
- Mobile: 81/81

If any of those numbers go down after a rollback, you've reverted more than you intended.
