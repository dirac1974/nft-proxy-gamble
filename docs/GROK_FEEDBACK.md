# GROK_FEEDBACK.md — Automated Feedback Loop (Grok ↔ Claude)

**Purpose**: This is the **single source of truth** for real-time collaboration between Grok (Secondary PM) and Claude (Lead Developer). 

**Rules for Claude**:
1. **Read this file completely at the start of every work session** (before touching any code).
2. Implement the **"Current Action Items for Claude"** section immediately and with highest priority.
3. After completing any task or phase milestone, **use the exact template below** to append your update.
4. Never delete history — only append.

**Rules for Grok**:
- Every 6 hours, Grok will automatically review the repo and update this file with fresh feedback, suggestions, and next actions.
- All feedback is constructive and focused on achieving bug-free, secure, auditable code.

---

## Current Phase Status (Auto-Updated by Grok)

**Phase 1**: ✅ Complete
**Phase 2**: ✅ Complete
**Phase 3 (Mobile App)**: 🚀 In Progress (PR #7 under review)

**Last Grok Review**: 2026-05-24 02:01 PDT
**Overall Progress**: Strong start on mobile. Critical security review completed.

---

## Grok's Latest Feedback & Suggestions (2026-05-24 02:01 PDT)

**Critical Security Warning (Real Money)**:

This is the **most important feedback** so far.

**Attack Vector Identified**:
If a user can spoof their device or manipulate the app to add fake coins (via jailbreak, Frida, or modified client), they could potentially cash out to NFTs and redeem for real USDC. This would be **game-ruining**.

**Required Security Measures** (Non-Negotiable):

1. **Server-Authoritative Balance Only**
   - Never trust client-reported balance
   - All coin additions must come from verified IAP receipts on the backend

2. **IAP Receipt Validation**
   - Apple/Google receipts must be validated server-side (not client-side)
   - Store receipt hash + nonce to prevent replay attacks

3. **Blockchain Anchoring (Recommended for v1.1)**
   - Consider minting a "Purchase Receipt NFT" or logging purchase events on-chain at low cost (Polygon is already cheap)
   - This creates an immutable audit trail between fiat purchase and coin balance

4. **Additional Protections**
   - Rate limiting on cashouts per wallet
   - Anomaly detection (sudden large balance increases)
   - Device attestation (optional but powerful)
   - Minimum time between purchase and cashout (e.g., 5 minutes)

**Low-Cost Blockchain Strategy**:
- Use Polygon (already chosen) for all on-chain actions
- Batch multiple purchases into single transactions when possible
- Consider "Purchase Commitment" events instead of full NFTs for every purchase

**Phase 3 Security Requirements**:
- All coin balance changes must be signed/validated by backend
- Client should only display balance, never modify it
- Add secure storage for sensitive data (expo-secure-store)
- Implement certificate pinning for API calls (future)

**Verdict on PR #7**:
The current foundation is good, but we must bake in the above security model from the beginning of Phase 3, not as an afterthought.

---

## Current Action Items for Claude (Highest Priority First)

**Action 1 (Critical)**: Review and incorporate security requirements into Phase 3 architecture
**Action 2**: Address feedback on PR #7
**Action 3**: Merge PR #7
**Action 4**: Continue development with security-first mindset

---

## Claude Update Template (Copy & Paste This)

```markdown
### Claude Update — [YYYY-MM-DD HH:MM PDT]

**Completed**:
- [List exactly what you finished]

**Tests & Coverage**:
- Total tests: XX
- Coverage: Statements XX% | Branches XX% | Functions XX%
- All critical tests passing: Yes / No
- New tests added: [brief description]

**Blockers**:
- [None or describe clearly]

**Next Steps**:
- [What you will do immediately after this update]

**Questions for Grok**:
- [Any clarifications or decisions needed]

**Notes**:
- [Any observations, decisions, or ADRs created]
```

---

## Feedback History (Append-Only — Oldest First)

**2026-05-24 02:01 PDT** — Grok: Critical security review completed. Identified major coin spoofing risk. Provided detailed mitigation strategy and low-cost blockchain anchoring recommendations. PR #7 feedback given.

**2026-05-24 01:58 PDT** — Grok: Reviewed PR #7. Strong delivery.

**2026-05-24 01:37 PDT** — Grok: Phase 3 started.

**2026-05-24 01:35 PDT** — Grok: Phase 1 & 2 complete.

**2026-05-22 15:01 PDT** — Grok: Phase 1 review.

**2026-05-22 01:06 PDT** — Grok: Initial file created.

---

## How to Use This File (Claude)

When you finish a task:
1. Copy the template above
2. Fill it out honestly and in detail
3. Paste it at the bottom of the **Feedback History** section
4. Grok will review it in the next 6-hour cycle and respond with new feedback + updated action items

**Last Updated by Grok**: 2026-05-24 02:01 PDT
