# PR Review Checklist - NFT Proxy Gamble

**Use this checklist for every PR in Phase 3 and beyond.**

## General Quality
- [ ] Code follows project style guide and naming conventions
- [ ] All new files have proper headers and documentation
- [ ] No console.log or debug code left in production
- [ ] TypeScript strict mode with no `any` (unless justified)

## Security (Highest Priority - Real Money)
- [ ] **No client-side balance modification** - All coin changes come from backend only
- [ ] IAP receipts are validated server-side (not trusted from client)
- [ ] Sensitive data stored in `expo-secure-store` (never AsyncStorage)
- [ ] No hardcoded private keys or secrets
- [ ] Proper error handling (no leaking sensitive info in error messages)
- [ ] Rate limiting respected in UI
- [ ] Wallet connection uses secure deep linking / WalletConnect
- [ ] Certificate pinning implemented or planned
- [ ] No client can spoof coin balance or purchase history

## Testing
- [ ] New features have unit/component tests
- [ ] Critical flows have integration or E2E tests
- [ ] All tests are passing (CI green)
- [ ] Test coverage did not decrease significantly

## Architecture & Performance
- [ ] Proper separation of concerns (services, hooks, components)
- [ ] React Query used for data fetching where appropriate
- [ ] Animations are performant (react-native-reanimated)
- [ ] No unnecessary re-renders
- [ ] Images and assets optimized

## UX & Accessibility
- [ ] Loading states and error handling are clear
- [ ] App feels responsive (no blocking UI)
- [ ] Dark theme consistent across all screens
- [ ] Accessibility labels and roles added
- [ ] Works on both iOS and Android

## Documentation
- [ ] New features documented in relevant MD files if needed
- [ ] Breaking changes noted in PR description
- [ ] Screenshots or videos attached for UI changes

## Final Sign-off
- [ ] PR description is clear and links to issue
- [ ] All checklist items passed
- [ ] Ready for merge (or needs specific changes)

**Security Note**: If any security item fails, the PR **must not be merged** until fixed. Real money is at stake.