# Monitoring & Alerting Spec

**Companion to**: `docs/POST_LAUNCH_MONITORING_PLAN.md` (broad strategy)
**This doc**: concrete metric definitions + alert thresholds + alert routing.

**Owner**: backend on-call (whoever holds the pager during beta)
**Date**: 2026-05-26

---

## 0. Alert routing

Three severity levels. Each goes to a different channel:

| Severity | Channel | Response SLA |
|---|---|---|
| **P0** (active exploit / money loss) | PagerDuty + Slack `#nfpg-incidents` | 15 min |
| **P1** (degraded / risk) | Slack `#nfpg-alerts` | 4 hours |
| **P2** (anomaly worth reviewing) | Email digest 08:00 UTC | next business day |

All alerts emit a runbook URL. On-call clicks → docs/ROLLBACK_PLAYBOOK.md or a specific section here.

---

## 1. Money-path alerts (P0)

These guard the actual loss surface. Every one of these can ship real USDC to a bad actor if unattended.

| Alert | Source | Threshold | Why this fires |
|---|---|---|---|
| **Balance went negative** | Postgres trigger / scheduled query | `User.coinBalance < 0` for any user, any time | B-1 fix should make this impossible. Firing = B-1 reverted or new race in some untested path. |
| **NFTVoucher.coinBalance > 100_000** | Postgres scheduled query, every 5 min | Any voucher above MAX | Contract enforces this; backend should never pass through a bigger amount. Firing = contract pause + investigate. |
| **NFTVoucher.tokenId = "0"** beyond first mint | Postgres query | `count(*) WHERE tokenId='0' > 1` (after deploy) | B-2 fix prevents this. Firing = mint orchestrator regression — every NEW voucher is unredeemable. |
| **Cashout success rate < 90%** | Backend log aggregation | `(cashout 2xx) / (cashout total) < 0.90` over 15-min window with ≥ 10 attempts | Either real attacker traffic getting 403'd or legitimate users being false-positived |
| **Single redemption > $500 USDC** | On-chain event listener | `VoucherRedeemed.usdcAmount > 500_000_000` (50_000 coins) | Outsize redemption — verify the user history is consistent |
| **Contract paused unexpectedly** | On-chain event listener | `Paused` event with admin = non-runbook wallet | Possible admin compromise |
| **`emergencyWithdrawUSDC` called** | On-chain event listener | Any `EmergencyWithdrawal` event | Should only happen by deliberate human action with announce |

## 2. Security gate alerts (P0 / P1)

