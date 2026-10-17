# NFTProxyVoucher contract hardening, October 2026

Status: implemented on `feat/studio-polish` and tested locally (in-process hardhat). **Not deployed anywhere.** You need a new deployment because the constructor and storage layout changed.

Files changed: `contracts/src/NFTProxyVoucher.sol`, `contracts/test/NFTProxyVoucher.test.ts`, `contracts/test/NFTProxyVoucher.hardening.test.ts` (new), `contracts/scripts/deploy.ts`, `contracts/scripts/grant-minter.ts`.

## 1. Findings (red team, confirmed on a local deployment)

| ID | Sev | Finding | Fix |
|---|---|---|---|
| C-1 | Critical | `DEFAULT_ADMIN` could `grantRole(MINTER)` to itself and loop mint+redeem until the USDC float was gone. This skipped the 24h emergency-withdraw timelock, so H-4 only looked like protection. | MINTER/PAUSER grants now go through a 24h queue that the guardian can cancel. Admin handover uses `AccessControlDefaultAdminRules` with a 48h minimum delay. The admin can never hold MINTER. |
| C-2 | Critical | A compromised minter key drained 100% of liquidity in 1–2 blocks. There was no rate limit and no liability tracking. | Rolling `dailyMintCapCoins` plus a solvency invariant: a minter can only mint against USDC that holders are not already owed. |
| H-2 | High (on-chain part) | No idempotency, so a backend retry could mint the same cashout twice. | `sessionId` can be used once. A reused one reverts with `"Session id already used"`. |
| M-1 | Medium | No liability accounting. An emergency withdrawal could make the contract insolvent. | `outstandingCoins` is tracked. Emergency withdrawal is limited to `freeLiquidity()` and re-checked when executed. |
| M-2 | Medium | Pause did not stop transfers, and there was no way to void attacker-minted vouchers. | Guardian can freeze, quarantine and void. Frozen tokens can't be transferred or redeemed. |
| L-4 | Low | The backend truncates `sessionId` to 31 bytes (`encodeBytes32String(sessionId.slice(0,31))`). | The contract accepts any non-zero bytes32 and enforces uniqueness. **The backend must hash instead** (see section 3). |

## 2. Design

### 2.1 Roles (C-1)
- **DEFAULT_ADMIN** uses OZ `AccessControlDefaultAdminRules`. Admin moves only by `beginDefaultAdminTransfer` and then `acceptDefaultAdminTransfer` at least **48h** later. `_changeDefaultAdminDelay` is overridden to reject any delay under 48h. `grantRole` and `revokeRole` on DEFAULT_ADMIN revert, as OZ's rules require.
- **MINTER_ROLE / PAUSER_ROLE**: `grantRole` reverts with `RoleGrantRequiresTimelock(role)`. The flow is:
  1. The admin calls `proposeRoleGrant(role, account)`. It emits `RoleGrantProposed(role, account, proposer, eta)`, with `eta = now + 24h`.
  2. The admin or the guardian can call `cancelRoleGrant(role, account)` during the window. This is the guardian's veto.
  3. The **same** admin that proposed calls `executeRoleGrant(role, account)` after `eta`. Because it must be the proposer, an admin handover invalidates the old admin's queued grants.
- **Revoke and renounce are immediate** for MINTER and PAUSER. This is deliberate, for safety.
- **Invariant: the admin never holds MINTER.** `_grantRole` reverts with `AdminCannotBeMinter` when granting MINTER to `defaultAdmin()`, or DEFAULT_ADMIN to a MINTER holder. That covers the constructor, `executeRoleGrant` and `acceptDefaultAdminTransfer`.
- The initial minter and pauser are set in the constructor. Deployment is atomic and public, and the contract holds no liquidity at that point.

What happens if the admin key is compromised now: the attacker must propose a minter, which is visible on-chain for 24h and can be vetoed by the guardian. The attacker could revoke the guardian first, but that is instant and visible too (alert on `RoleRevoked`). Even then, the new minter is bounded by the cap and the solvency invariant. Emergency withdrawal is bounded by `freeLiquidity()`. **Holder liabilities are never at risk from the admin or the minter.** The most they can take is the house float above liabilities: at most one cap's worth instantly, refilling at cap per 24h, after a 24h warning.

