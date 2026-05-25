# Final Pre-Beta Checklist - Security & Stability Focus

**Purpose**: Ensure the platform is secure, stable, and ready for closed beta before inviting real testers.

**Priority**: Security & Stability items are **BLOCKING**. All must pass before beta launch.

**Sign-off Required**: Grok + Claude

---

## 1. Security (Non-Negotiable)

- [x] HMAC-signed balance tokens fully implemented + verified on client (`backend/src/services/balanceSigning.ts` + `mobile/src/services/balanceVerification.ts`)
- [x] On-chain `commitPurchase()` working with 20-item batching (`purchaseCommitmentService.ts`; failures non-fatal — coins already credited, audit log only)
- [x] Certificate pinning configured iOS + Android (`app.config.js` NSPinnedDomains + `withAndroidCertPinning` plugin; placeholders in dev, real SPKI hashes needed in EAS prod env)
- [x] Behavioral analytics + cashout blocking gate functional (`analyticsService.ts` with 4 flags, BLOCKED enforced at `/game/cashout`)
- [x] Age gate (18+) enforced before cashout (`User.ageConfirmed` checked server-side)
- [x] Daily cashout rate limiting active (max 5 per UTC day per user)
- [x] All sensitive data in `expo-secure-store` only (`walletStore.ts`; grep confirms zero AsyncStorage usage)
- [x] No hardcoded secrets or API keys in client code (grep clean)
- [x] Request signing on sensitive operations (HMAC attestation headers on `/game/cashout` + `/iap/verify-purchase`)
- [x] Device attestation in shadow mode (`deviceAttestationService.ts`; `DEVICE_ATTESTATION_ENFORCE` flag flips to enforce)
- [x] All critical security findings from `SECURITY_AUDIT_2026-05-25.md` resolved — B-1 TOCTOU (`099b9a5`) + B-2 tokenId parsing (`a10f36e`) shipped with regression tests

## 2. Stability & Reliability

- [ ] Crash-free rate > 99.5% on latest builds — needs Sentry data after beta launch
- [x] All 194 tests passing (40 contract + 73 backend + 81 mobile) — verified on `main` HEAD
- [ ] 5 Maestro E2E flows passing on physical devices — flows written (`mobile/e2e/flows/*.yaml`), execution deferred to device pass
- [x] Adversarial tests passing — forged-signature rejection (`balanceVerification.test.ts`) + IAP replay protection (`iap.ts:84-86` P2002 → 409)
- [ ] No memory leaks / perf degradation after 30+ min use — needs device runtime
- [x] Backend handles concurrent sessions without errors — B-1 fix specifically addresses the parallel-cashout TOCTOU exploit

## 3. Backend & Infrastructure

- [x] Updated contract deployed + verified on Amoy — `0x2Ed681d659E67A0ef154875CA4743Ed865B60255` with `commitPurchase()` confirmed in bytecode
- [x] Prisma migrations applied — Supabase project `yzodntgnaydfkqvibmff`, 6 tables + 4 enums live, Transaction Pooler connection verified
- [ ] EAS secrets populated for production profile — `CERT_PIN_PRIMARY`/`CERT_PIN_BACKUP` need real hashes; `EXPO_PUBLIC_BALANCE_VERIFY_KEY` derived locally but needs `eas secret:create` for prod
- [ ] Monitoring & alerting active (Sentry, backend logs, on-chain events) — plan exists in `POST_LAUNCH_MONITORING_PLAN.md`, tool integration pending
- [x] Rate limiting and error handling working — `authLimiter` (10/min) + `gameLimiter` (60/min); `errorHandler.ts` strips stacks, generic 500

## 4. User Experience & Polish

- [ ] All core flows work smoothly (Wallet → Poker → Cashout → NFT → Redeem) — code-complete; smoothness verification needs device
- [x] Loading states, error messages, success feedback are clear (audited across all screens + modals)
- [x] Animations implemented (card flips, transitions, WinOverlay celebration, Reanimated payout pulse)
- [x] Dark casino theme consistent across all screens (`theme/colors.ts` enforced)
- [x] Accessibility fixes applied + verified — 3 a11y gaps closed today (bet chips, IAPSheet backdrop, PaytableModal backdrop); every user-facing Pressable now has role + label

## 5. Documentation & Compliance

- [ ] Privacy Policy and Terms of Service live + linked in app — needs legal review
- [x] Age gate (18+) clearly communicated to users (AgeGateModal copy)
- [x] Beta tester onboarding guide prepared — `docs/USER_GUIDE.md` covers play, cashout, provably-fair verification
- [ ] In-app feedback / report-bug system functional — not implemented

## 6. Final Sign-off

- [ ] All items above marked complete — remaining gaps: legal (privacy/ToS), device-runtime verification, operational wiring (EAS secrets + monitoring + in-app feedback)
- [x] Lightweight Security Audit completed with no critical/high findings open — see `docs/SECURITY_AUDIT_2026-05-25.md`; 2 HIGH bugs found *during* the audit, both shipped fixed
- [ ] Grok + Claude both approve this checklist — pending Grok re-review post-audit

---

**Final Sign-off**

**Grok**: ___________________________ Date: ___________

**Claude**: ___________________________ Date: ___________

**Beta Launch Decision**: APPROVED / NOT APPROVED

**Notes / Remaining Blockers**:
_______________________________________________________________________________
_______________________________________________________________________________