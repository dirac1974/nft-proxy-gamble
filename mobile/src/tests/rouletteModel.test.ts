import { describe, it, expect } from "@jest/globals";
import {
  WHEEL_ORDER,
  POCKET_DEG,
  pocketColor,
  cellHitSpot,
  zeroHitSpot,
  addChip,
  addChips,
  doubleBets,
  spots,
  totalOf,
  toApiBet,
  landingPlan,
  easeOutCubic,
  pocketIndex,
  pocketUnderBall,
  DROP_FRACTION,
  wheelNeighbours,
  sessionStats,
  humanizeError,
  chipStack,
  coverage,
  type Zone,
  type BetSpot,
  type PlacedBet,
} from "@/components/roulette/rouletteModel";

// Independent re-statement of backend/src/services/roulette.ts legal groups.
const key = (n: number[]) => [...n].sort((a, b) => a - b).join(",");
const colOf = (n: number) => ((n - 1) % 3) + 1;
const VALID: Record<string, Set<string>> = { split: new Set(), street: new Set(), corner: new Set(), line: new Set() };
for (let n = 1; n <= 36; n++) {
  if (colOf(n) < 3) VALID.split!.add(key([n, n + 1]));
  if (n + 3 <= 36) VALID.split!.add(key([n, n + 3]));
  if (colOf(n) < 3 && n + 3 <= 36) VALID.corner!.add(key([n, n + 1, n + 3, n + 4]));
}
[1, 2, 3].forEach((n) => VALID.split!.add(key([0, n])));
for (let r = 1; r <= 12; r++) VALID.street!.add(key([3 * r - 2, 3 * r - 1, 3 * r]));
VALID.street!.add(key([0, 1, 2]));
VALID.street!.add(key([0, 2, 3]));
VALID.corner!.add(key([0, 1, 2, 3]));
for (let r = 1; r <= 11; r++) VALID.line!.add(key(Array.from({ length: 6 }, (_, i) => 3 * r - 2 + i)));

function isLegal(s: BetSpot): boolean {
  if (s.type === "straight") return s.numbers!.length === 1 && s.numbers![0]! >= 0 && s.numbers![0]! <= 36;
  return VALID[s.type]?.has(key(s.numbers!)) ?? false;
}

describe("wheel", () => {
  it("is a permutation of 0..36 in European order with alternating colours", () => {
    expect([...WHEEL_ORDER].sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, i) => i));
    expect(WHEEL_ORDER.slice(0, 5)).toEqual([0, 32, 15, 19, 4]);
    for (let i = 1; i < 36; i++) {
      expect(pocketColor(WHEEL_ORDER[i]!)).not.toBe(pocketColor(WHEEL_ORDER[i + 1]!));
    }
  });

  it("neighbours wrap around the zero", () => {
    expect(wheelNeighbours(0)).toEqual([3, 26, 0, 32, 15]);
    expect(wheelNeighbours(17)).toEqual([2, 25, 17, 34, 6]);
  });
});

describe("hit-testing produces only bets the backend accepts", () => {
  const zones: Zone[] = [-1, 0, 1];
  it("every zone of every number cell maps to a legal bet covering that number", () => {
    for (let n = 1; n <= 36; n++) {
      for (const h of zones) {
        for (const v of zones) {
          const s = cellHitSpot(n, h, v);
          expect(isLegal(s)).toBe(true);
          expect(s.numbers).toContain(n);
        }
      }
    }
  });

  it("maps centre/edges/corners as expected", () => {
    expect(cellHitSpot(17, 0, 0).key).toBe("straight:17");
    expect(cellHitSpot(17, 1, 0).key).toBe("split:17,18");
    expect(cellHitSpot(17, -1, 0).key).toBe("split:16,17");
    expect(cellHitSpot(17, 0, 1).key).toBe("split:17,20");
    expect(cellHitSpot(17, 1, 1).key).toBe("corner:17,18,20,21");
    expect(cellHitSpot(18, 1, 0).key).toBe("street:16,17,18");
    expect(cellHitSpot(18, 1, 1).key).toBe("line:16,17,18,19,20,21");
    expect(cellHitSpot(1, 1, -1).key).toBe("street:0,1,2");
    expect(cellHitSpot(3, 1, -1).key).toBe("corner:0,1,2,3");
  });

  it("both sides of a shared line resolve to the same bet", () => {
    expect(cellHitSpot(17, 1, 0).key).toBe(cellHitSpot(18, -1, 0).key);
    expect(cellHitSpot(17, 0, 1).key).toBe(cellHitSpot(20, 0, -1).key);
    expect(cellHitSpot(17, 1, 1).key).toBe(cellHitSpot(21, -1, -1).key);
  });

  it("zero cell", () => {
    expect(zeroHitSpot(150, 10, 300, 40).key).toBe("straight:0");
    expect(zeroHitSpot(50, 38, 300, 40).key).toBe("split:0,1");
    expect(zeroHitSpot(100, 38, 300, 40).key).toBe("street:0,1,2");
    expect(zeroHitSpot(200, 38, 300, 40).key).toBe("street:0,2,3");
    expect(zeroHitSpot(295, 38, 300, 40).key).toBe("corner:0,1,2,3");
    for (let x = 0; x <= 300; x += 5) expect(isLegal(zeroHitSpot(x, 38, 300, 40))).toBe(true);
  });

  it("outside coverage", () => {
    expect(coverage(spots.dozen(2))).toEqual(Array.from({ length: 12 }, (_, i) => 13 + i));
    expect(coverage(spots.outside("red"))).toHaveLength(18);
    expect(coverage(spots.column(1))[1]).toBe(4);
  });
});

