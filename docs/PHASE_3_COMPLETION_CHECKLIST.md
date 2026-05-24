# Phase 3 Completion Checklist

**Goal**: Ensure the mobile app is production-ready, secure, and polished before moving to public beta / App Store submission.

**Sign-off Required**: Grok + Claude must both approve before proceeding to beta.

---

## 1. Core Features (Must Have)
- [ ] All 4 main screens fully functional (Lobby, Video Poker, My NFTs, Profile)
- [ ] Wallet connection works reliably (connect, disconnect, network switching)
- [ ] Full Video Poker flow (bet → deal → hold → draw → payout)
- [ ] IAP purchase flow works end-to-end (purchase → backend validation → balance update)
- [ ] NFT Wallet: List, view metadata, redeem to USDC, transfer to another wallet
- [ ] Balance updates in real-time across all screens
- [ ] Provably Fair verification modal works correctly

## 2. Security (Critical - Blocking)
- [ ] HMAC-signed balance tokens implemented and verified on client
- [ ] On-chain purchase commitment events (`commitPurchase()`) working with batching
- [ ] Certificate pinning active on both iOS and Android
- [ ] Behavioral analytics + cashout blocking gate functional
- [ ] Age gate (18+) enforced before cashout
- [ ] Daily cashout rate limiting active
- [ ] All sensitive data stored in `expo-secure-store`
- [ ] No hardcoded secrets or API keys in client code
- [ ] Request signing implemented for sensitive operations
- [ ] Device attestation in shadow mode (ready to enable)

## 3. Testing
- [ ] All unit and integration tests passing (minimum 80% coverage on critical paths)
- [ ] 28+ security-related tests from PR #10 passing
- [ ] Full E2E test suite completed (purchase → play → cashout → redeem)
- [ ] Manual testing on both iOS and Android devices
- [ ] Testing on rooted/jailbroken devices (security validation)
- [ ] Accessibility audit completed (screen reader support)

## 4. Performance & Polish
- [ ] App feels smooth (no jank, good frame rates)
- [ ] Animations are polished (card flips, win celebrations, transitions)
- [ ] Loading states and error messages are clear and helpful
- [ ] Dark casino theme is consistent across all screens
- [ ] App icon, splash screen, and launch screen finalized

## 5. Backend & Infrastructure
- [ ] All backend services deployed and stable
- [ ] Database migrations applied (`prisma db push`)
- [ ] Smart contract updated and verified on Amoy (if changes were made)
- [ ] EAS Build secrets populated (certificate pins, balance signing key, etc.)
- [ ] Monitoring and alerting configured for critical endpoints

## 6. Documentation & Compliance
- [ ] User-facing documentation updated (how to play, how to redeem, provably fair explanation)
- [ ] Privacy Policy and Terms of Service finalized
- [ ] Age gate (18+) clearly communicated
- [ ] App Store / Play Store descriptions and screenshots prepared
- [ ] All required legal disclaimers in place

## 7. Final Review & Sign-off
- [ ] PR #10 merged to main
- [ ] Full security audit using `LIGHTWEIGHT_SECURITY_AUDIT_TEMPLATE.md` completed
- [ ] All critical and high findings from audit fixed
- [ ] Phase 3.6 Security Hardening Sprint checklist fully completed
- [ ] Grok + Claude both sign off on this checklist

---

**Final Sign-off**

**Grok Signature**: ___________________________ Date: ___________

**Claude Signature**: ___________________________ Date: ___________

**Status**: Ready for Beta / App Store Submission?   YES / NO

---

**Notes / Blockers**:

_______________________________________________________________________________
_______________________________________________________________________________