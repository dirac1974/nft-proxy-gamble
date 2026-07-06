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
---

# Game Rules — European Roulette (single-zero)

## Overview
European (single-zero) roulette: 37 pockets, `0`–`36`. One spin resolves all
bets at once — a one-shot game (no multi-step decisions), so it uses the
standard commit-reveal without a seed chain per decision.

**House Edge / RTP**: 2.70% house edge (97.30% RTP). The single green `0` is the
sole source of the edge — every bet's expected value is `36/37` of a fair
payout. Verified in `backend/tests/unit/roulette.test.ts` ("expected return of a
straight-up bet across all 37 pockets is 36/37").

## Bet types & payouts

Payouts below are stated as **profit : stake** (the usual casino notation). On a
win the player receives their stake back **plus** the profit, i.e. total
returned = `stake × (ratio + 1)`.

| Bet         | Covers                                   | Pays  | Total returned per 1 coin |
|-------------|------------------------------------------|-------|---------------------------|
| Straight    | 1 number                                 | 35:1  | 36                        |
| Split       | 2 adjacent numbers                       | 17:1  | 18                        |
| Street      | 3 numbers (a row), or a 0-trio           | 11:1  | 12                        |
| Corner      | 4 numbers (a square), or the 0-1-2-3 basket | 8:1 | 9                        |
| Six-line    | 6 numbers (two adjacent rows)            | 5:1   | 6                         |
| Column      | 12 numbers (a table column)              | 2:1   | 3                         |
| Dozen       | 12 numbers (1–12, 13–24, 25–36)          | 2:1   | 3                         |
| Red / Black | 18 numbers                               | 1:1   | 2                         |
| Odd / Even  | 18 numbers                               | 1:1   | 2                         |
| High / Low  | 19–36 / 1–18                             | 1:1   | 2                         |

`0` is green: it loses all even-money, dozen, column and any inside bet that
does not explicitly cover it. Zero is covered only by a straight on 0, the
zero-splits (0-1, 0-2, 0-3), the zero-trios (0-1-2, 0-2-3) and the basket
(0-1-2-3).

**Table layout** (for adjacency): numbers 1–36 sit in 12 rows of 3; row `r`
holds `3r-2, 3r-1, 3r`. Column 1 = {1,4,…,34}, column 2 = {2,5,…,35}, column 3 =
{3,6,…,36}. Inside-bet groups are validated server-side against the set of all
legal groups — an illegal group (e.g. a "split" of 1 and 5) is rejected with
HTTP 400.

## Limits
- 1 to **20** bets per spin.
- Total wager per spin ≤ **1000** coins.
- Each bet amount is a positive integer ≥ 1.

## Game flow (in app)
1. **Start session** (commit): the server commits a `serverSeed` (publishes
   `serverSeedHash`) and fixes the `clientSeed` **before** the player bets.
2. **Place bets**: chips on any combination of the bet types above.
3. **Spin** (reveal): the server reveals `serverSeed` and the winning number
   `n = HMAC_SHA256(serverSeed, clientSeed:nonce) mod 37`. All bets settle
   atomically; winnings credit to the coin balance.
4. The app **verifies** on-device that `keccak256(serverSeed) == serverSeedHash`
   and that the number recomputes from the seeds. A failed check is shown as a
   red "verification FAILED" banner.
5. Winnings can be cashed out to an on-chain USDC voucher via the normal
   `/game/cashout` path (100 coins = 1 USDC).

One spin per session: after the seed is revealed a new session must be started
for the next spin (prevents outcome prediction — see `docs/PROVABLY_FAIR.md`).

---

# Game Rules — Blackjack (6-deck, dealer hits soft 17)

## Overview
Standard casino blackjack against the dealer. Provably fair: the entire shoe is
a committed permutation derived from `(serverSeed, clientSeed)`, revealed at the
end of the round so the player can reproduce every card. House edge ≈ **0.5%**
with basic strategy (6 decks, dealer hits soft 17, blackjack pays 3:2, double on
any two, split to 4 hands, split aces one card).

Game type id: `blackjack-6deck-h17-1-0`. Engine: `backend/src/services/blackjack.ts`.

## Rules
- **Card values**: 2–10 face value; J/Q/K = 10; Ace = 11 or 1 (whichever avoids a bust).
- **Blackjack** (natural): an Ace + a ten-value card on the first two cards of the
  original (un-split) hand. Pays **3:2** (profit floored on odd bets, house-favorable).
  A 21 made after a split is **not** a blackjack.
- **Dealer** draws to 17 and **hits soft 17** (`…-h17-…`).
- **Hit / Stand**: draw another card, or end your turn.
- **Double**: only on your first two cards — doubles the bet, draws exactly one card,
  ends the hand. Not allowed on split aces.
- **Split**: two equal-**value** cards (e.g. 8-8, or K-10) split into two hands, each
  taking one new card and an additional bet equal to the base bet. Up to **4** hands.
  **Split aces** receive exactly one card each and cannot be hit.
- **Insurance**: offered only when the dealer's upcard is an Ace. Costs up to half the
  base bet and pays **2:1** if the dealer has a natural; otherwise it is lost.
- **Settlement**: win 1:1, push returns the stake, loss/bust returns nothing.

## Limits
- Base bet: **1**–**500** coins (integer). Additional wagers (double/split/insurance)
  are debited atomically as they occur and can never take the balance negative.

## Game flow (in app)
1. **Start session** (commit): server publishes `serverSeedHash` + `clientSeed` and
   the next session's seed commitment (H-2 chain) **before** any bet.
2. **Deal**: place the base bet; two cards to the player, two to the dealer (the hole
   card stays hidden). Naturals resolve immediately.
3. **Insurance** (if offered) → **Actions** (hit/stand/double/split) until every hand
   is done, then the dealer plays and the round **settles**.
4. On settle the server reveals `serverSeed` + `numDecks`; the app reproduces the shoe
   and verifies the dealt cards (`verifyBlackjackDeal`). A failed check shows a red banner.
5. Winnings credit to the coin balance; cash out via `/game/cashout` (100 coins = 1 USDC).

One round per session: the revealed seed can never be re-dealt (outcome-prediction
defense — the same C-1 class rule as video poker and roulette).
