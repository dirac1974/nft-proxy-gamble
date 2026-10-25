import { describe, it, expect } from "@jest/globals";
import type { BlackjackRound } from "@/services/api";
import {
  BJ_MAX_BET,
  EMPTY_SHOWN,
  applyStep,
  chipStack,
  faceOf,
  handValue,
  humanError,
  planSteps,
  remapForSplit,
  resultView,
  roundVoice,
  scaleTimings,
  tableRuleLine,
  targetFor,
  tryRaiseBet,
  type Shown,
} from "@/components/blackjack/bjLogic";

// Card encoding (backend): rank = card % 13 (0=2 … 8=10, 9=J, 10=Q, 11=K, 12=A), suit = floor(card / 13).
const A = 12, K = 11, TEN = 8, FIVE = 3, SIX = 4, NINE = 7, EIGHT = 6, SEVEN = 5;
const T = { cardInterval: 250, dealerDraw: 600, revealDelay: 400 };

function round(p: Partial<BlackjackRound>): BlackjackRound {
  return {
    phase: "player",
    dealer: [NINE],
    dealerValue: 9,
    dealerHoleHidden: true,
    hands: [{ cards: [TEN, SEVEN], value: 17, soft: false, bet: 25, busted: false, done: false, isSplitAces: false }],
    active: 0,
    insurance: 0,
    legalActions: ["stand", "hit", "double"],
    totalWagered: 25,
    serverSeedHash: "0xhash",
    clientSeed: "cli",
    newBalance: 975,
    ...p,
  };
}

function run(from: Shown, r: BlackjackRound): Shown {
  return planSteps(from, r, T).reduce((s, st) => applyStep(s, st, r.hands.length), from);
}

describe("hand math mirrors backend", () => {
  it("values soft and hard hands", () => {
    expect(handValue([A, SIX])).toEqual({ total: 17, soft: true });
    expect(handValue([A, SIX, TEN])).toEqual({ total: 17, soft: false });
    expect(handValue([A, A, NINE])).toEqual({ total: 21, soft: true });
    expect(handValue([K, A]).total).toBe(21);
  });

  it("normalises shoe indexes to a 52-card face", () => {
    expect(faceOf(52 + 12)).toBe(12);
    expect(handValue([52 * 5 + A, 52 * 3 + K]).total).toBe(21);
  });

  it("prints the dealer rule from the backend flag", () => {
    expect(tableRuleLine(true)).toBe("DEALER MUST HIT SOFT 17");
    expect(tableRuleLine(false)).toBe("DEALER STANDS ON ALL 17S");
  });
});

describe("betting", () => {
  it("enforces the table max and the balance", () => {
    expect(tryRaiseBet(BJ_MAX_BET + 5, 10_000).reason).toBe("max");
    expect(tryRaiseBet(100, 50).reason).toBe("balance");
    expect(tryRaiseBet(100, 100)).toEqual({ bet: 100, reason: null });
  });

  it("stacks chips by denomination", () => {
    expect(chipStack(380)).toEqual([250, 100, 25, 5]);
    expect(chipStack(0)).toEqual([]);
    expect(chipStack(500).reduce((a, b) => a + b, 0)).toBe(500);
  });
});

