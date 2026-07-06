import {
  spinNumber,
  betCoverage,
  resolveSpin,
  pocketColor,
  RED_NUMBERS,
  PAYOUT_RATIOS,
  BetError,
  MAX_TOTAL_WAGER,
  MAX_BETS_PER_SPIN,
  type RouletteBet,
} from "../../src/services/roulette";

describe("spinNumber (provably-fair)", () => {
  it("is deterministic for the same seeds + nonce", () => {
    const a = spinNumber("server-seed-abc", "client-seed-xyz", 0);
    const b = spinNumber("server-seed-abc", "client-seed-xyz", 0);
    expect(a).toBe(b);
  });

  it("always yields a pocket in 0..36", () => {
    for (let i = 0; i < 5000; i++) {
      const n = spinNumber("srv", `client-${i}`, i);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(36);
    }
  });

  it("changing the nonce changes the result (chain independence)", () => {
    const outcomes = new Set<number>();
    for (let nonce = 0; nonce < 200; nonce++) outcomes.add(spinNumber("srv", "cli", nonce));
    // Over 200 spins we should see many distinct pockets, not a stuck value.
    expect(outcomes.size).toBeGreaterThan(20);
  });

  it("covers all 37 pockets across enough spins (sanity of distribution)", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 20000 && seen.size < 37; i++) seen.add(spinNumber("s", "c", i));
    expect(seen.size).toBe(37);
  });
});

describe("pocketColor", () => {
  it("0 is green", () => expect(pocketColor(0)).toBe("green"));
  it("red set is red, complement is black", () => {
    for (let n = 1; n <= 36; n++) {
      expect(pocketColor(n)).toBe(RED_NUMBERS.has(n) ? "red" : "black");
    }
  });
  it("has exactly 18 red and 18 black", () => {
    const reds = [...Array(37).keys()].filter((n) => pocketColor(n) === "red");
    const blacks = [...Array(37).keys()].filter((n) => pocketColor(n) === "black");
    expect(reds.length).toBe(18);
    expect(blacks.length).toBe(18);
  });
});

describe("betCoverage — inside bets", () => {
  it("straight covers exactly the number (incl. 0)", () => {
    expect([...betCoverage({ type: "straight", amount: 1, numbers: [17] })]).toEqual([17]);
    expect([...betCoverage({ type: "straight", amount: 1, numbers: [0] })]).toEqual([0]);
  });

  it("accepts valid splits (horizontal, vertical, zero)", () => {
    expect(betCoverage({ type: "split", amount: 1, numbers: [1, 2] }).size).toBe(2); // horizontal
    expect(betCoverage({ type: "split", amount: 1, numbers: [1, 4] }).size).toBe(2); // vertical
    expect(betCoverage({ type: "split", amount: 1, numbers: [0, 1] }).size).toBe(2); // zero split
    expect(betCoverage({ type: "split", amount: 1, numbers: [2, 3] }).size).toBe(2);
  });

  it("rejects non-adjacent or malformed splits", () => {
    expect(() => betCoverage({ type: "split", amount: 1, numbers: [1, 5] })).toThrow(BetError);
    expect(() => betCoverage({ type: "split", amount: 1, numbers: [3, 4] })).toThrow(BetError); // row-wrap
    expect(() => betCoverage({ type: "split", amount: 1, numbers: [1] })).toThrow(BetError);
    expect(() => betCoverage({ type: "split", amount: 1, numbers: [1, 1] })).toThrow(BetError);
  });

  it("accepts valid streets (full row + zero trios), rejects others", () => {
    expect(betCoverage({ type: "street", amount: 1, numbers: [1, 2, 3] }).size).toBe(3);
    expect(betCoverage({ type: "street", amount: 1, numbers: [34, 35, 36] }).size).toBe(3);
    expect(betCoverage({ type: "street", amount: 1, numbers: [0, 1, 2] }).size).toBe(3);
    expect(() => betCoverage({ type: "street", amount: 1, numbers: [2, 3, 4] })).toThrow(BetError);
  });

  it("accepts valid corners (square + basket), rejects others", () => {
    expect(betCoverage({ type: "corner", amount: 1, numbers: [1, 2, 4, 5] }).size).toBe(4);
    expect(betCoverage({ type: "corner", amount: 1, numbers: [0, 1, 2, 3] }).size).toBe(4); // basket
    expect(() => betCoverage({ type: "corner", amount: 1, numbers: [1, 2, 3, 4] })).toThrow(BetError);
    expect(() => betCoverage({ type: "corner", amount: 1, numbers: [3, 4, 6, 7] })).toThrow(BetError); // wraps column
  });

  it("accepts valid six-lines, rejects others", () => {
    expect(betCoverage({ type: "line", amount: 1, numbers: [1, 2, 3, 4, 5, 6] }).size).toBe(6);
    expect(betCoverage({ type: "line", amount: 1, numbers: [31, 32, 33, 34, 35, 36] }).size).toBe(6);
    expect(() => betCoverage({ type: "line", amount: 1, numbers: [1, 2, 3, 4, 5, 7] })).toThrow(BetError);
  });
});

