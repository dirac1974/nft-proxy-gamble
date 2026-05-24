# Phase 3 Task Breakdown - Mobile App Development

**Goal**: Build a secure, polished, production-ready mobile casino app for iOS and Android.

**Security First Principle**: All coin balance changes must originate from the backend. Client must never be trusted with balance modification.

## Phase 3.1: Foundation (Week 1)

- [ ] Set up Expo project with TypeScript
- [ ] Install core dependencies (reanimated, react-query, viem, iap, zustand, secure-store)
- [ ] Create folder structure (screens, components, services, hooks, store, theme, utils)
- [ ] Implement dark casino theme + design tokens
- [ ] Set up navigation (4-tab bottom navigation)
- [ ] Configure API client with authentication
- [ ] Add secure storage layer (expo-secure-store)

## Phase 3.2: Wallet & Authentication (Week 1-2)

- [ ] Implement WalletConnect v2 integration (viem)
- [ ] Add wallet connection screen with QR + deep linking
- [ ] Handle connection states, errors, and network switching
- [ ] Store connected address securely
- [ ] Add "Connect Wallet" flow from multiple entry points

## Phase 3.3: Video Poker Game (Week 2)

- [ ] Build card components with smooth animations (react-native-reanimated)
- [ ] Implement full state machine (bet → deal → hold → draw → payout)
- [ ] Connect to backend game API (start session, deal, draw)
- [ ] Display real-time balance updates
- [ ] Add win animations + sound effects
- [ ] Implement bet selector (1-5 coins)
- [ ] Add game rules / paytable modal

**Critical Security Note**: Payout calculation must come from backend. Client only displays results.

## Phase 3.4: Balance & Economy (Week 2-3)

- [ ] Display current coin balance (fetched from backend)
- [ ] Implement IAP purchase flow (react-native-iap)
- [ ] Send purchase receipts to backend for validation
- [ ] Handle purchase success/failure states
- [ ] Add transaction history screen
- [ ] Show pending purchases with loading states

## Phase 3.5: NFT Wallet & Redemption (Week 3)

- [ ] Build "My NFTs" screen
- [ ] Fetch owned vouchers from backend/contract
- [ ] Display NFT metadata (coin amount, game type, date)
- [ ] Implement "Redeem to USDC" flow (contract interaction)
- [ ] Add "Transfer NFT" functionality (to another wallet)
- [ ] Show redemption transaction status

## Phase 3.6: Polish & Security Hardening (Week 3-4)

- [ ] Add loading skeletons and error boundaries
- [ ] Implement certificate pinning (API security)
- [ ] Add rate limiting feedback in UI
- [ ] Add device attestation hooks (optional)
- [ ] Comprehensive E2E testing (Maestro or Detox)
- [ ] Performance optimization (React Query caching, memoization)
- [ ] Accessibility audit (screen reader support)
- [ ] Final security review + penetration testing prep

## Phase 3.7: Release Preparation (Week 4)

- [ ] EAS Build configuration for iOS + Android
- [ ] App Store / Play Store metadata & screenshots
- [ ] Privacy policy + age gate (18+)
- [ ] Final security audit sign-off
- [ ] Beta testing with TestFlight / Internal testing

**Total Estimated Duration**: 3.5 - 4 weeks (depending on team size)