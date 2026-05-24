# Post-Launch Monitoring Plan - NFT Proxy Gamble

**Purpose**: Ensure the platform remains secure, stable, and user-friendly after beta and public launch.

**Scope**: Covers both closed beta and public launch phases.

---

## 1. Key Metrics to Track

### Business Metrics
- Daily/Monthly Active Users (DAU/MAU)
- Total coins purchased (daily/weekly)
- Total USDC redeemed (daily/weekly)
- Average session duration
- Retention rate (Day 1, Day 7, Day 30)

### Game Metrics
- Number of hands played per day
- Win rate distribution
- Average bet size
- Cashout rate (% of users who cash out)

### Security Metrics (Critical)
- Number of failed HMAC signature validations
- Number of behavioral analytics flags triggered
- Cashout rejection rate (due to fraud detection)
- Number of blocked accounts
- Purchase commitment success rate
- Device attestation failure rate

### Technical Metrics
- Crash-free rate (target > 99.5%)
- API error rate (target < 1%)
- Average API response time
- Backend CPU/Memory usage
- On-chain transaction success rate

---

## 2. Alerting & Thresholds

### Immediate Alerts (PagerDuty / Slack)
- Crash rate > 2% in any 1-hour window
- Failed HMAC validations > 5 in 1 hour
- Behavioral analytics `BLOCKED` events > 3 in 1 hour
- API 5xx error rate > 5% for 15 minutes
- Large single redemption (> $500) without prior flag

### Daily Alerts (Email/Slack Summary)
- New high-severity security flags
- Unusual purchase patterns (e.g., 10+ purchases from same device in 1 hour)
- Cashout volume significantly above average

### Weekly Reports
- Full security incident summary
- User feedback trends
- Performance trends
- Fraud attempt summary

---

## 3. Security Monitoring

- Real-time monitoring of all cashout and redemption events
- Automatic flagging of accounts with:
  - Rapid purchase + cashout patterns
  - Multiple failed signature validations
  - Device attestation failures
- Daily review of flagged accounts by admin team
- Weekly security report to leadership

---

## 4. User Feedback Collection

- In-app "Report Bug" / "Send Feedback" form
- Weekly survey for active beta testers
- Dedicated email for beta feedback
- Public review monitoring (App Store / Google Play)
- Community channels (Discord / Telegram if launched)

---

## 5. Incident Response

### Severity Levels
- **Critical**: Active exploit or major security breach → Immediate response (< 15 min)
- **High**: Significant bug affecting many users → Response < 1 hour
- **Medium**: Minor bug or UX issue → Response < 24 hours
- **Low**: Feature request or small improvement → Next sprint

### Response Process
1. Detect issue (alert or user report)
2. Triage and assign owner
3. Communicate status to users (if public)
4. Deploy fix or mitigation
5. Post-mortem and lessons learned

---

## 6. Reporting Cadence

| Frequency | Report | Audience |
|-----------|--------|----------|
| Daily     | Security & Crash Summary | Core Team |
| Weekly    | Full Metrics + Feedback Review | Leadership + Team |
| Monthly   | Business + Security Health Report | Stakeholders |

---

## 7. Tools & Infrastructure

- **Backend Logging**: Structured logs + correlation IDs
- **Monitoring**: Datadog / New Relic / Prometheus + Grafana
- **Alerting**: PagerDuty + Slack
- **Crash Reporting**: Sentry
- **Analytics**: Mixpanel / Amplitude / custom backend events
- **On-chain Monitoring**: TheGraph or direct event listeners

---

## 8. Success Metrics for First 30 Days

- Crash-free rate > 99.5%
- No critical security incidents
- > 80% of beta testers active in first week
- Average user rating ≥ 4.2 stars
- Clear feedback leading to actionable improvements

---

**Owner**: Claude (Lead Developer) + Backend Team
**Reviewer**: Grok (Secondary PM)
**Review Frequency**: Weekly for first month, then monthly

**Last Updated**: May 24, 2026