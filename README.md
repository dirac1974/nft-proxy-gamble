# NFT Proxy Gamble Platform

**A secure, fair, cross-platform mobile gaming platform using NFTs as a regulatory-friendly proxy for coin balances and value transfer in select jurisdictions.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **🚨 IMPORTANT FOR CLAUDE**: Start every session by reading these two files in order:
> 1. `docs/DEVELOPMENT_MEMORY.md` (permanent standards)
> 2. `docs/GROK_FEEDBACK.md` (live feedback + current action items — updated every 6 hours by Grok)

## Overview

This platform allows users to:
- Purchase coins via native iOS App Store and Google Play in-app purchases (IAP).
- Play skill/entertainment games (starting with **9/6 Jacks or Better Video Poker**).
- Cash out remaining coin balance as an **ERC-1155 NFT voucher** stored in the user's self-custodial wallet (MetaMask, Trust Wallet, etc.).
- Redeem the NFT with the platform's "banker" smart contract for equivalent USDC.
- Transfer NFTs P2P to other players/wallets.
- Expand to multiple games (Blackjack, Slots, etc.) via modular architecture.

**Key Innovation**: NFTs act as portable, on-chain proof-of-balance vouchers. This design helps navigate certain gambling regulations by framing interactions as collectible NFTs + entertainment software, while providing true self-custody and crypto redemption.

**Tech Stack (to be implemented by Claude)**:
- **Smart Contracts**: Solidity (ERC-1155 with on-chain coin balance storage + USDC redemption), Hardhat, Polygon (or Base/Optimism for low fees).
- **Backend**: Node.js + TypeScript + Express + Prisma + PostgreSQL (game sessions, IAP verification, mint orchestration, audit logs).
- **Mobile App**: React Native + Expo (iOS/Android), TypeScript, react-native-iap, viem + WalletConnect for wallet integration, beautiful casino UI with animations.
- **Shared**: TypeScript types, paytables, provably-fair RNG utilities.

**Security & Fairness First**: Server-authoritative game logic with verifiable seeds, role-based access control, multi-sig for production banker wallet, full test coverage (>90%), external audit planned.

## Development Team & Workflow (for Claude AI)

This repo is set up for **AI-augmented development**:

- **Primary Project Manager / Owner**: Vernier (@Vernier137)
- **Secondary PM & System Architect**: Grok (xAI) - Created initial structure, specs, and this plan.
- **Lead Developer (80%+ of coding, tests, refinements)**: Claude 3.5 Sonnet / Claude 4 (Anthropic) - You are the star! Read **all docs/** first, **especially DEVELOPMENT_MEMORY.md and GROK_FEEDBACK.md**, follow **IMPLEMENTATION_PLAN.md** strictly in small steps, create feature branches, open PRs for review, write comprehensive tests (Jest + Hardhat + Detox/Maestro for E2E).
- **Security & QA Lead**: Claude (self-review + suggest tools like Slither, MythX, OWASP ZAP).

**Claude Instructions**:
1. **Always start by reading in this exact order**:
   - `docs/DEVELOPMENT_MEMORY.md` (permanent rules)
   - `docs/GROK_FEEDBACK.md` (live feedback + action items — updated every 6 hours)
   - `docs/IMPLEMENTATION_PLAN.md`
2. **Think deeply and plan thoroughly before implementing** — follow the mandatory pre-implementation checklist in DEVELOPMENT_MEMORY.md.
3. Work in **small, testable steps** as outlined in the plan. Never skip tests.
4. Use **feature branches** (`git checkout -b phase-1-contracts`).
5. For every major component, create a GitHub Issue first, assign to yourself, then PR.
6. Prioritize **security, determinism, and auditability** over speed.
7. When stuck or needing clarification, open an issue or comment here.
8. After each phase, update ROADMAP.md and create a summary PR.

**How to use with Claude**:
- Paste the repo URL + specific file (e.g. "Implement Phase 1 from IMPLEMENTATION_PLAN.md in nft-proxy-gamble repo") into Claude.
- Or give Claude access via GitHub (read/write via PAT if needed, but prefer PR workflow).

## Quick Start (Local Dev - After Claude Implements)

```bash
# Contracts
cd contracts && npm install && npx hardhat test

# Backend
cd backend && npm install && npm run dev

# Mobile
cd mobile && npx expo start
```

See `docs/IMPLEMENTATION_PLAN.md` and `docs/DEVELOPMENT_MEMORY.md` for the complete phased rollout with full tests at every step.

## Current Status
**v0.1.0 Skeleton + Phase 1 contract** — `NFTProxyVoucher.sol` implemented, 34 tests green, coverage 100% statements / 97% branches / 100% functions / 100% lines on the main contract. Awaiting testnet deploy.

**Next Milestone**: Polygon Amoy deploy + verification on Polygonscan, then Phase 2 (backend).

## Deployments

| Network | Contract | Address | Tx |
|---|---|---|---|
| Polygon Amoy (testnet) | `NFTProxyVoucher` | _pending_ | _pending_ |
| Polygon mainnet | `NFTProxyVoucher` | _Phase 6_ | _Phase 6_ |

### Deploying to Amoy

Prerequisites (operator runs locally — **Claude never touches these**):

1. Copy `contracts/.env.example` → `contracts/.env`.
2. Fill `PRIVATE_KEY` with a dedicated low-balance Amoy key (NOT a key holding mainnet funds).
3. Fund the key with Amoy MATIC from the [Polygon faucet](https://faucet.polygon.technology/).
4. Set `POLYGONSCAN_API_KEY` from https://polygonscan.com/myapikey.
5. (Optional) override `USDC_ADDRESS` if Circle relocates the testnet token.

```bash
cd contracts
npm ci
npm run compile
npm test                 # 34 tests, all green
npm run deploy:amoy      # prints address + writes contracts/deployments/amoy.json
npx hardhat verify --network amoy <addr> <usdc>
```

After deploy, fund the contract with test USDC (faucet or mock) before opening redemptions, and grant `MINTER_ROLE` to the backend hot wallet (script lands in Phase 2).

## License
MIT - See LICENSE.md

## Disclaimer
This is entertainment software + digital collectibles. Not real-money gambling in restricted jurisdictions. Users must be 18+. Comply with all local laws. The platform uses NFTs as proxies for value in compliant setups only. No financial advice. RTP for initial game ~99.54% (player-favorable 9/6 Jacks or Better).