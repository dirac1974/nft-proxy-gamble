# Phase 3 Completion Checklist

**Goal**: Ensure the mobile app is production-ready, secure, and polished before moving to public beta / App Store submission.

**Sign-off Required**: Grok + Claude must both approve before proceeding to beta.

---

## 1. Core Features (Must Have)
- [x] All 4 main screens fully functional (Lobby/index.tsx, Video Poker/play.tsx, My NFTs/nfts.tsx, Profile/profile.tsx)
- [ ] Wallet connection works reliably (connect, disconnect, network switching) — code complete, needs device test
- [x] Full Video Poker flow (bet → deal → hold → draw → payout) — code complete, server-authoritative
- [ ] IAP purchase flow works end-to-end — **REGRESSION**: `iapService.ts` is stubbed due to react-native-iap v12 incompat w/ RN 0.81. Needs migration to expo-iap@4.3.1
- [x] NFT Wallet: List + view metadata + redeem to USDC (nfts.tsx + redeem flow); transfer modal exists (TransferModal.tsx)
- [x] Balance updates in real-time across all screens (React Query invalidation on mutations)
- [x] Provably Fair verification modal works correctly (ProvablyFairModal.tsx + viem keccak256 reimplementation)

## 2. Security (Critical - Blocking)
- [x] HMAC-signed balance tokens implemented and verified on client (`backend/src/services/balanceSigning.ts` + `mobile/src/services/balanceVerification.ts`)
- [x] On-chain purchase commitment events (`commitPurchase()`) working with batching (`purchaseCommitmentService.ts`, 20-item batches)
- [x] Certificate pinning active on both iOS and Android (app.config.js NSPinnedDomains + withAndroidCertPinning plugin; placeholders in dev)
- [x] Behavioral analytics + cashout blocking gate functional (`analyticsService.ts`, 4 anomaly flags, BLOCKED risk level)
- [x] Age gate (18+) enforced before cashout (AgeGateModal, `User.ageConfirmed` checked server-side in `/game/cashout`)
- [x] Daily cashout rate limiting active (`UserAnalytics.cashoutsToday` reset at midnight)
- [x] All sensitive data stored in `expo-secure-store` (walletStore.ts: JWT, wallet address, userId)
- [x] No hardcoded secrets or API keys in client code (verified — all sensitive values via env)
- [x] Request signing implemented for sensitive operations (attestation HMAC headers on cashout + IAP)
- [x] Device attestation in shadow mode (ready to enable) (`deviceAttestationService.ts`, `DEVICE_ATTESTATION_ENFORCE` flag in backend)

## 3. Testing
- [x] All unit and integration tests passing (Contracts 40/40, Backend unit 70/70, Mobile 81/81)
- [x] 28+ security-related tests from PR #10 passing (HMAC, attestation, analytics, commitment service)
- [x] E2E test suite written (5 Maestro flows: wallet-connect, IAP, game+cashout, adversarial balance, dup IAP)
- [ ] Manual testing on both iOS and Android devices — needs device with running build
- [ ] Testing on rooted/jailbroken devices (security validation) — not run yet
- [x] Accessibility audit: interactive elements have accessibilityRole + accessibilityLabel (verified during a11y sprint)

## 4. Performance & Polish
- [ ] App feels smooth (no jank, good frame rates) — needs device test
- [x] Animations implemented (card flips, win celebrations via WinOverlay, payout pulse via Reanimated)
- [x] Loading states + error messages present across mutations and queries
- [x] Dark casino theme consistent (theme/colors.ts, used everywhere)
- [ ] App icon, splash screen, and launch screen finalized — currently placeholder PNGs (`mobile/assets/`); needs design assets

## 5. Backend & Infrastructure
- [x] All backend services deployed locally and verified end-to-end (DB + contract smoke test passes)
- [x] Database migrations applied (Supabase schema live, 6 tables)
- [x] Smart contract updated and verified on Amoy (`0x2Ed681d659E67A0ef154875CA4743Ed865B60255`, has `commitPurchase()`)
- [ ] EAS Build secrets populated — pending; see `mobile/SECRETS_CHECKLIST.md`
- [ ] Monitoring and alerting configured for critical endpoints — plan exists (POST_LAUNCH_MONITORING_PLAN.md), tools not wired yet

## 6. Documentation & Compliance
- [ ] User-facing documentation (how to play, how to redeem, provably fair explanation) — needs writing
- [ ] Privacy Policy and Terms of Service finalized — needs legal review
- [x] Age gate (18+) clearly communicated (AgeGateModal copy)
- [ ] App Store / Play Store descriptions and screenshots prepared — needs design + copy work
- [ ] All required legal disclaimers in place — needs legal review

## 7. Final Review & Sign-off
- [x] PR #10 merged to main (security-hardening squash, see commit 8520493 / 85ccdfa / 34c49f3 / 9afff2b)
- [ ] Full security audit using `LIGHTWEIGHT_SECURITY_AUDIT_TEMPLATE.md` completed — pending fresh pass
- [ ] All critical and high findings from audit fixed — depends on audit
- [x] Phase 3.6 Security Hardening Sprint checklist fully completed
- [ ] Grok + Claude both sign off on this checklist — pending Grok re-review post-deploy

---

**Final Sign-off**

**Grok Signature**: ___________________________ Date: ___________

**Claude Signature**: ___________________________ Date: ___________

**Status**: Ready for Beta / App Store Submission?   YES / NO

---

**Notes / Blockers**:

_______________________________________________________________________________
_______________________________________________________________________________