describe("bet slip", () => {
  it("merges repeated taps into one bet", () => {
    let bets: PlacedBet[] = [];
    for (let i = 0; i < 5; i++) {
      const r = addChip(bets, spots.straight(17), 5, 10_000);
      if (!r.ok) throw new Error("unexpected");
      bets = r.bets;
    }
    expect(bets).toHaveLength(1);
    expect(bets[0]!.amount).toBe(25);
    expect(toApiBet(bets[0]!)).toEqual({ type: "straight", amount: 25, numbers: [17] });
    expect(toApiBet({ ...spots.dozen(3), amount: 5 })).toEqual({ type: "dozen", amount: 5, value: 3 });
  });

  it("enforces 20 bets, 1000 wager and balance", () => {
    let bets: PlacedBet[] = [];
    for (let n = 1; n <= 20; n++) {
      const r = addChip(bets, spots.straight(n), 1, 10_000);
      if (!r.ok) throw new Error("unexpected");
      bets = r.bets;
    }
    expect(addChip(bets, spots.straight(21), 1, 10_000)).toEqual({ ok: false, reason: "max_bets" });
    expect(addChip(bets, spots.straight(1), 1, 10_000).ok).toBe(true); // merge doesn't add an entry
    expect(addChip([], spots.outside("red"), 1001, 10_000)).toEqual({ ok: false, reason: "max_wager" });
    expect(addChip([], spots.outside("red"), 50, 49)).toEqual({ ok: false, reason: "balance" });
    expect(doubleBets([{ ...spots.outside("red"), amount: 600 }], 10_000)).toEqual({ ok: false, reason: "max_wager" });
  });

  it("neighbours place five straights atomically", () => {
    const r = addChips([], wheelNeighbours(0).map((n) => spots.straight(n)), 5, 10_000);
    expect(r.ok && r.bets.length).toBe(5);
    expect(r.ok && totalOf(r.bets)).toBe(25);
  });

  it("chip stack", () => {
    expect(chipStack(35)).toEqual([25, 5, 5]);
    expect(chipStack(3)).toEqual([1, 1, 1]);
  });
});

describe("landing plan is deterministic — ball always rests in the server's pocket", () => {
  it("for every number and arbitrary start angles", () => {
    const T = 3500;
    for (let n = 0; n <= 36; n++) {
      for (const [w0, b0] of [
        [0, 0],
        [123.4, -987.6],
        [7200.5, 33.3],
      ] as const) {
        const p = landingPlan(w0, b0, pocketIndex(n), T, 360 / 2600, 360 / 650);
        const wheelAtDrop = w0 + (p.wheelEnd - w0) * easeOutCubic(DROP_FRACTION);
        expect(pocketUnderBall(wheelAtDrop, p.ballEnd)).toBe(pocketIndex(n));
        // After drop the ball rides the wheel: still the same pocket at rest.
        expect(pocketUnderBall(p.wheelEnd, p.wheelEnd + p.ballOffset)).toBe(pocketIndex(n));
        // Ball travels counter-clockwise, wheel clockwise.
        expect(p.ballEnd).toBeLessThanOrEqual(b0);
        expect(p.wheelEnd).toBeGreaterThan(w0);
        // Rests in the pocket centre (no near-miss offset).
        const local = (((p.ballOffset % 360) + 360) % 360) / POCKET_DEG;
        expect(Math.abs(local - Math.round(local))).toBeLessThan(1e-6);
      }
    }
  });

  it("works with the reduced-motion duration", () => {
    const p = landingPlan(10, 20, pocketIndex(17), 1200, 360 / 2600, 360 / 650);
    expect(p.dropAt).toBeCloseTo(1200 * DROP_FRACTION);
  });
});

describe("session stats & copy", () => {
  it("counts colours and parity", () => {
    const s = sessionStats([0, 1, 2, 17, 17]);
    expect(s).toMatchObject({ spins: 5, red: 1, black: 3, green: 1, odd: 3, even: 1, low: 4, high: 0 });
    expect(s.hot[0]).toBe(17);
  });

  it("humanizes backend errors", () => {
    expect(humanizeError(new Error("Insufficient coin balance"))).toMatch(/Not enough coins/);
    expect(humanizeError(new Error("Network request failed"))).toMatch(/connection/);
    expect(humanizeError(new Error("This session already spun. Start a new session for the next spin."))).toMatch(/reset/);
  });
});
