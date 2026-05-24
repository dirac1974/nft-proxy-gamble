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
1. [x] Initialize Hardhat project in /contracts (TypeScript, OpenZeppelin contracts & test helpers).
2. [x] Implement `NFTProxyVoucher.sol`:
   - [x] ERC-1155 with unique tokenIds (counter, starts at 0)
   - [x] `mapping(uint256 => uint256) public coinBalance;` (immutable until redeem)
   - [x] MINTER_ROLE (backend signer), PAUSER_ROLE (operator), DEFAULT_ADMIN_ROLE (governance)
   - [x] `mint(address to, uint256 coinAmount, bytes32 gameType, bytes32 sessionId)` only MINTER (bytes32 per ADR-001 Phase 1 Notes, owner Q3 sign-off)
   - [x] `redeem(uint256 tokenId)` - burns, transfers USDC via `SafeERC20.safeTransfer` (exact math `coins * 10_000` raw USDC units; 100 coins = 1 USDC)
   - [x] Events: VoucherMinted, VoucherRedeemed, EmergencyWithdrawal
   - [x] tokenURI returns base URI with `{id}` placeholder (OZ ERC-1155 default; marketplaces substitute client-side)
   - [x] Pausable, AccessControl, ReentrancyGuard (OZ v5 `utils/` paths)
   - [x] On-chain bounds: `MIN_COIN_BALANCE = 100`, `MAX_COIN_BALANCE = 100_000` (owner Q2 sign-off)
   - [x] `emergencyWithdrawUSDC(uint256, address)` admin-only for Phase 5 migration / regulator response
3. [x] Hardhat tests — 34 tests total, all green:
   - [x] Mint/redeem happy path (T1, T2)
   - [x] Only minter can mint (T3, T27)
   - [x] Balance updates correctly (T1, T7, T24)
   - [x] Cannot redeem twice / non-owner (T5, T6, T17)
   - [x] USDC transfer math, exact + arbitrary amounts (T2, T7, T9, T24, T29)
   - [x] Events emitted (T8, T9, T26)
   - [x] Edge: zero amount + below min (T4), max boundary (T12, T23)
   - [x] Pausable semantics + transfers allowed while paused (T10, T11, T25, T31)
   - [x] Reentrancy guard (T22, malicious USDC mock)
   - [x] P2P transfer + redeem-by-new-owner (T21)
   - [x] `emergencyWithdrawUSDC` admin-only + zero-recipient revert (T13, T26)
   - [x] Gas snapshots: mint < 150k, redeem < 80k (T28)
   - [x] Property test (T29, fast-check)
   - [x] `supportsInterface` (T33), constructor zero-USDC revert (T32), bytes32 validation (T34)
   - [x] Coverage on `NFTProxyVoucher.sol`: stmts 100%, branches 97.06%, fns 100%, lines 100%
4. [ ] Deploy script to Amoy + verify on Polygonscan. _Deploy script done; awaiting PRIVATE_KEY in `.env` for live testnet deploy._
5. [x] ADR at `/docs/adr/001-erc1155-voucher-design.md` with Phase 1 Implementation Notes appended (existing ADR retained; appended not rewritten per pre-plan §7).

**Additional Phase 1 deliverables**:
- [x] `MockERC20` and `ReentrantERC20` test mocks added
- [x] `.env.example` documenting required env vars
- [x] `.gitignore` updated for `typechain-types/`, `!.env.example`
- [x] `tsconfig.json` for hardhat + tests
- [x] `BACKEND_INTEGRATION_POINTS.md` rewritten with bytes32 canonicalisation, MIN/MAX bounds, exact USDC math, admin surface, retry semantics
- [x] CI workflow extended: coverage threshold gate, gas snapshot artifact, Slither soft-fail job, backend job gated until Phase 2

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