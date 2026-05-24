# Phase 3.6 Security Hardening Sprint Checklist

**Duration**: 5–7 days (can run in parallel with other Phase 3 work)
**Goal**: Make the mobile app as secure as possible before public beta.

## 1. Client-Side Security
- [ ] Implement HMAC-signed balance tokens from backend
- [ ] Store all sensitive data in `expo-secure-store` only
- [ ] Add certificate pinning for all API calls
- [ ] Implement root/jailbreak detection (optional but recommended)
- [ ] Add app integrity checks (Google Play Integrity / Apple DeviceCheck)
- [ ] Obfuscate sensitive code paths (React Native obfuscation)

## 2. IAP Security
- [ ] Ensure all purchase receipts are sent to backend immediately
- [ ] Add client-side receipt validation as secondary check (defense in depth)
- [ ] Implement purchase cooldown (minimum 30 seconds between purchases)
- [ ] Add fraud detection flags (rapid purchases, unusual amounts)

## 3. Wallet & Blockchain Security
- [ ] Implement proper WalletConnect error handling + reconnection logic
- [ ] Add transaction simulation before signing (for redeem/transfer)
- [ ] Store only wallet address (never private keys)
- [ ] Add network mismatch warnings
- [ ] Implement on-chain purchase commitment events (`commitPurchase()`)

## 4. API & Backend Communication
- [ ] All balance-affecting endpoints must return HMAC-signed responses
- [ ] Add request signing for sensitive operations
- [ ] Implement rate limiting with clear UI feedback
- [ ] Add request/response logging (sanitized) for audit

## 5. Game Security (Video Poker)
- [ ] Ensure all game results come from backend (never trust client RNG)
- [ ] Add session timeout (auto-end after 30 min inactivity)
- [ ] Implement max bet limits per session
- [ ] Add win streak / payout anomaly detection

## 6. NFT & Redemption Security
- [ ] Verify NFT ownership on-chain before allowing redeem/transfer
- [ ] Add minimum time between cashout and redeem (5 minutes)
- [ ] Implement daily cashout limits per wallet
- [ ] Add confirmation modal with exact USDC amount before redeem

## 7. Testing & Validation
- [ ] Run full E2E security test suite (purchase → play → cashout → redeem)
- [ ] Perform static analysis (MobSF or similar)
- [ ] Conduct manual penetration testing on key flows
- [ ] Test with rooted/jailbroken devices
- [ ] Verify all security headers are present (CSP, HSTS, etc.)

## 8. Documentation & Monitoring
- [ ] Update threat models with any new findings
- [ ] Add security logging to backend
- [ ] Set up real-time alerts for suspicious activity
- [ ] Create incident response runbook

**Sign-off Required**: Grok must approve this checklist before moving to public beta.