| Alert | Source | Threshold | Severity |
|---|---|---|---|
| **HMAC validation failures > 5/hr** | Backend log: `[balanceVerification] sig mismatch` (we'd need to emit this — see Action below) | 5+ in 60-min window | **P0** — active forgery attempt |
| **Behavioral analytics: BLOCKED events > 3/hr** | Postgres: `count where riskLevel='BLOCKED' AND lastEvaluatedAt > now() - interval '1 hour'` | 3+ in 60-min window | **P0** — coordinated bot or one very persistent user |
| **Device attestation failure rate > 20%** (when enforced) | Backend log | `failure / total > 0.2` over 1 hr, ≥ 50 samples | **P0** if enforce mode active; **P1** during shadow |
| **Cashout-day-limit exceeded (1 over)** | Backend log | Any single user with `> 5` CASHOUT_MINT in a UTC day | **P1** — the non-atomic check we documented in audit. Investigate, doesn't necessarily mean bad actor. |
| **JWT signature failures (401 from `requireAuth`)** | Backend log | `> 100/hr` from a single IP | **P1** — token-stuffing attempt |
| **Auth nonce store growing unbounded** | Process metric | `nonceStore.size > 10_000` | **P1** — DOS attempt or memory leak. Restart server resolves the immediate impact. |
| **Jurisdiction 451 responses** | Backend log | `> 50/hr` to /game/cashout or /iap/verify-purchase from same IP | **P2** — someone shopping for an allowed region |

## 3. Reliability alerts (P1 / P2)

| Alert | Source | Threshold | Severity |
|---|---|---|---|
| **API 5xx rate > 5%** | HTTP log | `5xx / total > 0.05` over 15-min window | **P1** |
| **Backend p95 latency > 500ms** | Request timing log | `/game/draw` or `/game/cashout` p95 > 500ms over 5 min | **P1** |
| **DB connection failures** | Prisma client errors | Any `Can't reach database server` in 5-min window | **P0** — backend can't serve |
| **Mint orchestrator: tx revert rate > 5%** | Backend log: `[mint] failed for voucher ${id}` | `revert / total > 0.05` in 1 hr | **P1** — Polygon RPC issue, low MATIC, or contract paused |
| **Hot wallet MATIC balance < 0.5** | On-chain RPC poll (every 5 min) | balance < 0.5 MATIC | **P1** — top up before it runs out |
| **commitPurchase batch backlog > 100** | Backend memory metric (we'd need to expose `getPendingBatchSize()` via /health) | `pendingBatch.length > 100` | **P1** — Polygon RPC down or backlog growing |
| **Crash-free rate < 99.5%** | Sentry | rolling 24-hour | **P1** if 99.0–99.5%; **P0** if < 99.0% |

## 4. Mobile-side alerts (P2)

| Alert | Source | Threshold |
|---|---|---|
| **`401 → disconnect` rate > 5% of authenticated requests** | Backend log | many users force-logged-out — suggests JWT_SECRET rotation issue or backend clock skew |
| **Maestro suite failure in CI** | GitHub Actions | any flow fails 2 runs in a row |
| **IAP `purchaseErrorListener` fires above expected rate** | Mobile telemetry (TBD — not wired yet) | > 10% of attempts |

## 5. Business alerts (P2 — email digest only)

These are anomaly detection on healthy-state metrics. Not actionable per fire; trend matters.

| Metric | Baseline expectation | Investigate if |
|---|---|---|
| DAU | grows steadily during beta | drop > 20% day over day |
| Average cashout amount | log-normal around 200-500 coins | sudden spike > 2σ above 7-day mean |
| Average bet size | clusters at 1 and 5 (max-bet for Royal Flush) | distribution shifts dramatically |
| Win-rate by user | clusters around 42-44% (paytable expected RTP ~99.54%) | individual user above 50% over 200+ hands → likely a play-skill anomaly, not exploit |

---

## 6. What we still need to instrument

These metrics are referenced above but **not yet emitted by the code**. Wiring them is the work that closes the "monitoring active" checklist item.

1. **Structured balance-verification failure log line**.
   - Add to `mobile/src/services/balanceVerification.ts:verifyAndExtractBalance`: when verification returns null, call a `/log/sig-mismatch` endpoint (or send to Sentry breadcrumb) with `{ reason, userId, sigTimestamp }`. Backend aggregates.
2. **Expose `getPendingBatchSize()` on `/health`** so monitoring can poll it.
3. **Sentry SDK integration** on both mobile (`@sentry/react-native`) and backend (`@sentry/node`). Sentry handles crashes + structured errors + breadcrumbs. Wire `SENTRY_DSN` env var.
4. **On-chain event listener** — a small worker (or scheduled Lambda) that polls `VoucherRedeemed`, `PurchaseCommitted`, `Paused`, `EmergencyWithdrawal` events on the contract. Could be hosted as a separate service or run inline if low-volume.
5. **Postgres scheduled queries** for the integrity invariants (negative balance, voucher bounds, tokenId='0'). Either a cron lambda calling Supabase, or pg_cron.

---

## 7. First-week-of-beta watch checklist

What the on-call should specifically verify each morning during week 1:

- [ ] Yesterday's cashout success rate ≥ 95%
- [ ] No `BLOCKED` accounts that weren't manually justified
- [ ] No `User.coinBalance < 0` rows
- [ ] No vouchers minted with `tokenId = "0"` (other than the very first if any)
- [ ] Hot wallet has ≥ 1 MATIC
- [ ] commitPurchase backlog empty by end of day
- [ ] No new Sentry crash issues unresolved
- [ ] At least one full E2E flow run (manual or Maestro)

---

## 8. Runbooks per alert (link out)

- `docs/ROLLBACK_PLAYBOOK.md` — emergency revert recipes
- `docs/BETA_LAUNCH_RUNBOOK.md` — broader launch / incident playbook (Grok's doc)
- `docs/SECURITY_AUDIT_2026-05-25.md` — known-issue context

Each alert above should embed the relevant link in its description so on-call can click through.

---

**Status**: spec only — wiring listed in Section 6 is what makes the alerts actually fire. Closes the "monitoring threshold spec" half of the FINAL_PRE_BETA_CHECKLIST monitoring item; the integration half is still open.
