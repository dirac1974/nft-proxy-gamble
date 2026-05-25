# Final Pre-Beta Checklist - Security & Stability Focus

**Purpose**: Ensure the platform is secure, stable, and ready for closed beta before inviting real testers.

**Priority**: Security & Stability items are **BLOCKING**. All must pass before beta launch.

**Sign-off Required**: Grok + Claude

---

## 1. Security (Non-Negotiable)

- [ ] HMAC-signed balance tokens fully implemented and verified on client
- [ ] On-chain purchase commitment events (`commitPurchase()`) working with batching
- [ ] Certificate pinning active on both iOS and Android
- [ ] Behavioral analytics + cashout blocking gate functional
- [ ] Age gate (18+) enforced before any cashout
- [ ] Daily cashout rate limiting active (max 5 per day per wallet)
- [ ] All sensitive data stored in `expo-secure-store` only
- [ ] No hardcoded secrets or API keys in client code
- [ ] Request signing implemented for sensitive operations
- [ ] Device attestation in shadow mode (ready to enforce after beta data collection)
- [ ] All critical security findings from `SECURITY_AUDIT_2026-05-25.md` resolved

## 2. Stability & Reliability

- [ ] Crash-free rate > 99.5% on latest builds
- [ ] All 194 tests passing (40 contract + 73 backend + 81 mobile)
- [ ] 5 Maestro E2E flows passing on physical devices
- [ ] Adversarial tests passing (forged signature rejection, IAP replay protection)
- [ ] No memory leaks or performance degradation after 30+ minutes of use
- [ ] Backend handles concurrent sessions without errors

## 3. Backend & Infrastructure

- [ ] Updated contract deployed and verified on Amoy
- [ ] Prisma migrations applied successfully
- [ ] EAS secrets populated for production profile
- [ ] Monitoring & alerting active (Sentry, backend logs, on-chain events)
- [ ] Rate limiting and error handling working correctly

## 4. User Experience & Polish

- [ ] All core flows work smoothly (Wallet → Poker → Cashout → NFT → Redeem)
- [ ] Loading states, error messages, and success feedback are clear
- [ ] Animations are polished (card flips, transitions, win celebrations)
- [ ] Dark casino theme is consistent across all screens
- [ ] Accessibility fixes applied and verified

## 5. Documentation & Compliance

- [ ] Privacy Policy and Terms of Service live and linked in app
- [ ] Age gate (18+) clearly communicated to users
- [ ] Beta tester welcome email and onboarding guide prepared
- [ ] In-app feedback/report bug system functional

## 6. Final Sign-off

- [ ] All items above marked complete
- [ ] Lightweight Security Audit completed with no critical/high findings
- [ ] Grok + Claude both approve this checklist

---

**Final Sign-off**

**Grok**: ___________________________ Date: ___________

**Claude**: ___________________________ Date: ___________

**Beta Launch Decision**: APPROVED / NOT APPROVED

**Notes / Remaining Blockers**:
_______________________________________________________________________________
_______________________________________________________________________________