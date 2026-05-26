# Beta Launch Runbook - NFT Proxy Gamble

**Goal**: Launch the app to closed beta (TestFlight + Google Play Internal Testing) with maximum safety and monitoring.

**Target Audience**: 5–15 invited testers for initial closed beta (NDA + screening). Scale to 50–100 in week 2 if no P0 alerts fire.

**Estimated Timeline**: 3–5 days from start to first testers

## Current Blockers (as of 2026-05-26)

These are the items between now and being able to execute Phase 1 of this runbook. See `docs/ROADMAP.md` Milestone M0 for the canonical list, summarized here:

| Blocker | Owner | What it unblocks |
|---|---|---|
| EAS secrets populated (`CERT_PIN_PRIMARY`/`_BACKUP`, `EXPO_PUBLIC_BALANCE_VERIFY_KEY`) | David | `eas build` produces a valid TestFlight binary |
| Apple Developer + Google Play Developer accounts | David | App Store Connect + Play Console access |
| Privacy Policy + Terms of Service live | Legal | App Store / Play Store submission |
| Sentry SDK wired in backend + mobile | Claude (waiting on SENTRY_DSN) | Crash + error tracking actionable |
| App icon + splash designs | Design | Currently placeholder PNGs in `mobile/assets/` |

Code is ready. Tests are green. Infrastructure is ready. The blocking work is accounts + design + legal.

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

## Closed User Group Setup

The first 5–15 testers go through a tighter screen than the broader 50-100 second-wave group.

### Selecting testers

Pick testers along these axes so you cover the space:

- **At least 2 iOS, 2 Android.** Different OS versions if possible (iOS 17 + iOS 18; Android 13 + Android 14).
- **Mix of wallet types.** MetaMask Mobile is the primary, but include 1-2 testers on Rainbow, Trust Wallet, and Coinbase Wallet to find WalletConnect compatibility issues.
- **Mix of crypto literacy.** Include 2 testers who have never bought USDC or used a wallet — they'll surface the onboarding friction we miss internally.
- **At least 1 tester in a different time zone** so the on-call sees what an off-hours session looks like.

### NDA + ground rules (paste into the invite email)

> You're being invited to a private beta of NFT Proxy Gamble. Before you join:
>
> **Confidentiality**: please do not share screenshots, video, the app binary, or anything else from this beta publicly. We'll lift this restriction when we go public; for now everything is under NDA.
>
> **What this is**: a testnet build on Polygon Amoy. All coins, vouchers, and "USDC" are testnet — none of this is real money. Do not send any mainnet funds to any address in the app.
>
> **Known limitations**: IAP runs in sandbox mode (you won't be charged). Device attestation is in shadow mode — we're collecting samples, not blocking. Some screens still have placeholder art.
>
> **How to report issues**: use the "Report a bug" link on the Profile tab (opens our GitHub Issues), or "Send feedback" (email). Include OS version + the action you took before the issue.
>
> **What to test, in priority order**:
> 1. Connect wallet → sign in → confirm age → see lobby
> 2. Buy a coin bundle in sandbox
> 3. Play 5+ hands of video poker, including holds
> 4. Cash out to an NFT voucher
> 5. View the voucher on the NFTs tab → redeem for testnet USDC
> 6. Try edge cases: rotate network mid-session, force-quit during draw, etc.
>
> **Reply with**:
> - Your Apple ID email (for TestFlight invite) and/or Google account email (for Internal Testing invite)
> - The wallet address you'll use to test (Polygon Amoy testnet)
> - "I accept" — explicit acceptance of the NDA above

### Tester onboarding checklist (per tester)

- [ ] Apple ID added to TestFlight internal testers list
- [ ] Google account added to the Play Console Internal Testing track
- [ ] Wallet address added to the backend's `BETA_ALLOWLIST` (a simple env var; backend rejects auth from non-allowed addresses during M0)
- [ ] Tester sent some Amoy MATIC (for redemption gas) — small amount, ~0.05 from a treasury wallet
- [ ] Tester acknowledged NDA via reply

### Tester offboarding

After M0 closes, optionally remove testers from the allowlist. Don't remove them from TestFlight / Play (they'll auto-lose access when the M0 build is unpublished).

### Backend `BETA_ALLOWLIST` implementation note

Not yet wired in code. The cleanest spot is in `routes/auth.ts:verify` — after recovering the address, check `if (config.BETA_ALLOWLIST && !config.BETA_ALLOWLIST.includes(address)) throw new AppError(403, "Closed beta only");`. Add `BETA_ALLOWLIST?: z.string().optional()` to the config schema; format is a comma-separated lowercase hex address list. Empty / unset = no restriction (M0 → M1 transition is just deleting the env var).

---

## Monitoring Setup (detailed)

This section is a quick-reference; the full spec is **`docs/MONITORING_ALERTS_SPEC.md`** (concrete thresholds + routing per severity). Read that doc before launch.

**Minimum-viable monitoring for M0** (what must be wired before testers connect):

- [ ] Sentry on both backend and mobile (free tier is fine for 5–15 testers; DSN in EAS secret + backend env)
- [ ] Backend log aggregation to either:
  - Vercel/Supabase logs UI (already there, no setup), OR
  - A Logtail / Better Stack drain if you want better search
- [ ] Manual daily check (per `MONITORING_ALERTS_SPEC.md` §7 "First-week-of-beta watch checklist"):
  - Cashout success rate ≥ 95%
  - No BLOCKED accounts unjustified
  - No `User.coinBalance < 0` rows
  - Hot wallet ≥ 1 MATIC
  - Pending commitPurchase batch empty by end-of-day

**Defer to M1** (acceptable to launch M0 without these, but track them daily by hand):

- On-chain event listener service (poll `VoucherRedeemed`, `PurchaseCommitted`, `Paused`, `EmergencyWithdrawal`)
- Scheduled Postgres integrity queries (run by hand against Supabase SQL editor)
- PagerDuty integration — Slack `#nfpg-incidents` channel notification + phone fallback for the on-call person is sufficient

### What "on-call" looks like for M0

One person carries the pager 24×7 for the first 7 days. Rotates daily after that to whoever is awake in the most active tester timezone. They're responsible for:

- Watching `#nfpg-incidents` (Slack) and Sentry
- Running the daily checklist in `MONITORING_ALERTS_SPEC.md` §7 each morning
- Acknowledging tester reports within 4 hours
- Triggering rollbacks per `docs/ROLLBACK_PLAYBOOK.md` if a P0 fires

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