# Backend API Specification (High-Level)

**Base URL**: https://api.nftproxygamble.com (or localhost:3000)
**Auth**: JWT (after wallet connect or email) + optional wallet signature for sensitive ops.

## Core Endpoints

### Auth & User
- POST /auth/link-wallet { address, signature } -> { jwt, user }
- GET /user/profile

### IAP
- POST /iap/verify { platform: 'ios'|'android', receipt, productId } -> { success, newBalance }

### Balance & Economy
- GET /balance -> { coins, usdEquivalent }
- GET /transactions?limit=20

### Game (Video Poker)
- POST /game/video-poker/start { betCoins } -> { sessionId, initialCards: string[], serverSeedHash, clientSeed }
- POST /game/video-poker/draw { sessionId, holds: boolean[] } -> { finalCards, payout, newBalance, handRank }
- POST /game/cashout { sessionId? } -> { nftTokenId, txHash, coinAmount }  (if no session, cashout full balance)
- GET /game/verify/{sessionId} -> { serverSeed, clientSeed, nonce, deckHistory, isValid }

### NFT & Redemption
- GET /nfts/owned -> [{ tokenId, coinBalance, metadata, redeemable }]
- POST /nfts/redeem-request (optional off-chain helper before on-chain)

**Error Format**: { error: string, code: number }

**Rate Limits**: 10 req/min per user for game endpoints, 5/min for cashout.

Claude: Implement with Zod schemas for all inputs. Use tRPC or plain Express + OpenAPI doc later.
---

## New / updated endpoints (FABLE audit follow-up, July 2026)

These reflect the actual implemented Express routes (authoritative over the
high-level sketch above where they differ).

### Auth — provably-fair chain field (H-2)
- `POST /auth/verify { address, signature }` → `{ token, userId, ageConfirmed, serverSeedChainHash }`
  - `serverSeedChainHash`: the commitment for the user's next server seed
    (null for legacy accounts until their next session initializes the chain).

### Video Poker — chain commitment (H-2)
- `POST /game/start-session { betAmount, clientSeed? }`
  → `{ sessionId, serverSeedHash, clientSeed, betAmount, nextServerSeedHash }`
  - `serverSeedHash` for this session equals the previous session's
    `nextServerSeedHash` (chain continuity). Clients may supply their own
    high-entropy `clientSeed` for grinding resistance.
- `POST /game/start-session { betAmount, clientSeed?, variant? }` — `variant` ∈
  `jacks-or-better` (default) | `bonus-poker` | `deuces-wild`; returned as `gameType`.
  Same deal/draw flow; only evaluation + paytable differ (see `docs/GAME_RULES.md`).
- `POST /game/deal { sessionId }` → `{ handNumber, dealtCards, serverSeedHash }`
  (rejects roulette sessions with 409; one hand per session — C-1).
- `POST /game/draw { sessionId, holds[5] }`
  → `{ drawnCards, holds, rank, payout, serverSeed, ...signedBalance }`.

### Roulette (new, one-shot)
- `POST /roulette/start-session { clientSeed? }`
  → `{ sessionId, gameType: "roulette-euro-1-0", serverSeedHash, clientSeed, nextServerSeedHash }`
- `POST /roulette/spin { sessionId, bets: RouletteBet[] }`
  → `{ winningNumber, color, totalWagered, totalReturn, netProfit, results[],
       serverSeed, serverSeedHash, clientSeed, nonce, ...signedBalance }`
  - `RouletteBet = { type, amount, numbers?, value? }`; see `docs/GAME_RULES.md`
    for bet types. Invalid bet groups → 400; second spin on a session → 409;
    insufficient balance → 402.
  - Winnings settle to the coin balance; cash out via `/game/cashout` as usual.

### Blackjack (new, multi-step)
- `POST /blackjack/start-session { clientSeed? }`
  → `{ sessionId, gameType: "blackjack-6deck-h17-1-0", serverSeedHash, clientSeed,
       nextServerSeedHash, numDecks, dealerHitsSoft17 }`
- `POST /blackjack/deal { sessionId, bet }` — place the base bet + opening deal.
- `POST /blackjack/action { sessionId, action: "hit"|"stand"|"double"|"split" }`
- `POST /blackjack/insurance { sessionId, take: boolean }` — only when the dealer
  shows an Ace (phase `insurance`).
  - All four return a **client-safe round view** + `...signedBalance`:
    `{ phase, dealer[], dealerValue, dealerHoleHidden, hands[], active, insurance,
       legalActions[], results?, totalWagered, totalReturn?, netProfit?,
       serverSeedHash, clientSeed, serverSeed?, numDecks? }`.
    `serverSeed` + `numDecks` are revealed **only** when `phase === "settled"`;
    the dealer hole card is hidden until then.
  - One round per session (second deal → 409); acting after settle → 409; acting on
    another user's session → 404; illegal action (e.g. double on 3 cards) → 400;
    insufficient balance for a wager → 409 (atomic debit failed).
  - Winnings settle to the coin balance; cash out via `/game/cashout` as usual.
  - Reproduce + verify with `verifyBlackjackDeal` (mobile `services/provablyFair.ts`).

### Admin — DB-backed authorization (H-3)
- Admin routes now authorize from the DB (`User.isAdmin`), **never** from a JWT
  claim. A valid non-admin token → 403. Every privileged action writes an
  `AdminAuditLog` row (admin id, action, target, detail, IP).
- `GET /admin/flagged-users?riskLevel&page&limit` (audited read)
- `POST /admin/users/:userId/set-risk { riskLevel, reason }` (audited)

### Device attestation (M-1)
- Money paths (`/game/cashout`, `/iap/verify-purchase`) accept
  `x-attestation-platform` + `x-attestation-token` headers.
- In production (or when `DEVICE_ATTESTATION_ENFORCE=true`) a missing/malformed
  token **fails closed** (403). Requests without attestation headers are
  additionally rate-limited to 5/min/IP.
