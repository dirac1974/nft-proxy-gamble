# Backend Integration Points for NFTProxyVoucher

**Purpose**: Exact technical specifications so the backend team can integrate without guesswork.

**Last updated**: 2026-05-22 after Phase 1 implementation. See `docs/adr/001-erc1155-voucher-design.md` §"Phase 1 Implementation Notes" for rationale on each contract surface decision.

## Contract Addresses

| Network | Address |
|---|---|
| Polygon Amoy (testnet) | _To be filled after Phase 1 deploy — see `contracts/deployments/amoy.json`_ |
| Polygon mainnet | _Phase 6_ |

## Constants (read on-chain via auto-getters)

| Constant | Value | Purpose |
|---|---|---|
| `MIN_COIN_BALANCE` | `100` | Minimum coins per voucher (matches BUSINESS_RULES "min cashout") |
| `MAX_COIN_BALANCE` | `100_000` | Maximum coins per voucher (matches BUSINESS_RULES "max single cashout"; on-chain hard cap) |
| `COINS_PER_USDC` | `100` | Display-side ratio |
| `USDC_UNITS_PER_COIN` | `10_000` | On-chain math factor — `usdcAmount = coins * USDC_UNITS_PER_COIN` |
| `MINTER_ROLE` | `keccak256("MINTER_ROLE")` | Granted to backend hot wallet |
| `PAUSER_ROLE` | `keccak256("PAUSER_ROLE")` | Operator role; separate from admin |
| `DEFAULT_ADMIN_ROLE` | `0x00…00` | Role admin; must move to Gnosis Safe in Phase 5 |

## Core Functions

### 1. Mint Voucher (backend → contract, holds `MINTER_ROLE`)

```solidity
function mint(
    address to,
    uint256 coinAmount,
    bytes32 _gameType,
    bytes32 sessionId
) external onlyRole(MINTER_ROLE) whenNotPaused returns (uint256 tokenId);
```

**Validation enforced on-chain** (backend MUST also validate before calling to avoid wasted gas):

| Check | Revert message |
|---|---|
| `to != address(0)` | (OZ ERC-1155 internal) |
| `coinAmount >= MIN_COIN_BALANCE` | `"Below min coin balance"` |
| `coinAmount <= MAX_COIN_BALANCE` | `"Above max coin balance"` |
| `_gameType != bytes32(0)` | `"Invalid game type"` |
| `sessionId != bytes32(0)` | `"Invalid session id"` |
| Caller has `MINTER_ROLE` | `AccessControlUnauthorizedAccount` (custom error) |
| Not paused | `EnforcedPause` (custom error) |

**bytes32 canonicalisation** (TypeScript / ethers v6):

```ts
import { ethers } from "ethers";

const gameType = ethers.encodeBytes32String("jacks-or-better-9-6"); // max 31 ASCII bytes
const sessionId = ethers.encodeBytes32String(sessionUuid.slice(0, 31));
// Decode for display/logs:
const gameTypeStr = ethers.decodeBytes32String(gameType);
```

