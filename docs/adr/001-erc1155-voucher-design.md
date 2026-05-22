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