# ADR-001: ERC-1155 Voucher Design for NFT Proxy Gamble

**Status**: Accepted
**Date**: 2026-05-22
**Deciders**: Grok (Secondary PM) + Claude (Lead Dev)

## Context
We need a token standard to represent redeemable coin balances as self-custodial NFTs. The token must support:
- Unique vouchers with different coin values
- On-chain immutable value storage (security critical)
- Easy P2P transfer
- Efficient redemption to USDC

## Decision
We chose **ERC-1155** over ERC-721 for the following reasons:

### Why ERC-1155
- Semi-fungible nature allows future batch operations if needed
- Lower gas cost for multiple similar vouchers compared to 721
- Native support for `safeBatchTransferFrom`
- Still allows unique tokenIds per voucher

### Key Design Choices
1. **On-chain `coinBalance` mapping** (immutable)
   - Security: Metadata can be updated, but value cannot be tampered with
   - Auditability: Anyone can verify the true redeemable amount
2. **MINTER_ROLE** restricted to backend
   - Prevents unauthorized minting
3. **Pausable + ReentrancyGuard**
   - Defense in depth for production
4. **USDC decimal handling**: 100 coins = 1 USDC (6 decimals)

### Trade-offs
- Slightly more complex than pure ERC-721
- Requires careful USDC liquidity management in the contract

## Consequences
- Backend must track minted tokenIds and user ownership
- Redemption is atomic and trust-minimized
- Future games can use the same contract with different `gameType` strings

## Alternatives Considered
- ERC-721: Rejected due to higher gas for batch operations and no native semi-fungibility
- Custom token: Rejected for lack of wallet/NFT marketplace compatibility

**Next Review**: After Phase 4 integration testing

---

## Phase 1 Implementation Notes (appended 2026-05-22, post Issue #1)

The following refinements were applied during Phase 1 implementation. None of them alter the **Decision** or **Trade-offs** sections above; they are concrete narrowings driven by review of the implementation, owner sign-off on six pre-plan questions in Issue #1, and a math bug found during the first green test run.

### Storage / Interface
- `gameType` mapping changed from `string` to **`bytes32`**. Saves ~20k gas per mint and lets indexers filter `VoucherMinted` events by `gameType` (indexed). Backend canonicalises with `ethers.encodeBytes32String("jacks-or-better-9-6")`. Documented in `docs/BACKEND_INTEGRATION_POINTS.md`.
- `sessionId` event arg changed from `uint256` to **`bytes32`**. Same rationale; lets the backend pass arbitrary canonical session identifiers (e.g. `encodeBytes32String(uuid.slice(0, 30))`).
- `VoucherMinted` signature: `(uint256 indexed tokenId, address indexed to, uint256 coinAmount, bytes32 indexed gameType, bytes32 sessionId)`.

### Economic Bounds (on-chain enforcement)
- `MAX_COIN_BALANCE = 100_000` — matches `BUSINESS_RULES.md` "Max Single Cashout" (100,000 coins ≈ $1,000). Hard ceiling; runaway-mint guardrail even if backend is compromised.
- `MIN_COIN_BALANCE = 100` — matches `BUSINESS_RULES.md` "Min Cashout 100 coins (1 USDC) to avoid dust". Single bound replaces both the earlier ad-hoc `coinAmount > 0` and the abandoned `% 100 == 0` check (see "Math" below).
- `COINS_PER_USDC = 100` and `USDC_UNITS_PER_COIN = 10_000` exposed as `public constant`.

### Math
The first version of the contract computed `usdcAmount = coins / COINS_PER_USDC`, which returns the **dollar-integer count** (e.g. 5 for 500 coins) and silently underpays USDC by a factor of 10⁶ since USDC has 6 decimals. The fix:

```solidity
uint256 public constant USDC_UNITS_PER_COIN = 10_000;  // 10**6 / 100
uint256 usdcAmount = coins * USDC_UNITS_PER_COIN;       // exact, no truncation
```

This produces exact USDC raw units for any `coinAmount ∈ [100, 100_000]`. As a side-effect, the previously-proposed defensive `coinAmount % 100 == 0` requirement is no longer needed (truncation is impossible) and was dropped — it would have prevented legitimate non-round cashouts (e.g. a 350-coin balance after a 9/6 video poker session).

### USDC Transfer Hardening
- Migrated from raw `IERC20.transfer` to **`SafeERC20.safeTransfer`** for portability and tail-risk reduction (handles non-standard ERC-20s and bubbles return-value bugs).

### Admin Surface
- Added `emergencyWithdrawUSDC(uint256 amount, address to)` gated by `DEFAULT_ADMIN_ROLE`, emitting `EmergencyWithdrawal(to, amount)`. Required for: contract migration (Phase 5), liquidity rebalancing, and as a regulator-response path. **Phase 5 will move admin to a Gnosis Safe and consider adding a timelock on this function.**

### Pause Semantics (explicit)
- `_pause` gates **only `mint` and `redeem`**. ERC-1155 transfers are intentionally not paused so holders can always move their assets even during a regulatory pause. Documented in code comments and asserted by test T25.

### Test Hardening
- 34 tests covering happy/sad paths, P2P transfer, reentrancy guard (via `ReentrantERC20` mock), MAX/MIN boundaries, role revocation, pause semantics, `emergencyWithdrawUSDC` admin + zero-recipient, supportsInterface for ERC-1155 / metadata / AccessControl, gas snapshots (mint < 150k, redeem < 80k), and a fast-check property test over 20 random valid `coinAmount` values.
- Coverage on `NFTProxyVoucher.sol`: **statements 100%, branches 97.06%, functions 100%, lines 100%** — exceeds the `docs/DEVELOPMENT_MEMORY.md` §3 gates.

### EVM Target
- Compiler `0.8.24` with `evmVersion: "cancun"` (required because OZ v5 `utils/Arrays.sol` uses the `mcopy` instruction added in Cancun). Polygon PoS supports Cancun.

### Deferred to v1.1 / later phases
- Removal of `delete coinBalance[tokenId]` on redeem to preserve on-chain audit trail (Q from Claude in `GROK_FEEDBACK.md`). Gas refund retained for v1; event log is the audit source for now.
- Per-token URI override (per-NFT art).
- Timelock on `emergencyWithdrawUSDC`.
- Multi-sig (Gnosis Safe) for `DEFAULT_ADMIN_ROLE` and `MINTER_ROLE` — Phase 5.
