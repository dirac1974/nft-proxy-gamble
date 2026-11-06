import {
  MAX_WIN,
  PAYTABLE_X10,
  RTP_BY_SPOTS,
  BET_LEVELS,
  cardResultCopy,
  cellA11yLabel,
  countCatches,
  drawSchedule,
  effectiveSpeed,
  findIdentical,
  hitSoundIndex,
  humanizeKenoError,
  payFor,
  playBlock,
  playLabel,
  quickPick,
  quickPickAll,
  resultCopy,
  toggleSpot,
  totalWager,
} from "@/components/keno/kenoModel";
import { tabLabel } from "@/components/keno/CardTabs";

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

describe("marking", () => {
  it("adds sorted, removes on second tap, rejects the 11th spot and out-of-range numbers", () => {
    let spots: number[] = [];
    for (const n of [9, 3, 80, 1, 40, 41, 22, 77, 15, 60]) {
      const r = toggleSpot(spots, n);
      expect(r.ok).toBe(true);
      if (r.ok) spots = r.spots;
    }
    expect(spots).toEqual([1, 3, 9, 15, 22, 40, 41, 60, 77, 80]);
    expect(toggleSpot(spots, 50)).toEqual({ ok: false, reason: "max" });
    const un = toggleSpot(spots, 40);
    expect(un.ok && un.spots.length).toBe(9);
    expect(un.ok && un.added).toBe(false);
    expect(toggleSpot([], 0)).toEqual({ ok: false, reason: "range" });
    expect(toggleSpot([], 81)).toEqual({ ok: false, reason: "range" });
  });
});

describe("quick pick", () => {
  it("returns N unique in-range numbers, clamped to 1..10", () => {
    const rng = seeded(7);
    for (let n = 1; n <= 10; n++) {
      const p = quickPick(n, [], rng);
      expect(p).toHaveLength(n);
      expect(new Set(p).size).toBe(n);
      p.forEach((x) => expect(x >= 1 && x <= 80).toBe(true));
    }
    expect(quickPick(15, [], rng)).toHaveLength(10);
    expect(quickPick(0, [], rng)).toHaveLength(1);
  });

  it("never duplicates another card's set (retries)", () => {
    // RNG that repeats the same sequence for the first attempt, then moves on.
    const first = quickPick(3, [], seeded(1));
    let calls = 0;
    const base = seeded(1);
    const other = seeded(99);
    const rng = () => (calls++ < 3 ? base() : other());
    const p = quickPick(3, [first], rng);
    expect(p).not.toEqual(first);
    expect(findIdentical([first, p])).toBeNull();
  });

  it("quick pick all gives four distinct cards", () => {
    const all = quickPickAll([[], [], [], []], 1, seeded(3));
    expect(all).toHaveLength(4);
    expect(findIdentical(all)).toBeNull();
  });
});

describe("identical cards + wager", () => {
  it("detects identical sets regardless of order and ignores empty cards", () => {
    expect(findIdentical([[1, 2, 3], [3, 2, 1], [], []])).toEqual([0, 1]);
    expect(findIdentical([[], [], [5], [6]])).toBeNull();
    expect(playBlock("quad", [[1, 2], [2, 1], [], []], 20)).toBe("identical");
    expect(playLabel("quad", [[1, 2], [2, 1], [], []], 20)).toBe("Cards A & B match");
  });

  it("totals only cards with spots and labels PLAY", () => {
    const cards = [[1, 2, 3], [], [4, 5], [6]];
    expect(totalWager(cards, 20)).toBe(60);
    expect(playLabel("quad", cards, 20)).toBe("PLAY · 3×20 = 60");
    expect(playLabel("quad", [[1], [2], [3], [4]], 50)).toBe("PLAY · 4×50 = 200");
    expect(playLabel("single", [[7, 8]], 10)).toBe("PLAY · 10");
    expect(playLabel("single", [[]], 10)).toBe("Pick numbers");
    expect(playBlock("single", [[1]], 25)).toBe("bet");
  });
});

