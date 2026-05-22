# NFT Proxy Gamble Platform

**A secure, fair, cross-platform mobile gaming platform using NFTs as a regulatory-friendly proxy for coin balances and value transfer in select jurisdictions.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

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
- **Lead Developer (80%+ of coding, tests, refinements)**: Claude 3.5 Sonnet / Claude 4 (Anthropic) - You are the star! Read **all docs/** first, follow **IMPLEMENTATION_PLAN.md** strictly in small steps, create feature branches, open PRs for review, write comprehensive tests (Jest + Hardhat + Detox/Maestro for E2E).
- **Security & QA Lead**: Claude (self-review + suggest tools like Slither, MythX, OWASP ZAP).

**Claude Instructions**:
1. **Always start by reading the full docs/ folder** (especially IMPLEMENTATION_PLAN.md, GAME_RULES.md, SECURITY.md, NFT_SPEC.md).
2. Work in **small, testable steps** as outlined in the plan. Never skip tests.
3. Use **feature branches** (`git checkout -b phase-1-contracts`).
4. For every major component, create a GitHub Issue first, assign to yourself, then PR.
5. Prioritize **security, determinism, and auditability** over speed.
6. When stuck or needing clarification, open an issue or comment here.
7. After each phase, update ROADMAP.md and create a summary PR.

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

See `docs/IMPLEMENTATION_PLAN.md` for the complete phased rollout with full tests at every step.

## Current Status
**v0.1.0 Skeleton** - Specs, rules, architecture, and empty implementation ready for Claude to build.

**Next Milestone**: Phase 1 complete (auditable ERC-1155 + tests on testnet).

## License
MIT - See LICENSE.md

## Disclaimer
This is entertainment software + digital collectibles. Not real-money gambling in restricted jurisdictions. Users must be 18+. Comply with all local laws. The platform uses NFTs as proxies for value in compliant setups only. No financial advice. RTP for initial game ~99.54% (player-favorable 9/6 Jacks or Better).