describe("result copy", () => {
  it("is net-based and never shows +0 for a push", () => {
    expect(resultView({ outcome: "blackjack", bet: 50, ret: 125 })).toEqual({ label: "Blackjack +75", tone: "gold" });
    expect(resultView({ outcome: "win", bet: 50, ret: 100 })).toEqual({ label: "Win +50", tone: "success" });
    expect(resultView({ outcome: "push", bet: 50, ret: 50 })).toEqual({ label: "Push", tone: "neutral" });
    expect(resultView({ outcome: "bust", bet: 50, ret: 0 }).label).toBe("Bust");
    expect(resultView({ outcome: "lose", bet: 50, ret: 0 }).label).toBe("Lose");
  });

  it("picks the dealer voice line", () => {
    const settled = { phase: "settled" as const, dealerHoleHidden: false };
    expect(roundVoice(round({ ...settled, dealer: [NINE, SIX], results: [{ outcome: "blackjack", bet: 2, ret: 5 }] }))).toBe("vo_blackjack");
    expect(roundVoice(round({ ...settled, dealer: [A, K], results: [{ outcome: "lose", bet: 2, ret: 0 }] }))).toBe("vo_dealer_bj");
    expect(roundVoice(round({ ...settled, dealer: [TEN, SIX, NINE], results: [{ outcome: "win", bet: 2, ret: 4 }] }))).toBe("vo_dealer_bust");
    expect(roundVoice(round({ ...settled, dealer: [TEN, SEVEN], results: [{ outcome: "push", bet: 2, ret: 2 }] }))).toBe("vo_push");
    expect(roundVoice(round({ ...settled, dealer: [TEN, NINE], results: [{ outcome: "lose", bet: 2, ret: 0 }] }))).toBeNull();
  });

  it("translates server errors into human language", () => {
    expect(humanError(new Error("Network request failed"))).toMatch(/couldn't reach the table/);
    expect(humanError(new Error("Action could not be completed atomically — session or balance changed."))).toMatch(/balance changed/);
    expect(humanError(new Error("HTTP 500"))).toBe("Something went wrong. Please try again.");
  });
});

describe("deal timeline", () => {
  it("deals player, dealer, player, hole at the card interval", () => {
    const steps = planSteps(EMPTY_SHOWN, round({}), T);
    expect(steps.map((s) => s.kind)).toEqual(["player", "dealer", "player", "dealer"]);
    expect(steps.map((s) => s.at)).toEqual([0, 250, 500, 750]);
    expect(run(EMPTY_SHOWN, round({}))).toEqual({ dealer: 2, hole: false, hands: [2], settled: false });
  });

  it("paces a settle: reveal delay, hole flip, dealer draws, then outcome", () => {
    const from: Shown = { dealer: 2, hole: false, hands: [2], settled: false };
    const r = round({
      phase: "settled",
      dealerHoleHidden: false,
      dealer: [NINE, FIVE, TEN],
      results: [{ outcome: "win", bet: 25, ret: 50 }],
    });
    const steps = planSteps(from, r, T);
    expect(steps).toEqual([
      { at: 400, kind: "reveal" },
      { at: 1000, kind: "dealer" },
      { at: 1400, kind: "outcome" },
    ]);
    expect(run(from, r)).toEqual({ dealer: 3, hole: true, hands: [2], settled: true });
  });

  it("deals the hit card before the reveal when a hit ends the round", () => {
    const from: Shown = { dealer: 2, hole: false, hands: [2], settled: false };
    const r = round({
      phase: "settled",
      dealerHoleHidden: false,
      dealer: [NINE, FIVE],
      hands: [{ cards: [TEN, SEVEN, NINE], value: 26, soft: false, bet: 25, busted: true, done: true, isSplitAces: false }],
      results: [{ outcome: "bust", bet: 25, ret: 0 }],
    });
    expect(planSteps(from, r, T).map((s) => [s.kind, s.at])).toEqual([
      ["player", 0],
      ["reveal", 400],
      ["outcome", 800],
    ]);
  });

  it("handles a natural settled on the deal", () => {
    const r = round({
      phase: "settled",
      dealerHoleHidden: false,
      dealer: [NINE, SEVEN],
      hands: [{ cards: [A, K], value: 21, soft: true, bet: 10, busted: false, done: false, isSplitAces: false }],
      results: [{ outcome: "blackjack", bet: 10, ret: 25 }],
    });
    const kinds = planSteps(EMPTY_SHOWN, r, T).map((s) => s.kind);
    expect(kinds).toEqual(["player", "dealer", "player", "dealer", "reveal", "outcome"]);
  });

  it("re-deals both split hands from their first card", () => {
    const prev = round({
      hands: [{ cards: [EIGHT, EIGHT + 13], value: 16, soft: false, bet: 25, busted: false, done: false, isSplitAces: false }],
    });
    const next = round({
      hands: [
        { cards: [EIGHT, TEN], value: 18, soft: false, bet: 25, busted: false, done: false, isSplitAces: false },
        { cards: [EIGHT + 13, FIVE], value: 13, soft: false, bet: 25, busted: false, done: false, isSplitAces: false },
      ],
      totalWagered: 50,
    });
    const from = remapForSplit({ dealer: 2, hole: false, hands: [2], settled: false }, prev, next);
    expect(from.hands).toEqual([1, 1]);
    expect(planSteps(from, next, T)).toEqual([
      { at: 0, kind: "player", hand: 0 },
      { at: 250, kind: "player", hand: 1 },
    ]);
    expect(targetFor(next).hands).toEqual([2, 2]);
  });

  it("shortens every interval under reduce motion", () => {
    const s = scaleTimings(T, true);
    expect(s.cardInterval).toBeLessThan(T.cardInterval);
    expect(s.dealerDraw).toBeLessThan(T.dealerDraw);
    expect(scaleTimings(T, false)).toEqual(T);
  });
});
