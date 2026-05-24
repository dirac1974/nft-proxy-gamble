# PR Review Checklist - NFT Proxy Gamble

**Use this checklist for every PR in Phase 3 and beyond.**

> **BLOCKING items**: Any single BLOCKING failure means the PR **must not be merged** until resolved.
> Real money (USDC redemption) is at stake — there is no "fix it later" for security gaps.

---

## Security [BLOCKING — all items below must pass]

### Balance Integrity [BLOCKING]
- [ ] **[BLOCKING] Backend signs all balance responses with HMAC** — client only displays signed balances; no unsigned balance is ever stored or acted upon
- [ ] **[BLOCKING] No client-side balance modification** — `gameStore.setBalance` is called exclusively from `balanceApi.get()` or the `draw` response; never calculated client-side
- [ ] **[BLOCKING] Signed balance token verification** — client verifies `HMAC-SHA256(SIGNING_KEY, "${userId}:${coinBalance}:${sigTimestamp}")` before display; tokens older than 60s are rejected
- [ ] `sigTimestamp` validated server-side: reject requests where `|now - sigTimestamp| > 60s`

### IAP / Purchase Integrity [BLOCKING]
- [ ] **[BLOCKING] On-chain purchase commitment event emitted before coins credited** — backend calls `commitPurchase()` on Polygon and waits for receipt before writing new balance to DB
- [ ] IAP receipts validated server-side against Apple/Google APIs — never trusted from client payload
- [ ] Receipt hash stored in DB with `UNIQUE` constraint to prevent replay
- [ ] `finishTransaction({ isConsumable: true })` always called (even on backend failure) to prevent stuck purchases in OS queue
- [ ] `newBalance` set only from backend IAP-verify response, never from client-provided value

### API & Transport [BLOCKING]
- [ ] **[BLOCKING] No hardcoded API URLs** — all base URLs and contract addresses read from `process.env` / `app.config.ts` environment variables
- [ ] All authenticated endpoints verify `Authorization: Bearer <jwt>` header; 401 on any missing/invalid token
- [ ] Request body schemas validated with Zod (or equivalent) on the backend before processing

### Secrets & Storage
- [ ] Sensitive data (JWT, wallet address) stored in `expo-secure-store` — never `AsyncStorage` or `mmkv` plaintext
- [ ] No hardcoded private keys, API keys, or contract secrets anywhere in source
- [ ] `.env` files excluded from git; secrets use GitHub Secrets in CI

### Wallet & Crypto
- [ ] Wallet connection uses WalletConnect v2 or secure deep link — no raw private key input
- [ ] `signMessage` used only for auth nonce — never for fund-moving transactions without user confirmation
- [ ] Certificate pinning implemented or explicitly tracked as Phase 3.6 TODO

### Anti-Fraud
- [ ] Rate limiting respected in UI (gray out / disable after limit hit, not silent ignore)
- [ ] Cashout requires minimum coin balance (100) enforced both client-side hint and server-side hard gate
- [ ] Session IDs are backend-generated UUIDs — client cannot supply or guess them

---

## General Quality

- [ ] TypeScript strict mode — no `any` without justified `// eslint-disable` comment
- [ ] No `console.log` / `console.error` left in production paths (use structured logger)
- [ ] All new files match naming conventions (`kebab-case.ts` utils, `PascalCase.tsx` components)
- [ ] No dead code or commented-out blocks committed

---

## Testing

- [ ] New features have unit / component tests (React Native Testing Library)
- [ ] Critical game flows have integration tests (start → deal → draw → result chain)
- [ ] All tests passing — CI green before review requested
- [ ] Test coverage did not decrease vs. base branch
- [ ] Negative tests: invalid input, network error, 401 response, duplicate IAP receipt

---

## Architecture & Performance

- [ ] Proper separation of concerns: services call API, stores own state, components only read store
- [ ] React Query used for server state (balance, NFTs) — Zustand for local game state
- [ ] Animations run on UI thread (react-native-reanimated worklets)
- [ ] No unnecessary re-renders (memoize heavy list items)
- [ ] Assets optimized — no raw PNG >200 KB

---

## UX & Accessibility

- [ ] Loading states visible for all async operations
- [ ] Error messages user-friendly and never leak stack traces or internal IDs
- [ ] `accessibilityRole`, `accessibilityLabel`, `accessibilityState` on all interactive elements
- [ ] Dark theme consistent — no hardcoded `#fff` / `#000` outside theme file
- [ ] Works on both iOS 16+ and Android 13+

---

## Documentation

- [ ] PR description links to GitHub Issue
- [ ] Breaking API changes noted and version-bumped
- [ ] Screenshots / screen recordings attached for any UI change
- [ ] Relevant `.md` docs updated if architecture or flows changed

---

## Final Sign-off

- [ ] All BLOCKING security items confirmed passing
- [ ] All other checklist items passed or explicitly waived with justification
- [ ] PR description is complete, clear, and references the Issue
- [ ] Ready for merge

---

**Security Note**: A single BLOCKING failure means the PR is not mergeable. Fix it, push, and re-request review.
