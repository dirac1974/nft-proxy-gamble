# Security Architecture - NFT Proxy Gamble Platform

**Critical Principle**: This platform handles real money. The highest priority is preventing unauthorized coin creation and fraudulent cashouts.

## Threat Model (Top Risks)

### 1. Client-Side Coin Spoofing (Highest Risk)
- **Attack**: User modifies app (Frida, jailbreak, custom client) to add fake coins
- **Impact**: Cash out fake coins to NFT → redeem real USDC
- **Mitigation**:
  - All balance changes must originate from backend
  - Client never modifies balance (read-only display)
  - Strong server-side validation of all game outcomes and purchases

### 2. IAP Receipt Replay / Forgery
- **Attack**: Reuse or fake purchase receipts
- **Mitigation**:
  - Server-side receipt validation with Apple/Google APIs
  - Store receipt hash + unique nonce in database
  - One-time use enforcement

### 3. Backend Compromise
- **Attack**: Attacker gains access to backend and mints coins or NFTs
- **Mitigation**:
  - Separate hot wallet for MINTER_ROLE (limited funds)
  - Multi-sig for production minter wallet
  - Immutable audit logging of all balance changes
  - Anomaly detection alerts

### 4. Smart Contract Attacks
- **Attack**: Reentrancy, unauthorized mint, USDC drain
- **Mitigation**:
  - OpenZeppelin libraries + audits
  - ReentrancyGuard + Pausable
  - Only MINTER_ROLE can mint
  - Emergency pause + withdrawal functions

## Core Security Layers

### Layer 1: Purchase (IAP)
- Client initiates purchase via Apple/Google
- Backend validates receipt server-side
- Backend credits user balance atomically
- Receipt hash stored to prevent replay

### Layer 2: Game Play
- All game sessions are server-authoritative
- Client sends moves, server validates and returns results + new balance
- Provably fair RNG with seed logging
- Payout calculation happens on backend only

### Layer 3: Cashout to NFT
- User requests cashout with current balance
- Backend verifies session integrity + balance
- Backend calls contract.mint() with signed transaction
- NFT minted with immutable on-chain coinBalance

### Layer 4: Redemption
- User calls redeem() on contract from their wallet
- Contract burns NFT and transfers USDC
- Backend listens for events for analytics only

## Recommended Additional Controls (v1.1+)

- Device attestation (Google SafetyNet / Apple DeviceCheck)
- Minimum 5-minute delay between large purchases and cashout
- Daily cashout limits per wallet
- Behavioral analytics (sudden win rate spikes)
- Optional: On-chain purchase commitment events

## Monitoring & Response
- Real-time alerts on large redemptions
- Automatic flagging of suspicious accounts
- Emergency contract pause capability
- Incident response playbook

**Golden Rule**: If in doubt, the backend wins. The client is untrusted.