If a backend session UUID exceeds 31 bytes (full v4 UUIDs without hyphens are 32 chars and won't fit because `encodeBytes32String` reserves a null terminator), use either:

- A monotonic numeric session counter (`bytes32(uint256(counter))`)
- A keccak hash of the canonical session string (`ethers.id(sessionString)` → 32 bytes, full collision domain). **Recommended.** Store the original string in DB alongside the hash.

### 2. Redeem (user wallet → contract)

```solidity
function redeem(uint256 tokenId) external nonReentrant whenNotPaused;
```

User signs from their mobile wallet — **no backend involvement**. Backend listens for `VoucherRedeemed` to update analytics.

USDC paid out: `coinBalance[tokenId] * USDC_UNITS_PER_COIN` (raw units). Example: `5_000` coins → `5_000 * 10_000 = 50_000_000` raw units = `50.00` USDC.

## Admin Functions (production: Gnosis Safe required)

### `emergencyWithdrawUSDC(uint256 amount, address to)` — `DEFAULT_ADMIN_ROLE`
- Drains contract USDC to `to`. Used for: contract migration, liquidity rebalancing, regulator-mandated freeze response.
- Reverts with `"Zero recipient"` if `to == address(0)`.
- Emits `EmergencyWithdrawal(to, amount)`.
- **Phase 5 will add a timelock on this function**.

### `pause()` / `unpause()` — `PAUSER_ROLE`
- Pauses `mint` and `redeem`. **Does NOT pause `safeTransferFrom`** — users can always move their assets.

### `setURI(string)` — `DEFAULT_ADMIN_ROLE`
- Metadata-only. Cannot affect on-chain value.
- Emits no custom event (standard OZ behaviour); indexers should re-fetch metadata after admin tx.

### `grantRole / revokeRole / renounceRole` — `DEFAULT_ADMIN_ROLE`
- Standard OZ `AccessControl`. Use `revokeRole(MINTER_ROLE, oldHotWallet)` for key rotation.

## Events (Listen For)

```solidity
event VoucherMinted(
    uint256 indexed tokenId,
    address indexed to,
    uint256 coinAmount,
    bytes32 indexed gameType,
    bytes32 sessionId
);

event VoucherRedeemed(
    uint256 indexed tokenId,
    address indexed redeemer,
    uint256 usdcAmount
);

event EmergencyWithdrawal(address indexed to, uint256 amount);

// Inherited (OZ):
event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
event Paused(address account);
event Unpaused(address account);
```

`gameType` and `to` are indexed for efficient subgraph / Alchemy filtering. `sessionId` is **not** indexed (already 1-to-1 with `tokenId`).

## Public Storage Getters

- `coinBalance(uint256) -> uint256` — set to `coinAmount` at mint; **deleted on redeem** (v1; v1.1 may retain for audit).
- `gameType(uint256) -> bytes32` — preserved after redeem.
- `mintedTimestamp(uint256) -> uint256` — preserved after redeem.
- `usdcToken() -> address` — immutable USDC address.

## Recommended Backend Architecture

- **Library**: `ethers.js v6` with a signer that has `MINTER_ROLE`.
- **DB schema**: store `tokenId`, `userId`, `coinAmount`, `gameType` (string + bytes32), `sessionId` (string + bytes32), `mintTxHash`, `mintedAt`, `redeemed`, `redeemTxHash`.
- **Event listener**: poll or websocket subscribe to `VoucherMinted` and `VoucherRedeemed`. Update DB asynchronously; do **not** rely on event delivery for mint success (use tx receipt directly).
- **Pre-flight check**: before `mint`, verify `usdcToken.balanceOf(contractAddr) >= coinAmount * USDC_UNITS_PER_COIN` plus a buffer. If liquidity is low, pause cashouts at the UX layer rather than letting `redeem` revert.
- **Retry**: exponential backoff on RPC failures. **Never retry past a confirmed mint** — re-submission of the same `sessionId` would mint a duplicate voucher.

## Error Handling

| Condition | Backend behaviour |
|---|---|
| `mint` revert with `"Below min coin balance"` | Reject cashout request, return user-facing error |
| `mint` revert with `"Above max coin balance"` | Split into multiple vouchers ≤ 100,000 each |
| `mint` revert with `"Invalid game type"` / `"Invalid session id"` | Backend bug — fail loudly, alert ops |
| `mint` revert with `EnforcedPause` | Contract is paused. Surface "Cashout temporarily unavailable" in app |
| `redeem` revert with `"Insufficient USDC liquidity"` | Operator must refund the contract. Notify ops. User can retry later |
| Mint tx times out before receipt | Re-check by `sessionId` correlation — do **not** blindly retry. Consider a per-`sessionId` nonce or idempotency table in DB |

## Phase 2 TODOs

- `scripts/grant-minter.ts` — script to grant `MINTER_ROLE` to the backend hot wallet from the admin signer. Idempotent.
- Backend `services/nftMint.ts` implementing all of the above with structured logging + correlation IDs per `docs/DEVELOPMENT_MEMORY.md` §2.
- Phase 5: move admin + minter to Gnosis Safe + propose `OperatorTimelock` for `emergencyWithdrawUSDC`.

**Claude**: Use this document when building the NFT Mint Service in Phase 2.