### 2.2 Rolling mint cap (C-2)
- The cap is a leaky bucket. The level rises by each mint's `coinAmount` and drains linearly at `dailyMintCapCoins / 24h`. A mint reverts with `"Daily mint cap exceeded"` if `level + coinAmount > cap`.
- Guarantees: a burst is at most `cap`. Any time span `T` allows at most `cap + cap*T/24h`, so any 24h window allows at most 2× cap. This is sound with no unbounded state. A strict sliding window would need a ring buffer and several extra SSTOREs per mint, which would break the 150k gas budget.
- `setDailyMintCap(newCap)`: a **decrease applies instantly** and also cancels any pending increase. Setting it to 0 is a mint kill-switch that is independent of pause. An **increase is queued for 24h**: run `executeDailyMintCapIncrease()`, or cancel with `cancelDailyMintCapIncrease()` (admin or guardian).
- The per-mint limits are unchanged: 100 to 100,000 coins.
- For the backend: `mintBudgetAvailable()` returns how many coins can be minted right now.

### 2.3 Solvency invariant (M-1)
- `outstandingCoins` goes up by `coinAmount` on mint and down on redeem and on void.
- `mint` requires `usdc.balanceOf(this) >= (outstandingCoins + coinAmount) * 10_000`, otherwise it reverts with `"Insufficient backing"`.
- `freeLiquidity() = balance - outstandingCoins*10_000` (floored at 0). `initiateEmergencyWithdrawal` requires `amount <= freeLiquidity()`, and **`executeEmergencyWithdrawal` re-checks it**, because vouchers minted during the 24h delay are protected too. When every voucher has been redeemed, `outstandingCoins == 0` and the whole balance can be withdrawn.
- The admin or the guardian can now cancel a pending emergency withdrawal.
- With only contract code paths, `balance >= liabilities` always holds. It could break only through an action of the token issuer, such as Circle blacklisting or seizing the contract's USDC.

### 2.4 Idempotency (H-2, L-4)
- Each session ID is stored as `sessionId => tokenId + 1` and never cleared. A session mints at most once, even after its voucher is redeemed.
- A mint that reverts (cap, backing, pause) does **not** use up the sessionId, so it can be retried safely.
- Views: `usedSessionId(bytes32) → bool` and `tokenIdForSession(bytes32) → uint256` (which reverts for unknown IDs).

### 2.5 Incident response (M-2). Guardian = `PAUSER_ROLE`
| Action | Who | Precondition | Effect |
|---|---|---|---|
| `freezeToken(id)` / `freezeTokens(ids[])` | guardian | **paused** | Token can't be transferred or redeemed. Records `frozenAt`. |
| `quarantine(fromId)` | guardian | **paused** | One transaction freezes every token in `[fromId, nextTokenId)`. Tokens minted later are not affected. |
| `liftQuarantine()` | admin | none | Clears the range. |
| `unfreezeToken(id)` | admin | none | Reverses a freeze. This is the check on a mistaken or compromised guardian. |
| `voidToken(holder, id)` | guardian | explicitly frozen for at least `VOID_DELAY` (24h) | Burns the token, decrements `outstandingCoins`, clears its state, emits `VoucherVoided`. |

Why this design:
- **Pause still lets transfers through.** Users keep custody of healthy vouchers, which T25 covers. Pausing already stops all redemption, so attacker vouchers can't be cashed during an incident.
- **Quarantine by ID range is the simplest sound design** for freezing "everything minted after the incident block". Token IDs increase monotonically, so a single range check is O(1) and costs nothing on mint. The upper bound is fixed when the guardian calls it, so honest mints after unpausing are never caught. Freezing tokens one by one would need thousands of transactions in a bad incident (cap ÷ 100-coin minimum).
- **Void requires an explicit freeze plus a 24h delay**, so a compromised guardian can't destroy holder claims before the admin Safe can unfreeze. Void does **not** require pause: the token is already inert, and requiring pause would block honest redemptions for 24h or more.
- `voidToken` takes `holder` because ERC-1155 has no `ownerOf`. A frozen token can't move, so the holder seen in the reconciliation snapshot stays correct.

Incident runbook:
1. `pause()`.
2. `quarantine(firstSuspectTokenId)`.
3. Revoke the compromised role (instant).
4. Reconcile `VoucherMinted` sessionIds against the backend DB.
5. `freezeTokens(badIds)`.
6. `liftQuarantine()` from the Safe.
7. `unpause()`.
8. After 24h, `voidToken(holder, id)` for each bad ID.

### 2.6 Storage / gas
Per-token data (`coins uint32`, `mintedAt uint40`, `frozenAt uint40`, `flags uint8`) is packed into one slot. The global state (`nextTokenId`, `outstandingCoins`, bucket level, bucket timestamp) shares a second slot, and the config (cap plus quarantine range) a third. The `coinBalance(uint256)` and `mintedTimestamp(uint256)` getters are now explicit view functions with **the same selectors and return types** as before. The global slot is initialised to a non-zero value in the constructor, so the first mint no longer pays a 20k cold-to-dirty SSTORE.

