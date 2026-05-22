# NFT Voucher Specification (ERC-1155)

## Token Details
- **Standard**: ERC-1155 (semi-fungible for future batch same-value vouchers)
- **Name**: NFT Proxy Voucher
- **Symbol**: NPV
- **Contract**: To be deployed (see Phase 1)
- **Chain**: Polygon (Amoy testnet first, then mainnet)
- **Total Supply**: Unlimited (mint on demand per cashout)

## On-Chain Storage (Critical for Security)
```solidity
mapping(uint256 => uint256) public coinBalance;  // Immutable coin value
mapping(uint256 => string) public gameType;     // "jacks-or-better-9-6"
mapping(uint256 => uint256) public mintedAt;    // timestamp
mapping(uint256 => address) public minter;    // backend address for audit
```

## Metadata (Off-Chain for Flexibility)
TokenURI returns:
```json
{
  "name": "NFT Proxy Voucher #42 - 1,250 Coins",
  "description": "Redeemable for 12.50 USDC via NFT Proxy Gamble banker contract. Issued from 9/6 Jacks or Better session on 2026-05-22.",
  "image": "https://api.nftproxygamble.com/vouchers/42.png",  // Dynamic or static voucher art
  "attributes": [
    {"trait_type": "Coin Balance", "value": 1250},
    {"trait_type": "USDC Value", "value": "12.50"},
    {"trait_type": "Game", "value": "9/6 Jacks or Better"},
    {"trait_type": "Session ID", "value": "sess_abc123"},
    {"trait_type": "Minted", "value": "2026-05-22T12:00:00Z"}
  ]
}
```

## Redemption Flow
1. User calls `redeem(tokenId)` from their wallet (signs tx).
2. Contract checks:
   - Caller is owner of tokenId
   - Not already redeemed (burned)
   - Contract has sufficient USDC balance
3. Burns the token (ERC-1155 burn)
4. Transfers `coinBalance[tokenId] * 0.01` USDC to caller
5. Emits `VoucherRedeemed(tokenId, to, amountUSDC)`

## P2P & Trading
- Standard `safeTransferFrom` / `safeBatchTransferFrom` works out of the box.
- Users can send to friends, list on OpenSea (with care - value is in redemption, not speculative), or use in future in-app P2P marketplace.

## Future Enhancements
- Soulbound option (non-transferable until redeemed) via flag.
- Multiple voucher types (different games have different art).
- On-chain royalty for secondary sales (optional).

Claude: Ensure metadata service (simple Express endpoint or Cloudflare Worker) serves fresh JSON based on on-chain data + DB.