describe("betCoverage — outside bets", () => {
  it("dozens cover the right 12 numbers", () => {
    expect([...betCoverage({ type: "dozen", amount: 1, value: 1 })]).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    expect(betCoverage({ type: "dozen", amount: 1, value: 3 }).has(36)).toBe(true);
    expect(betCoverage({ type: "dozen", amount: 1, value: 3 }).has(24)).toBe(false);
  });

  it("columns cover every third number", () => {
    expect(betCoverage({ type: "column", amount: 1, value: 1 }).has(34)).toBe(true);
    expect(betCoverage({ type: "column", amount: 1, value: 3 }).has(36)).toBe(true);
    expect(betCoverage({ type: "column", amount: 1, value: 1 }).size).toBe(12);
  });

  it("red/black/odd/even/high/low have 18 pockets each and exclude 0", () => {
    for (const type of ["red", "black", "odd", "even", "high", "low"] as const) {
      const cov = betCoverage({ type, amount: 1 });
      expect(cov.size).toBe(18);
      expect(cov.has(0)).toBe(false);
    }
  });

  it("odd/even and high/low partition 1..36", () => {
    expect(betCoverage({ type: "odd", amount: 1 }).has(1)).toBe(true);
    expect(betCoverage({ type: "even", amount: 1 }).has(2)).toBe(true);
    expect(betCoverage({ type: "low", amount: 1 }).has(18)).toBe(true);
    expect(betCoverage({ type: "high", amount: 1 }).has(19)).toBe(true);
    expect(betCoverage({ type: "low", amount: 1 }).has(19)).toBe(false);
  });

  it("rejects bad dozen/column selectors", () => {
    expect(() => betCoverage({ type: "dozen", amount: 1, value: 4 })).toThrow(BetError);
    expect(() => betCoverage({ type: "column", amount: 1 })).toThrow(BetError);
  });
});

describe("resolveSpin — payouts", () => {
  it("straight-up win returns 36x stake (35:1 + stake)", () => {
    const r = resolveSpin(17, [{ type: "straight", amount: 5, numbers: [17] }]);
    expect(r.totalWagered).toBe(5);
    expect(r.totalReturn).toBe(5 * 36);
    expect(r.netProfit).toBe(5 * 35);
    expect(r.results[0].won).toBe(true);
  });

  it("loss returns 0 and net -stake", () => {
    const r = resolveSpin(0, [{ type: "straight", amount: 5, numbers: [17] }]);
    expect(r.totalReturn).toBe(0);
    expect(r.netProfit).toBe(-5);
    expect(r.results[0].won).toBe(false);
  });

  it("even-money bets lose on 0 (house edge source)", () => {
    for (const type of ["red", "black", "odd", "even", "high", "low"] as const) {
      const r = resolveSpin(0, [{ type, amount: 10 }]);
      expect(r.totalReturn).toBe(0);
    }
  });

  it("mixed bets: one win + one loss nets correctly", () => {
    const bets: RouletteBet[] = [
      { type: "red", amount: 10 }, // 1 is red → win → return 20
      { type: "straight", amount: 2, numbers: [5] }, // lose
    ];
    const r = resolveSpin(1, bets);
    expect(r.totalWagered).toBe(12);
    expect(r.totalReturn).toBe(20);
    expect(r.netProfit).toBe(8);
  });

  it("payout ratios match the standard European paytable", () => {
    const cases: Array<[RouletteBet, number, number]> = [
      [{ type: "split", amount: 1, numbers: [1, 2] }, 1, 18],
      [{ type: "street", amount: 1, numbers: [1, 2, 3] }, 2, 12],
      [{ type: "corner", amount: 1, numbers: [1, 2, 4, 5] }, 5, 9],
      [{ type: "line", amount: 1, numbers: [1, 2, 3, 4, 5, 6] }, 6, 6],
      [{ type: "dozen", amount: 1, value: 1 }, 12, 3],
      [{ type: "column", amount: 1, value: 1 }, 4, 3],
    ];
    for (const [bet, winning, expectedReturn] of cases) {
      const r = resolveSpin(winning, [bet]);
      expect(r.totalReturn).toBe(expectedReturn);
      expect(PAYOUT_RATIOS[bet.type] + 1).toBe(expectedReturn); // amount is 1
    }
  });
});

describe("resolveSpin — limits & validation", () => {
  it("rejects empty bet list", () => {
    expect(() => resolveSpin(1, [])).toThrow(BetError);
  });
  it("rejects too many bets", () => {
    const many = Array.from({ length: MAX_BETS_PER_SPIN + 1 }, () => ({
      type: "red" as const,
      amount: 1,
    }));
    expect(() => resolveSpin(1, many)).toThrow(BetError);
  });
  it("rejects total wager over the cap", () => {
    expect(() =>
      resolveSpin(1, [{ type: "red", amount: MAX_TOTAL_WAGER + 1 }]),
    ).toThrow(BetError);
  });
  it("rejects non-positive or non-integer amounts", () => {
    expect(() => resolveSpin(1, [{ type: "red", amount: 0 }])).toThrow(BetError);
    expect(() => resolveSpin(1, [{ type: "red", amount: 1.5 }])).toThrow(BetError);
  });
  it("rejects out-of-range winning numbers", () => {
    expect(() => resolveSpin(37, [{ type: "red", amount: 1 }])).toThrow(BetError);
  });
});

describe("house edge sanity (2.7% single-zero)", () => {
  it("expected return of a straight-up bet across all 37 pockets is 36/37", () => {
    // Sum of returns if you bet 1 on number 7 for every possible pocket outcome.
    let totalReturn = 0;
    for (let n = 0; n <= 36; n++) {
      totalReturn += resolveSpin(n, [{ type: "straight", amount: 1, numbers: [7] }]).totalReturn;
    }
    // Wagered 37 total (1 per spin), returned 36 (only the hit) → RTP 36/37 ≈ 0.973.
    expect(totalReturn).toBe(36);
    expect(37 - totalReturn).toBe(1); // house keeps 1/37 = 2.70%
  });
});
