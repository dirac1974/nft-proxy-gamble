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