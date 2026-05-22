# Security Considerations & Threat Model

## Core Principles
- **Never trust client**: All game outcomes server-side.
- **Least privilege**: Backend minter wallet has only MINTER_ROLE, limited funds.
- **Verifiability**: Every game outcome reproducible by user.
- **Defense in depth**: Multiple layers (contract guards, backend validation, app hardening).

## Threat Model

### 1. Game Manipulation (Highest Risk)
- **Threat**: User or bot tampers with client to force wins or predict deals.
- **Mitigation**: Server-authoritative + provably fair seeds. All moves validated server-side (invalid hold = reject). Full session replay possible.
- **Test**: Fuzz test RNG and state machine.

### 2. Double Spend / Fake NFT
- **Threat**: User redeems same voucher twice or mints fake.
- **Mitigation**: On-chain burn on redeem, only MINTER can mint, unique tokenIds, on-chain coinBalance immutable.
- **Test**: Hardhat test for re-redeem, unauthorized mint.

### 3. IAP Fraud
- **Threat**: Fake receipts or replay attacks.
- **Mitigation**: Server-side validation with Apple/Google APIs (nonce, bundle ID checks), store receipt hash in DB to prevent replay.
- **Test**: Integration tests with mock receipts.

### 4. Wallet Draining / Phishing
- **Threat**: Malicious dApp or fake app tricks user into signing bad tx.
- **Mitigation**: Clear UI warnings, only interact with verified contract addresses (hardcoded in app), use WalletConnect with domain verification.
- **Test**: UI copy review, simulated phishing.

### 5. Backend Compromise
- **Threat**: Attacker controls minter key or DB.
- **Mitigation**: Rotate keys, use env secrets (Doppler/Vault), immutable audit log (append-only table), multi-sig for large ops, rate limits + anomaly detection.
- **Test**: Chaos engineering (kill minter, verify graceful degrade).

### 6. Smart Contract Risks
- **Threat**: Reentrancy, overflow, access control bypass.
- **Mitigation**: OpenZeppelin libraries, formal verification where possible (future), extensive property-based testing (foundry or hardhat-fuzz).
- **Test**: Slither + manual review checklist.

## Operational Security
- Production minter: Gnosis Safe + 2/3 signers (operator + 2 trusted).
- USDC liquidity: Cold storage 80%, hot contract 20% (auto-refill via keeper).
- Monitoring: Real-time alerts on large redemptions, unusual win rates, failed txs.
- Incident Response: Pause contract (has pausable), freeze redemptions, on-chain emergency withdraw.

## Compliance & Legal
- Full KYC/AML for redemptions > $1,000 or suspicious activity (placeholder API hook).
- Age verification 18+ enforced in app.
- Terms of Service emphasize "entertainment software + NFT collectibles".

**Claude**: After Phase 5, run full security scan and document findings in this file + new ADR.