# ADR 002 — Provably Fair RNG for Video Poker

**Date**: 2026-05-23  
**Status**: Accepted  
**Authors**: Claude (Lead Dev), Grok (Secondary PM review)

---

## Context

Players must be able to verify after each hand that the cards they received were not manipulated by the server. This is a standard requirement for online gaming fairness.

## Decision

Use a **commit-reveal** scheme with keccak256 hash chaining:

1. **Before dealing**: server generates `serverSeed = crypto.randomBytes(32).hex()` and commits to it by revealing `serverSeedHash = keccak256(serverSeed)`.
2. **Client seed**: player provides or server generates a `clientSeed` (16 random bytes). Sent to client at session start.
3. **Deck generation**: `deck = FisherYates(keccak256(serverSeed:clientSeed:handNumber))`, advancing the hash for each swap position.
4. **After cashout**: `serverSeed` is revealed. Client can independently reconstruct the deck and verify the hand was fair.

## Card Encoding

- Cards: integers 0–51
- `rank = card % 13` → 0=2, 1=3, ..., 8=10, 9=J, 10=Q, 11=K, 12=A
- `suit = Math.floor(card / 13)` → 0=♣, 1=♦, 2=♥, 3=♠

## Paytable (9/6 Jacks or Better)

| Hand | Multiplier |
|------|-----------|
| Royal Flush | 800× (5 coins), 250× (1-4 coins) |
| Straight Flush | 50× |
| Four of a Kind | 25× |
| Full House | 9× |
| Flush | 6× |
| Straight | 4× |
| Three of a Kind | 3× |
| Two Pair | 2× |
| Jacks or Better | 1× |
| Lose | 0 |

Theoretical RTP at optimal play: ~99.54%.

## Per-Hand Deck Isolation

Each hand uses `keccak256(serverSeed:clientSeed:handNumber)` as the seed, so hand N cannot be predicted from hand N-1's output even with the same session seeds.

## Why keccak256

- Deterministic: same inputs → same output always
- Available in both backend (ethers.js) and frontend (ethers.js / viem)
- Players familiar with Ethereum tooling can verify independently
- No external RNG service dependency

## Alternatives Considered

- **Chainlink VRF**: on-chain verifiable but requires a tx per hand (~1-2s latency, gas cost). Deferred to Phase 5+.
- **HMAC-SHA256**: acceptable alternative; keccak256 chosen for ecosystem consistency (ethers already a dependency).
- **Math.random**: rejected — not cryptographically secure, not reproducible.

## Security Notes

- `serverSeed` must never be returned in any API response until the session is COMPLETE or CASHED_OUT.
- The `serverSeedHash` commitment is stored in the session at creation; it is immutable.
- If the server attempted to substitute a different seed after seeing the player's holds, the hash would not match — the commitment prevents this.
