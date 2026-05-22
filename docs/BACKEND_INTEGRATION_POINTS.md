# Backend Integration Points for NFTProxyVoucher

**Purpose**: Exact technical specifications so the backend team (Claude) can integrate without guesswork.

## Contract Addresses (Testnet First)
- **Amoy Testnet**: To be filled after Phase 1 deployment
- **Polygon Mainnet**: To be filled after mainnet deploy

## Core Functions (Backend Perspective)

### 1. Mint Voucher
```solidity
function mint(
    address to,           // User's self-custodial wallet address
    uint256 coinAmount,   // Positive integer (e.g. 1250)
    string memory gameType, // "jacks-or-better-9-6"
    uint256 sessionId     // Internal backend session ID
) external onlyRole(MINTER_ROLE) returns (uint256 tokenId);
```

**Backend Requirements**:
- Use a dedicated hot wallet with `MINTER_ROLE`
- Store returned `tokenId` + `txHash` in database
- Emit event for frontend polling

### 2. Redeem (Called by User Wallet)
```solidity
function redeem(uint256 tokenId) external;
```
- User signs this tx directly from their mobile wallet
- No backend involvement needed for redemption

## Important Events (Listen For)
```solidity
event VoucherMinted(
    uint256 indexed tokenId,
    address indexed to,
    uint256 coinAmount,
    string gameType,
    uint256 sessionId
);

event VoucherRedeemed(
    uint256 indexed tokenId,
    address indexed redeemer,
    uint256 usdcAmount
);
```

## USDC Decimal Handling
- Contract uses 6 decimals (standard USDC)
- Conversion: `usdcAmount = coinAmount / 100`
- Example: 12,500 coins = 125.00 USDC

## Recommended Backend Architecture
- Use `ethers.js` v6 with a signer that has MINTER_ROLE
- Store in DB: `tokenId`, `userId`, `coinAmount`, `gameType`, `mintTxHash`, `redeemed`
- Add webhook / polling for `VoucherRedeemed` events (for analytics)

## Error Handling
- Always check `usdcToken.balanceOf(contract)` before allowing large cashouts
- Implement retry logic with exponential backoff for mint calls

**Claude**: Use this document when building the NFT Mint Service in Phase 2.