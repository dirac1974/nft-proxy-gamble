# Fraud Detection Implementation & Testing Checklist

**For Claude** – Complete these tasks to implement the Fraud Pause Engine.

## Phase 1: Foundation (1–2 days)

- [ ] Create `FraudScoringService.ts` with risk scoring logic
- [ ] Create database migration for `TransactionRisk` table
- [ ] Add risk scoring call after successful IAP validation
- [ ] Add risk scoring call before NFT cashout
- [ ] Store risk score + reasons in database

## Phase 2: Core Logic (2–3 days)

- [ ] Implement risk scoring algorithm (velocity, device fingerprint, IP, failed signatures, behavioral flags)
- [ ] Create `TransactionPauseService.ts`
- [ ] Add logic: if risk > 60 → set status to `PAUSED`
- [ ] Create admin API endpoints:
  - `GET /admin/flagged-transactions`
  - `POST /admin/approve-transaction`
  - `POST /admin/reject-transaction`
- [ ] Add Slack/PagerDuty webhook for High risk pauses

## Phase 3: Testing (2 days)

- [ ] Unit tests for risk scoring logic (minimum 15 tests)
- [ ] Integration tests for pause flow
- [ ] Adversarial tests:
  - Rapid purchase attempts
  - Fake device fingerprint
  - Replay attack with modified timestamp
- [ ] Test admin approval/rejection flow
- [ ] Load test with simulated high-risk traffic

## Phase 4: Rollout (1 day)

- [ ] Deploy in shadow mode (log only, no pausing)
- [ ] Monitor risk score distribution for 3–5 days
- [ ] Tune scoring weights if needed
- [ ] Enable Medium risk flagging
- [ ] Enable automatic pause for High risk (after approval)

## Phase 5: Documentation & Monitoring

- [ ] Update `SECURITY_ARCHITECTURE.md` with Fraud Pause Engine
- [ ] Add admin guide for reviewing flagged transactions
- [ ] Create runbook for fraud incident response
- [ ] Set up weekly fraud report automation

**Target Completion**: 7–10 days
**Owner**: Claude
**Reviewer**: Grok (after each phase)