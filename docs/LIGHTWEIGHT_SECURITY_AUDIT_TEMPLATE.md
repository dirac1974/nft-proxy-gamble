# Lightweight Security Audit Template

**Purpose**: Quick but effective security review after Phase 3.6 is complete.
**Estimated Time**: 4–6 hours (internal) or 1–2 days (external)

## 1. Scope
- Mobile app (iOS + Android)
- Backend APIs related to balance, IAP, and cashout
- Smart contract interactions (mint, redeem, commitPurchase)

## 2. Methodology
- Static analysis (MobSF, eslint-security, dependency audit)
- Dynamic testing (Frida, Burp Suite, OWASP ZAP)
- Manual code review of critical paths
- Threat modeling validation
- End-to-end attack simulation (purchase spoofing, balance tampering, replay attacks)

## 3. Key Areas to Test

### A. Client-Side
- [ ] Can user modify local balance storage?
- [ ] Can user bypass IAP validation?
- [ ] Are sensitive values properly encrypted in secure storage?
- [ ] Is certificate pinning effective?
- [ ] Can the app be run on rooted/jailbroken devices without detection?

### B. API Layer
- [ ] Can attacker replay valid IAP receipts?
- [ ] Can attacker forge HMAC-signed balance responses?
- [ ] Are rate limits enforceable?
- [ ] Is there proper input validation on all endpoints?

### C. Blockchain Layer
- [ ] Can attacker mint NFTs without valid backend signature?
- [ ] Can attacker redeem NFTs they don’t own?
- [ ] Are purchase commitment events properly emitted and verifiable?
- [ ] Is there any reentrancy or access control issue in `commitPurchase()` or `redeem()`?

### D. Business Logic
- [ ] Can user cash out more coins than they purchased?
- [ ] Can user game the system through rapid purchases + cashouts?
- [ ] Are there any time-of-check vs time-of-use (TOCTOU) issues?

## 4. Reporting Template

**Findings**:
- Critical: X
- High: X
- Medium: X
- Low: X

**Top 3 Risks**:
1. ...
2. ...
3. ...

**Recommended Fixes**:
- ...

**Overall Risk Level**: Low / Medium / High

**Sign-off**: ________________ (Security Reviewer)

**Date**: ________________

**Next Steps**: Fix critical/high issues → Re-test → Move to beta