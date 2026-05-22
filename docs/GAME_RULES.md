# Game Rules - 9/6 Jacks or Better Video Poker

## Overview
Standard single-hand video poker. Player bets 1 to 5 coins per hand. Goal: Make the best 5-card poker hand according to the paytable. Higher bets scale payouts linearly (except some royals in real casinos, here fixed for simplicity).

**House Edge / RTP**: ~0.46% house edge (99.54% RTP) - one of the best player odds in casino games. Perfect for our "entertainment + collectible" positioning.

## Paytable (9/6 Jacks or Better)

| Hand              | Payout (per 1 coin bet) | 5 Coin Bet Example |
|-------------------|--------------------------|--------------------|
| Royal Flush      | 250                     | 1,250             |
| Straight Flush   | 50                      | 250               |
| Four of a Kind   | 25                      | 125               |
| Full House       | 9                       | 45                |
| Flush            | 6                       | 30                |
| Straight         | 4                       | 20                |
| Three of a Kind  | 3                       | 15                |
| Two Pair         | 2                       | 10                | 
| Jacks or Better  | 1                       | 5                 |
| Nothing          | 0                       | 0                 |

**Note**: Payouts are multiplied by coins bet. Royal Flush on 5 coins often has bonus in real VP (4000+), but here we use 250x for simplicity and predictability. Can be upgraded later to progressive.

## Hand Rankings (Standard Poker)
1. Royal Flush: A-K-Q-J-10 same suit
2. Straight Flush: 5 consecutive same suit (not royal)
3. Four of a Kind: 4 same rank
4. Full House: 3 + 2 different ranks
5. Flush: 5 same suit (not straight)
6. Straight: 5 consecutive (not same suit)
7. Three of a Kind
8. Two Pair
9. One Pair: Jacks or Better (J, Q, K, A) - lower pairs pay 0
10. High Card / Nothing

## Game Flow (in App)
1. Select bet amount (1-5 coins) from balance.
2. **Deal**: 5 cards dealt from 52-card deck (no jokers).
3. Player chooses which cards to **HOLD** (0 to 5).
4. **Draw**: Non-held cards replaced from remaining deck.
5. Final hand evaluated -> Payout added to balance instantly.
6. Option to play again or Cash Out entire balance as NFT.

## Provably Fair Implementation
- Server generates `serverSeed` (32 random bytes) + `clientSeed` (user-provided or random) + `nonce` per session/hand.
- `hash = keccak256(serverSeed || clientSeed || nonce)` used as entropy source for Fisher-Yates shuffle of deck.
- Full deck state + all intermediate hashes logged in DB.
- Post-game, user can call `/game/verify?sessionId=xxx` to receive seeds and independently replay the exact cards dealt.
- This makes outcomes **verifiable and tamper-proof** even if server is compromised later.

## Future Games (Modular Interface)
All games will implement a common `GameEngine` interface:
- `startSession(betAmount, userId)`
- `getState()`
- `makeMove(moveData)` (e.g. holds for poker, hit/stand for blackjack)
- `calculatePayout()`
- `endSession()` -> returns finalBalanceDelta

Claude: Implement Video Poker first exactly to this spec. Add unit tests for every hand type in paytable.