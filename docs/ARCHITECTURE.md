# Architecture Overview - NFT Proxy Gamble

## High-Level Components

```
User (Mobile App)
  |
  v
IAP (Apple/Google) --> Backend (IAP Verifier) --> User Balance (DB)
  |                           |
  v                           v
Game Play (Video Poker UI) --> Game Engine (Provably Fair RNG + Paytable) --> Session Log
  |                                                       |
  v                                                       v
Cash Out --> Mint NFT Voucher (ERC-1155, on-chain coinBalance) --> User's Self-Custodial Wallet
  |                                                                 |
  v                                                                 v
Trade/Send NFT (P2P or to Banker) --> Redeem Contract (burn + USDC transfer) --> User's Wallet (USDC)
```

## Data Flow for Core Loop
1. User buys coins via IAP -> Receipt sent to /iap/verify -> Backend credits balance (atomic tx).
2. User enters Video Poker, places bet (deduct from balance or per-hand).
3. Server generates session + seeds -> Deals cards deterministically from hash.
4. User holds/discards -> Server redraws from remaining deck state (logged).
5. Payout calculated, balance updated.
6. User taps "Cash Out" -> Backend verifies session integrity (seed match, no tampering) -> Calls contract.mint(to=userWallet, coinAmount=balance, ...)
7. User receives NFT in wallet (visible in OpenSea, etc. via metadata).
8. User taps "Redeem" in app or directly on contract -> Signs tx -> Contract burns NFT, sends USDC from its funded balance.

## Key Design Decisions
- **Why ERC-1155?** Supports batch transfers if needed, semi-fungible for same-value vouchers, but we use unique IDs + on-chain balance for security (metadata can be updated for display only).
- **Server-Authoritative Games**: Prevents client-side cheating. Provable via seed reveal (user can request verification endpoint post-game).
- **Hot Wallet for Minter**: Backend uses a dedicated EOA with MINTER_ROLE (low balance, rotated). Production: Use Safe + relayers.
- **No On-Chain Game Logic Initially**: Too expensive/slow for video poker. Future: Hybrid with optimistic or zk proofs.
- **Self-Custody First**: User always controls NFT and USDC. Platform never holds user funds long-term.

## Technology Choices
- **Blockchain**: Polygon PoS (low fees, fast finality, native USDC). Fallback: Base.
- **Indexing**: TheGraph subgraph (future) or Alchemy/QuickNode for owned NFTs list.
- **Backend DB**: PostgreSQL for relational integrity (sessions, balances, redemptions).
- **Mobile**: Expo for fast iteration + EAS builds for stores.

## Security Layers
- Smart Contract: OpenZeppelin, pausable, reentrancy guard, role-based.
- Backend: JWT + wallet signature auth, rate limits, input validation (Zod), audit logging immutable.
- Mobile: Secure storage (expo-secure-store), certificate pinning (future), anti-tamper.

See SECURITY.md for full threat model.