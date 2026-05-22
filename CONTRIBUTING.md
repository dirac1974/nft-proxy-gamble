# Contributing to NFT Proxy Gamble

## Development Philosophy
**Security, fairness, transparency, and regulatory mindfulness first.** All code must be testable and auditable. **Bug-free is the only acceptable outcome.**

## For Claude AI (Primary Implementer) & All Agents
**MANDATORY — READ IN THIS ORDER EVERY TIME YOU START**:
1. `docs/DEVELOPMENT_MEMORY.md` — Permanent standards, testing rules, output format
2. `docs/GROK_FEEDBACK.md` — **Live feedback file** (updated every 6 hours by Grok with current action items)
3. `docs/IMPLEMENTATION_PLAN.md` — Phased execution plan

**Never start coding without reading both DEVELOPMENT_MEMORY.md and GROK_FEEDBACK.md first.**

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