| op (hardhat gas reporter) | before | after | budget |
|---|---|---|---|
| mint (avg / max) | 145,511 / 146,901 | 141,349 / 141,486 | < 150k |
| redeem (avg / max) | 70,540 / 70,967 | 73,833 / 74,845 | < 80k |
| safeTransferFrom | 52,290 | 57,347 (frozen check) | n/a |
| commitPurchase | 26,979 | 27,033 | < 50k |
| deployment | 2.31M | 4.42M (runtime 18.9 KB, under 24 KB) | n/a |

Redeem costs about 4k more because of the `outstandingCoins` update and the quarantine slot read, and it gets one fewer storage-clear refund. Mint got cheaper despite the extra session-ID slot, the bucket and the `balanceOf` call, thanks to the slot packing.

## 3. ABI changes for the backend team

**Unchanged** (no code change needed to keep working): `mint(address,uint256,bytes32,bytes32) returns (uint256)`, `commitPurchase(address,uint256,bytes32)`, `redeem(uint256)`, the `VoucherMinted` and `PurchaseCommitted` event signatures and indexing, `coinBalance(uint256)`, `mintedTimestamp(uint256)`, `gameType(uint256)`, `pendingWithdrawal()`, and the emergency-withdrawal function signatures.

**Required backend changes:**
1. **Session ID encoding (L-4).** Replace `encodeBytes32String(sessionId.slice(0, 31))` (`backend/src/services/mintOrchestrator.ts:68`) with `ethers.keccak256(ethers.toUtf8Bytes(sessionId))`. Truncating can make two sessions collide, and now that uniqueness is enforced on-chain, a collision makes the second cashout revert. Log the bytes32 next to the session row. `gameType` truncation is harmless and can stay.
2. **Handle the new mint reverts:**
   - `"Session id already used"`: an idempotent success. Call `tokenIdForSession(sid)`, or find the earlier `VoucherMinted` event, and mark the cashout complete. Don't retry with a new sessionId.
   - `"Daily mint cap exceeded"`: retry later. Check `mintBudgetAvailable()` first and queue the cashout. Alert if this persists.
   - `"Insufficient backing"`: the contract needs more USDC float. Alert ops; it is not retryable until funded.
   - `TokenIsFrozen(uint256)` (custom error) on redeem or transfer.
3. Optional pre-flight views: `mintBudgetAvailable()`, `freeLiquidity()`, `outstandingCoins()`, `usedSessionId(bytes32)`.

