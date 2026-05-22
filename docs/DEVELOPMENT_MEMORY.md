# Development Memory & Standards - NFT Proxy Gamble

**This is the living institutional memory for all AI agents (Claude, Grok, future models) working on this project.**

**Core Directive**: Bug-free code is non-negotiable. We build for real users, real money (via USDC redemption), and regulatory scrutiny. Every line must be defensible in an audit.

---

## 1. Mandatory Process: Think Deeply & Plan Before Any Code

**Rule**: No code is written until a detailed plan exists in the GitHub Issue or PR description.

### Pre-Implementation Checklist (Must Complete in Issue)
Before touching any file:

1. **Deep Analysis** (write 300+ words minimum)
   - Security implications (STRIDE model: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege)
   - Edge cases (0, max values, network partitions, concurrent users, gas spikes)
   - Performance & scalability (gas costs, DB queries under load, mobile battery/CPU)
   - User Experience & Accessibility (error messages, loading states, 18+ age gate)
   - Regulatory & Compliance risks ("Is this still framed as entertainment + collectibles?")
   - Failure modes & blast radius

2. **Implementation Plan** (numbered steps with file paths)
   - Exact files to create/modify
   - Data flow diagram (ASCII or mermaid)
   - State machine / sequence diagram if complex

3. **Test Strategy**
   - Unit tests (what properties to assert)
   - Integration tests (API + contract + DB)
   - E2E (Maestro/Detox flows)
   - Property-based / fuzz tests
   - Negative & adversarial tests

4. **"What Could Go Wrong?" Table**
   | Risk | Likelihood | Impact | Mitigation | Test |
   |------|------------|--------|------------|------|

5. **Documentation Updates Required**
   - Which MD files or ADRs to update

**Only after the Issue has this plan approved (self or Grok review) may implementation begin.**

---

## 2. Structure Output Format Standards (Strict)

All code **must** follow these conventions. PRs violating them will be rejected.

### File-Level
- **Header** (first 10 lines of every source file):
```ts
/**
 * @fileoverview [One-sentence purpose]
 * @module [Folder/Name]
 * @version 0.1.0
 * @lastUpdated 2026-05-22
 * @author Claude (or Grok)
 * @see IMPLEMENTATION_PLAN.md Phase X
 */
```

- **Naming**:
  - TypeScript: `kebab-case.ts` for utils, `PascalCase.tsx` for React components
  - Solidity: `NFTProxyVoucher.sol` (already correct)
  - Folders: `src/services/`, `src/controllers/`, `src/utils/`

### Function / Component Level
Every public function, hook, or component **must** have:

```ts
/**
 * Brief description
 * @param userId - The user's internal ID
 * @param coinAmount - Positive integer > 0
 * @returns Promise<{ tokenId: number; txHash: string }>
 * @throws {InsufficientBalanceError} if user.coinBalance < coinAmount
 * @throws {ContractCallError} on blockchain failure
 * @example
 * await mintVoucher('user_123', 1250)
 */
async function mintVoucher(...) { ... }
```

- **Error Handling**: Never use `any` for errors. Use custom error classes extending `Error` (e.g., `class RedemptionError extends Error {}`).
- **Logging**: Use structured logging with `correlationId` (sessionId or requestId) for traceability.
- **Constants**: All magic numbers/strings → `src/config/constants.ts` or `src/config/economy.ts`
- **Types**: 100% strict TypeScript. `noImplicitAny`, `strictNullChecks`. Document any `as any` with justification.

### Commit & PR Messages
- Conventional Commits: `feat(contracts): add pausable to NFTProxyVoucher`
- PR title: `[Phase 1] Implement mint + redeem with 95% test coverage`

---

## 3. Testing Parameters & Requirements (Non-Negotiable Gates)

### Coverage Thresholds (CI will fail below these)
- **Statements**: ≥ 92%
- **Branches**: ≥ 88%
- **Functions/Methods**: ≥ 95%
- **Lines**: ≥ 92%

### Required Test Types per Phase

**Phase 1 (Contracts)**:
- 20+ Hardhat tests minimum
- Property-based testing (fast-check or hardhat-fuzz) on `coinBalance` math and `redeem`
- Reentrancy test (using `vm.expectRevert` style or hardhat)
- Gas usage benchmarks (< 150k gas for mint, < 80k for redeem)
- Fuzz test with random coin amounts (1 to 1_000_000)

**Phase 2 (Backend)**:
- Jest + ts-jest + Supertest
- Determinism test: Same seeds → identical card sequence 1000x
- Replay attack test on IAP receipts (hash stored + unique constraint)
- Concurrent session test (2 users cashing out same balance simultaneously)
- Full paytable coverage (all 9 hand types + 0 payout)

**Phase 3 (Mobile)**:
- React Native Testing Library (unit + component)
- Maestro or Detox E2E: Complete flow (IAP sandbox → play 5 hands → cashout → view NFT → redeem tx)
- Snapshot tests for UI states
- Accessibility tests (screen reader labels)

**All Phases**:
- Negative tests (invalid input, insufficient funds, wrong role, network error)
- Integration tests across layers (mobile → backend → contract)
- Mutation testing score ≥ 80% on critical paths (future Phase 5+)

### CI Enforcement
`.github/workflows/ci.yml` already runs tests. **Add coverage report upload** in future. PRs without green CI + coverage gate are blocked.

---

## 4. Bug-Free Code Mandate

- "If a bug reaches testnet or production, the responsible phase is rolled back and the agent must re-plan."
- Every bug fix PR **must** include a new test that would have caught it.
- After any incident, add a new row to the "What Could Go Wrong?" table in DEVELOPMENT_MEMORY.md
- Update relevant docs immediately (this file, IMPLEMENTATION_PLAN.md, SECURITY.md, GAME_RULES.md)

---

## 5. AI Agent Memory Rules

- **Claude**: After every phase completion, append a "Phase X Retrospective" section to this file with lessons learned and any doc updates made.
- **Grok**: Will periodically review and refine these standards.
- Never delete history — only append.

**Last Updated**: 2026-05-22 by Grok (Secondary PM)
**Version**: 1.1
