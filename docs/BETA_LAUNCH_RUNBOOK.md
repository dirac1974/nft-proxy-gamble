# Beta Launch Runbook - NFT Proxy Gamble

**Goal**: Launch the app to closed beta (TestFlight + Google Play Internal Testing) with maximum safety and monitoring.

**Target Audience**: 50–100 trusted testers (friends, family, early supporters)

**Estimated Timeline**: 3–5 days from start to first testers

---

## Phase 1: Pre-Launch Checklist (Day 1)

### Code & Quality
- [ ] All Phase 3 items from `PHASE_3_COMPLETION_CHECKLIST.md` marked complete
- [ ] PR #10 merged and main branch is clean
- [ ] Final E2E tests passed on physical devices
- [ ] No critical or high security findings from lightweight audit
- [ ] App version bumped (e.g., 0.9.0-beta.1)

### EAS Build Configuration
- [ ] EAS secrets populated for `production` profile
- [ ] Certificate pinning keys added
- [ ] Balance signing key configured
- [ ] Build profiles tested (dev → testnet → production)

### Legal & Compliance
- [ ] Privacy Policy published and linked in app
- [ ] Terms of Service published
- [ ] Age gate (18+) clearly visible
- [ ] App Store / Google Play descriptions finalized
- [ ] Screenshots and preview videos prepared (iPhone + Android)

---

## Phase 2: Build & Submit (Day 2)

### iOS (TestFlight)
1. Run `eas build --profile production --platform ios`
2. Wait for build to complete
3. Upload to App Store Connect via EAS or manually
4. Add build to TestFlight
5. Add internal testers (up to 100)
6. Submit for review (usually 1–2 days)

### Android (Internal Testing)
1. Run `eas build --profile production --platform android`
2. Upload to Google Play Console via EAS
3. Create Internal Testing track
4. Add testers via email list
5. Publish (usually instant)

---

## Phase 3: Monitoring & Support (Day 2–3)

### Backend Monitoring
- [ ] Set up alerts for:
  - High cashout volume
  - Failed HMAC signature validations
  - Behavioral analytics flags
  - 5xx errors on critical endpoints
- [ ] Enable logging for purchase commitments and NFT redemptions

### In-App Support
- [ ] Add "Report Issue" button that opens email or in-app form
- [ ] Create FAQ screen inside the app
- [ ] Prepare response templates for common issues

### Communication Plan
- [ ] Send welcome email to beta testers with:
  - Download links
  - How to report bugs
  - What to test (focus areas)
  - Known issues / limitations

---

## Phase 4: Launch Day (Day 3–4)

1. Confirm both iOS and Android builds are live in testing tracks
2. Send launch announcement to testers
3. Monitor for first 4 hours (high attention)
4. Check for any crash reports or failed purchases
5. Respond to early feedback within 2 hours

---

## Phase 5: Post-Launch (Day 4–5+)

- [ ] Daily review of analytics and error logs
- [ ] Weekly summary report (bugs, feature requests, security flags)
- [ ] Plan for next iteration based on feedback
- [ ] Prepare public launch checklist (if beta goes well)

---

## Emergency Procedures

### Rollback Plan
- If critical bug found:
  1. Pause new tester invitations
  2. Push hotfix build (if possible)
  3. Communicate with testers via email
  4. Revert to previous stable build if needed

### Security Incident
- If fraud or exploit detected:
  1. Immediately enable `DEVICE_ATTESTATION_ENFORCE=true`
  2. Pause cashouts via backend flag
  3. Investigate using behavioral analytics
  4. Notify affected users if necessary

---

## Success Criteria for Beta

- 50+ testers actively using the app
- Crash-free rate > 99.5%
- No critical security incidents
- Positive feedback on core flows (wallet, poker, NFT redemption)
- At least 10 detailed bug reports or suggestions

---

**Owner**: Claude (Lead Developer)
**Reviewer**: Grok (Secondary PM)
**Target Beta Start Date**: TBD

**Status**: Ready to execute when pre-launch checklist is complete.