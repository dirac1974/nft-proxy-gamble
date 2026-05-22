# Contributing to NFT Proxy Gamble

## Development Philosophy
Security, fairness, transparency, and regulatory mindfulness first. All code must be testable and auditable.

## For Claude AI (Primary Implementer)
- Read **docs/IMPLEMENTATION_PLAN.md** completely before starting any code.
- Create a GitHub Issue for every feature/task.
- Work on dedicated branches.
- Write tests BEFORE or alongside implementation (TDD preferred for critical paths like RNG and redemption).
- All PRs must pass CI (tests, lint, security scans).
- Document decisions in code comments and ADRs (Architecture Decision Records) in /docs/adr/.

## Workflow
1. Pick or create Issue
2. `git checkout -b feat/xxx`
3. Implement + tests
4. `npm run lint && npm test`
5. Open PR -> Link Issue
6. Claude self-reviews or Grok reviews
7. Merge after approval

## Code Style
- TypeScript strict mode
- Solidity ^0.8.20 with OpenZeppelin
- Prettier + ESLint
- Conventional Commits

Thank you for building the future of responsible on-chain entertainment!