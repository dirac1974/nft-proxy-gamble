# Contributing to NFT Proxy Gamble

## Development Philosophy
**Security, fairness, transparency, and regulatory mindfulness first.** All code must be testable and auditable. **Bug-free is the only acceptable outcome.**

## For Claude AI (Primary Implementer) & All Agents
**MANDATORY**:
1. **Read DEVELOPMENT_MEMORY.md completely** before any work.
2. **Follow the "Think Deeply & Plan First" process** — create detailed plan in Issue before coding.
3. Create a GitHub Issue for every feature/task.
4. Work on dedicated branches (`feat/phase-1-contracts`).
5. Write tests BEFORE or alongside implementation (TDD preferred for critical paths like RNG and redemption).
6. All PRs must pass CI (tests, lint, security scans) **and meet coverage thresholds** (see DEVELOPMENT_MEMORY.md).
7. Document decisions in code comments and ADRs (Architecture Decision Records) in /docs/adr/.
8. After each phase, append a retrospective to DEVELOPMENT_MEMORY.md.

## Workflow
1. Pick or create Issue (include full pre-plan checklist from DEVELOPMENT_MEMORY.md)
2. `git checkout -b feat/xxx`
3. Implement + tests (following strict output format)
4. `npm run lint && npm test && npm run coverage`
5. Open PR -> Link Issue
6. Self-review or Grok review
7. Merge after approval

## Code Style
- TypeScript strict mode
- Solidity ^0.8.20 with OpenZeppelin
- Prettier + ESLint
- Conventional Commits

**Thank you for building the future of responsible on-chain entertainment!**