**Changes for deploy / ops tooling:**
- Constructor: `constructor(address usdc)` becomes `constructor(address usdc, address initialAdmin, uint256 dailyMintCapCoins, address initialMinter, address initialPauser)`.
- `grantRole(MINTER_ROLE|PAUSER_ROLE, …)` now **reverts**. Use `proposeRoleGrant` → 24h → `executeRoleGrant` (see `scripts/grant-minter.ts`, which prints Safe calldata when the signer isn't the admin).
- `cancelEmergencyWithdrawal` can now also be called by PAUSER.
- New functions: `proposeRoleGrant`, `executeRoleGrant`, `cancelRoleGrant`, `pendingRoleGrant`, `setDailyMintCap`, `executeDailyMintCapIncrease`, `cancelDailyMintCapIncrease`, `pendingDailyMintCap`, `dailyMintCapCoins`, `mintBudgetAvailable`, `outstandingCoins`, `totalLiabilitiesUsdc`, `freeLiquidity`, `nextTokenId`, `usedSessionId`, `tokenIdForSession`, `freezeToken`, `freezeTokens`, `unfreezeToken`, `quarantine`, `liftQuarantine`, `quarantineRange`, `isFrozen`, `voidToken`, and all of OZ `IAccessControlDefaultAdminRules` (`defaultAdmin`, `beginDefaultAdminTransfer`, `acceptDefaultAdminTransfer`, `changeDefaultAdminDelay`, …).
- New events to add to monitoring (alert on every one): `RoleGrantProposed`, `RoleGrantCancelled`, `RoleGrantExecuted`, `RoleRevoked`, `DefaultAdminTransferScheduled`, `DailyMintCapIncreaseProposed`, `DailyMintCapChanged`, `TokenFrozen`, `QuarantineSet`, `VoucherVoided`, `EmergencyWithdrawalInitiated`.
- Changed revert: `initiateEmergencyWithdrawal` / `executeEmergencyWithdrawal` can now revert with `"Exceeds free liquidity"`.

## 4. Migration (new deployment required)
The old Amoy deployment (`contracts/deployments/amoy.json`) can't be upgraded: it isn't a proxy, and the storage layout changed. The team must:
1. On the **old** contract: `pause()`. This stops new mints and redemptions. Its USDC float is still exposed to the old admin key (C-1), so move it promptly.
2. Snapshot the outstanding vouchers on the old contract (VoucherMinted minus VoucherRedeemed).
3. Deploy the new contract with `scripts/deploy.ts`, with `ADMIN_SAFE` set to the Safe, and fund it.
4. For each outstanding old voucher, choose one:
   - **(a) Re-mint:** the backend mints a replacement on the new contract (new sessionId = `keccak256("migrate:" + oldContract + ":" + tokenId)`) and keeps the old token as void. This requires the old contract to stay paused permanently, and the cap must be sized for the migration batch.
   - **(b) Redeem-out window:** unpause the old contract briefly so holders can redeem, then pause.
   
   On a testnet, option (a) or simply abandoning the testnet vouchers is fine.
5. Withdraw the remaining old float with `initiateEmergencyWithdrawal` → 24h → `executeEmergencyWithdrawal` (the old contract has no free-liquidity cap, so make sure the snapshotted liabilities are honoured first). Then revoke all roles on the old contract.
6. Point `CONTRACT_ADDRESS` in the backend at the new address after the backend changes in section 3 have shipped.

## 5. Operational checklist
- [ ] **Admin = Gnosis Safe**, at least 2-of-3 (mainnet 3-of-5), with hardware-wallet signers held by different people. `deploy.ts` refuses an EOA admin on mainnet, and on any public network unless `ALLOW_EOA_ADMIN=YES` is set.
- [ ] **Deployer EOA holds no role.** `deploy.ts` asserts this and fails loudly otherwise. Throw the deployer key away or archive it after the deploy.
- [ ] **Minter = KMS-backed key** (AWS KMS / GCP KMS secp256k1, with no exportable key material), used only by the mint service. Different from the Safe and from the guardian (the script enforces this).
- [ ] **Guardian (PAUSER)** is a separate on-call key or a 1-of-N Safe for fast response. It can pause, freeze, quarantine, void (after 24h), and veto role grants, cap increases and emergency withdrawals. It can't move funds.
- [ ] **Cap sizing.** Set `dailyMintCapCoins` to about 1.5× the p99 daily cashout volume, in coins. The worst-case loss from a minter key is `min(free float, cap + cap*T/24h)` over a detection time `T`, so also keep the **free float** (balance minus liabilities) small: top it up just in time instead of parking large reserves.
- [ ] **Monitoring.** Alert on every event in section 3. Also alert when `freeLiquidity()` drops below threshold, when `mintBudgetAvailable()` falls under 20% of the cap, and when `VoucherMinted.sessionId` is not in the backend DB. That last one is the reconciliation trigger for incident response.
- [ ] **Shadow period.** Run the backend against the new contract on Amoy for at least 50 cashouts, including forced retries (to test idempotency) and a cap-exhaustion drill. Then go to mainnet, with human approval.
- [ ] Run an incident drill on testnet: pause → quarantine → freezeTokens → liftQuarantine → unpause → void after 24h.

## 6. Tests
`cd contracts && npx hardhat test` gives **65 passing**: 45 existing and 20 new in `test/NFTProxyVoucher.hardening.test.ts`.

The new tests cover:
- C-1 (instant grant reverts; admin can't be minter; PoC1 replay is vetoed)
- C-2 (the mint+redeem loop stops at the cap, or at free liquidity when the cap is too large, and the honest holder stays whole)
- the leaky-bucket refill
- the cap decrease, increase, cancel and kill-switch
- solvency accounting
- idempotency (including surviving a redeem, and a reverted mint not using up the ID)
- freeze, unfreeze, void, quarantine
- the role-grant timelock
- the 48h admin handover and the delay floor
- the emergency-withdraw cap re-checked at execute
- the gas budget

Existing tests that I changed, and why:
- **Fixture, T22, T29, T32:** they use the new constructor. MINTER and PAUSER are set in the constructor because instant `grantRole` now reverts.
- **T13:** it used to drain the whole float through emergency withdrawal and then expect redeem to fail. That path is now impossible by design (M-1), so the test now asserts that the withdrawal is capped and the holder is paid.
- **T24:** the second mint uses a different sessionId, because a sessionId can now be used only once (H-2).
