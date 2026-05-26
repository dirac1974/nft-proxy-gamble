# Fraud Detection & Transaction Pause System Design

**Goal**: Add a real-time fraud detection layer that can automatically pause high-risk transactions for admin review, protecting against IAP bypass, balance manipulation, and other pre-blockchain attacks.

**Name**: Fraud Pause Engine (FPE)

---

## 1. System Overview

The Fraud Pause Engine sits between purchase validation and coin crediting / cashout approval. It assigns a **Risk Score** to every transaction and can:
- Allow normal flow (Low risk)
- Add delay + flag for review (Medium risk)
- Automatically pause and require admin approval (High risk)

---

## 2. Risk Scoring Model

Each transaction receives a score from 0–100 based on weighted factors:

| Factor                        | Weight | Description |
|-------------------------------|--------|-------------|
| Purchase velocity             | 25     | Multiple purchases in short time |
| New account + large purchase  | 20     | Account age < 24h + purchase > $50 |
| Device fingerprint change     | 15     | Sudden change in device ID |
| IP change                     | 10     | Different country or VPN |
| Failed signature validations  | 15     | Multiple HMAC failures |
| Behavioral analytics flags    | 15     | Existing anomaly flags |

**Risk Levels**:
- **0–30** = Low (Normal flow)
- **31–60** = Medium (Flag + slight delay)
- **61–100** = High (Pause + Admin Review)

---

## 3. Architecture

### Components
1. **FraudScoringService** (Backend)
   - Calculates risk score in real time
   - Stores score + reason in `TransactionRisk` table

2. **TransactionPauseService**
   - Checks risk score before crediting coins or allowing cashout
   - If High risk → sets status to `PAUSED` and notifies admins

3. **Admin Review Queue** (Simple dashboard or API endpoints)
   - List of paused transactions
   - Approve / Reject buttons
   - Reason for pause shown

### Database Changes
```sql
CREATE TABLE TransactionRisk (
  id SERIAL PRIMARY KEY,
  transactionId INTEGER REFERENCES "Transaction"(id),
  riskScore INTEGER,
  reasons JSONB,
  status VARCHAR(20) DEFAULT 'PENDING',
  reviewedBy INTEGER REFERENCES "User"(id),
  reviewedAt TIMESTAMP,
  createdAt TIMESTAMP DEFAULT NOW()
);
```

---

## 4. Integration Points

- **After IAP Receipt Validation** → Run fraud scoring before crediting coins
- **Before NFT Cashout** → Run fraud scoring before allowing mint
- **Before NFT Redemption** → Optional extra check

---

## 5. Admin Actions

- Approve → Credit coins / allow cashout
- Reject → Reverse transaction + flag account
- Escalate → Mark for deeper investigation

---

## 6. Monitoring & Alerts

- Real-time Slack/PagerDuty alert when High risk transaction is paused
- Daily summary of flagged transactions
- Weekly fraud attempt report

---

## 7. Phased Rollout (Recommended)

**Phase 1 (Immediate)**: Log risk scores only (shadow mode)
**Phase 2 (After 1 week of data)**: Enable Medium risk flagging
**Phase 3 (After 2 weeks)**: Enable automatic pause for High risk transactions

---

**This system significantly reduces the window for pre-blockchain fraud while keeping the user experience smooth for legitimate players.**