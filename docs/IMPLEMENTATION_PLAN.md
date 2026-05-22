# Implementation Plan - NFT Proxy Gamble Platform

**Goal**: Deliver a production-ready, secure, fully-tested MVP in small, verifiable steps. **Claude must follow this exactly**, one phase at a time, with 100% test coverage on critical paths.

**CRITICAL NEW RULE (from DEVELOPMENT_MEMORY.md)**: 
**Think deeply and plan thoroughly BEFORE writing any code.** Create a detailed plan in the GitHub Issue first. No exceptions. Bug-free code requires this discipline.

**Total Phases**: 6 (MVP)
**Testing Mandate**: Every phase ends with passing tests + deployment to testnet/staging. No phase complete without tests.

## Phase 0: Repo & Environment Setup (Grok completed - you verify)
- [x] Create GitHub repo with this structure
- [x] All MD specs written
- Verify local: Node 20+, git, etc.
- Install deps later in phases.

## Phase 1: Smart Contracts (ERC-1155 Voucher + USDC Redemption) - 1-2 days
**Objective**: Deployable, audited-ready contract on Polygon Amoy testnet.

**MANDATORY PRE-PLAN (add to Issue #1 before coding)**:
- Deep security analysis (reentrancy, access control bypass, USDC decimal handling, integer overflow)
- Edge cases table
- Test strategy with 20+ specific test cases

**Tasks**:
1. Initialize Hardhat project in /contracts (TypeScript, OpenZeppelin contracts & test helpers).
2. Implement `NFTProxyVoucher.sol`:
   - ERC-1155 with unique tokenIds (counter)
   - `mapping(uint256 => uint256) public coinBalance;` (immutable on-chain value)
   - MINTER_ROLE (backend signer)
   - `mint(address to, uint256 coinAmount, string memory gameType, uint256 sessionId)` only MINTER
   - `redeem(uint256 tokenId)` - burns, transfers USDC (assume 1 coin = 0.01 USDC, or configurable rate)
   - Events: VoucherMinted, VoucherRedeemed, etc.
   - tokenURI returns dynamic metadata JSON (or IPFS hash base)
   - Pausable, AccessControl, ReentrancyGuard
3. Write comprehensive Hardhat tests (at least 15 tests):
   - Mint/redeem happy path
   - Only minter can mint
   - Balance updates correctly
   - Cannot redeem twice / non-owner
   - USDC transfer math
   - Events emitted
   - Edge: zero amount, max uint, etc.
4. Deploy script to Amoy + verify on Polygonscan.
5. Create /docs/adr/001-erc1155-design.md explaining choices (why 1155 vs 721, on-chain balance vs metadata only).

**Success Criteria**: All tests pass, contract verified on testnet, deployment address in README.

**Claude Action**: Start here. Create Issue #1 "Phase 1: ERC-1155 Voucher Contract". Implement, test, PR.

## Phase 2: Backend Core (Node.js/TS + Game Engine + IAP) - 3-4 days
**Objective**: Fully functional API + provably fair video poker engine.

**MANDATORY PRE-PLAN**: Add deep analysis of RNG determinism, concurrent sessions, receipt replay attacks to the Issue before coding.

**Tasks**:
1. Init /backend with Express + TS + Prisma + PostgreSQL (docker-compose for dev).
2. Define Prisma schema: User, GameSession, Transaction, NFTVoucher, IAPReceipt.
3. Implement **Provably Fair Video Poker Engine** (`services/videoPoker.ts`):
   - Use crypto.randomBytes for serverSeed + clientSeed (user or random)
   - Deterministic shuffle/deal using keccak256 hash chain (standard crypto casino method)
   - Full hand evaluation for 9/6 Jacks or Better (exact paytable from GAME_RULES.md)
   - Log every random call + full deck state per session for later verification
   - Support multi-coin bets (1-5)
4. IAP Verification Service:
   - Apple App Store receipt validation (node-apple-receipt-verify or similar)
   - Google Play (google-play-billing-validator)
   - Credit user balance atomically
5. API Routes (Express + Zod validation):
   - POST /auth/connect-wallet (link address)
   - POST /iap/verify-purchase
   - GET /balance
   - POST /game/start-session (video-poker)
   - POST /game/deal
   - POST /game/draw (with holds array)
   - POST /game/cashout (triggers mint)
   - GET /nfts/owned
6. NFT Mint Orchestration: Use ethers.js + backend hot wallet (MINTER_ROLE) to call contract.mint. Store tx hash + tokenId in DB.
7. Full Jest tests (>80% coverage): Mock IAP, test RNG determinism, session state machine, balance updates, edge cases (invalid holds, insufficient balance).

**Success**: API runs locally, can simulate full play + cashout flow (mock contract), all tests green.

## Phase 3: Mobile App Foundation (React Native Expo) - 4-5 days
**Objective**: Beautiful, functional cross-platform app with wallet connect & basic flow.

**MANDATORY PRE-PLAN**: Analyze mobile-specific risks (secure storage, deep linking security, background state, App Store review risks) before coding.

**Tasks**:
1. `npx create-expo-app@latest mobile --template blank-typescript`
2. Install key deps: expo-router (file-based nav), @tanstack/react-query, zustand, react-native-iap, viem, @walletconnect/modal (or preferred RN web3 lib), react-native-reanimated, react-native-gesture-handler, expo-constants.
3. Core Screens & Navigation (bottom tabs + stack):
   - Lobby/Home: Game selector (Video Poker card with RTP badge, "Play" button), current coin balance, "Connect Wallet" button
   - Video Poker Screen: 5-card display (use SVG or emoji + custom Card component for now; later replace with high-quality assets), bet amount selector (1-5 coins with total cost), Deal/Draw/Hold toggles (5 switches or press-to-hold), Win payout animation (Lottie or Reanimated), balance live update
   - My NFTs / Wallet: List of owned vouchers (fetch from backend or contract events via viem), metadata display (coin amount, game, date), "Redeem to USDC" (calls contract.redeem via wallet signature), "Transfer" modal (enter address)
   - Profile/History: Tx log, settings, 18+ age gate modal
4. State & Services:
   - API client with auth (JWT from backend)
   - Wallet connection flow (deep link or modal, store address)
   - Game state machine (use XState or simple useReducer for deal -> hold -> draw -> payout)
5. Theming: Dark casino theme (purple #6B21A8, neon green accents, glassmorphism cards)
6. Tests: Use Jest + React Native Testing Library for components. E2E with Maestro or Detox for critical flows (play hand, cashout).

**Success**: App runs on iOS simulator + Android emulator, full game playable end-to-end (mock backend), wallet connect works, redeem tx signs.

## Phase 4: Full Integration & Polish - 2-3 days
**Tasks**:
1. Wire real backend + contract (testnet) in mobile (update envs).
2. Implement real IAP end-to-end (test with sandbox Apple/Google).
3. Add confetti, sound effects (expo-av), smooth animations for card reveal/flip.
4. Error handling, loading states, optimistic UI for balance.
5. Add basic admin dashboard (simple web or in-app) for viewing redemptions (operator view).
6. Security hardening: Input sanitization, rate limiting (express-rate-limit), helmet, CORS strict.
7. Update all tests to integration level.

**Success**: Complete user journey works on testnet: Buy coins (sandbox) -> Play poker hands -> Cashout NFT -> View in wallet -> Redeem for USDC (test USDC on Amoy).

## Phase 5: Security Audit Prep & Hardening - 2 days
**Tasks**:
1. Run Slither, Mythril, Echidna on contracts.
2. Backend: OWASP ZAP scan, dependency audit (npm audit fix), secret scanning.
3. Mobile: Review for insecure storage (use expo-secure-store), jailbreak/root detection (optional lib).
4. Add multi-sig for production minter/banker wallet (Gnosis Safe).
5. Implement withdrawal limits, KYC hook placeholder (for large redemptions >$500).
6. Create SECURITY.md updates + threat model diagram.
7. Bug bounty program placeholder in README.

**Success**: Zero critical/high findings in automated scans. Manual review checklist passed.

## Phase 6: Production Deployment & Launch Prep - 1-2 days
**Tasks**:
1. Deploy contracts to Polygon mainnet (or chosen L2).
2. Backend to Vercel/Render + managed Postgres (Neon/Supabase) or AWS.
3. Mobile: EAS Build for iOS/Android production binaries, submit to App Store + Play Store (with proper privacy policy, age gates, disclaimers).
4. Set up monitoring (Sentry, Datadog or Prometheus + Grafana for backend).
5. Final legal review (disclaimers, ToS, "entertainment only" language).
6. Create launch PR, tag v1.0.0.

**Post-MVP Roadmap** (in ROADMAP.md):
- Additional games (modular GameEngine interface)
- On-chain VRF integration (Chainlink) for ultimate fairness
- NFT marketplace listing support
- Leaderboards, tournaments
- Fiat off-ramp partnerships

**Claude: Begin with Phase 1 Issue. Update this file with [x] as you complete. Open PR for each phase completion. ALWAYS follow DEVELOPMENT_MEMORY.md process first.**