describe("pays & copy", () => {
  it("counts catches and computes integer payouts", () => {
    expect(countCatches([1, 2, 3, 4], [4, 9, 1, 70])).toBe(2);
    expect(countCatches([1, 2], new Set([2]))).toBe(1);
    expect(payFor(1, 1, 10)).toBe(37);
    expect(payFor(4, 2, 20)).toBe(20); // 1× push row
    expect(payFor(10, 4, 50)).toBe(0);
    for (const bet of BET_LEVELS) {
      for (const [spots, row] of Object.entries(PAYTABLE_X10)) {
        for (const c of Object.keys(row)) {
          const p = payFor(Number(spots), Number(c), bet);
          expect(Number.isInteger(p)).toBe(true);
          expect(p).toBeLessThanOrEqual(MAX_WIN);
        }
      }
    }
  });

  it("uses net-based, non-celebratory copy for LDW / push / loss", () => {
    expect(resultCopy(450, 200)).toEqual({ kind: "win", text: "Won 450 · Net +250" });
    expect(resultCopy(150, 200)).toEqual({ kind: "ldw", text: "Returned 150 of 200" });
    expect(resultCopy(200, 200)).toEqual({ kind: "push", text: "Bet returned" });
    expect(resultCopy(0, 80).kind).toBe("loss");
    for (const r of [resultCopy(150, 200), resultCopy(200, 200), resultCopy(0, 80)]) expect(r.text).not.toMatch(/win/i);
    expect(cardResultCopy(5, 7, 200)).toBe("Catch 5 of 7 · pays 200");
    expect(cardResultCopy(1, 7, 0)).toBe("Catch 1 of 7 · no pay");
  });

  it("matches the published RTP per spot count (hypergeometric)", () => {
    const choose = (n: number, k: number): number => {
      if (k < 0 || k > n) return 0;
      let r = 1;
      for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
      return r;
    };
    for (let spots = 1; spots <= 10; spots++) {
      let ev = 0;
      for (let c = 0; c <= spots; c++) {
        const p = (choose(20, c) * choose(60, spots - c)) / choose(80, spots);
        ev += p * ((PAYTABLE_X10[spots]![c] ?? 0) / 10);
      }
      expect(ev * 100).toBeCloseTo(RTP_BY_SPOTS[spots]!, 2);
    }
  });
});

describe("draw presentation", () => {
  const drawn = Array.from({ length: 20 }, (_, i) => i + 1);

  it("normal = 200ms/ball + 100ms dwell on hits; fast = 80ms; instant ≤ 300ms", () => {
    const n = drawSchedule(drawn, [[1, 2]], "normal", false);
    expect(n.times[0]).toBe(200);
    expect(n.times[1]).toBe(500); // ball 1 was a hit → +100
    expect(n.times[2]).toBe(800);
    expect(n.total).toBe(20 * 200 + 2 * 100);
    const f = drawSchedule(drawn, [[1, 2]], "fast", false);
    expect(f.total).toBe(20 * 80);
    const i = drawSchedule(drawn, [[1]], "instant", false);
    expect(i.total).toBeLessThanOrEqual(300);
  });

  it("reduceMotion forces Instant; restrictedPlay forbids Instant and enforces a 2.5s cycle", () => {
    expect(effectiveSpeed("normal", true, false)).toBe("instant");
    expect(effectiveSpeed("instant", false, true)).toBe("fast");
    expect(drawSchedule(drawn, [[1]], "fast", true).total).toBe(2500);
  });

  it("hit bell rises only on paying rows, flat otherwise", () => {
    const d = [5, 6, 7, 8, 9, 50];
    const ten = [[5, 6, 7, 8, 9, 10, 11, 12, 13, 14]];
    expect(hitSoundIndex(d, 0, ten)).toBe(1); // catch 1 of 10 — no pay
    expect(hitSoundIndex(d, 4, ten)).toBe(5); // catch 5 of 10 — first paying row
    expect(hitSoundIndex(d, 5, ten)).toBeNull(); // miss
    expect(hitSoundIndex([3], 0, [[3]])).toBe(1); // 1 spot catch 1 pays → index 1
  });
});

describe("a11y + errors + tabs", () => {
  it("labels cells with marking cards and state", () => {
    expect(cellA11yLabel(17, [0, 2], true, "quad")).toBe("17, marked cards A and C, drawn, hit");
    expect(cellA11yLabel(5, [], true, "single")).toBe("5, drawn");
    expect(cellA11yLabel(5, [0], false, "single")).toBe("5, marked");
  });

  it("tab labels", () => {
    expect(tabLabel(0, { spots: 7, catches: null, payout: null })).toBe("A · 7");
    expect(tabLabel(1, { spots: 0, catches: null, payout: null })).toBe("B · —");
    expect(tabLabel(2, { spots: 7, catches: 3, payout: null })).toBe("C 3/7");
    expect(tabLabel(3, { spots: 7, catches: 5, payout: 200 })).toBe("D 5/7 · 200");
  });

  it("humanizes server errors", () => {
    expect(humanizeKenoError(new Error("Insufficient balance"))).toMatch(/Not enough coins/);
    expect(humanizeKenoError(new Error("identical spot sets"))).toMatch(/same numbers/);
    expect(humanizeKenoError(new Error("Failed to fetch"))).toMatch(/connection/);
  });
});
