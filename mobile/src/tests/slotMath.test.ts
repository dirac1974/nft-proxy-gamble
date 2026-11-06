import {
  ANTICIPATION_MS,
  BET_LEVELS,
  MAX_CYCLE,
  STRIPS,
  anticipationFromReel,
  bigWinTier,
  classifyOutcome,
  columnOffset,
  countUpMs,
  gridFromStops,
  landingTarget,
  mod,
  normalizeGrid,
  outcomeCopy,
  reelWindow,
  spinSummary,
  stopSchedule,
  totalBet,
  winCycle,
  winSoundKey,
  type Grid,
  type WayWin,
} from "@/components/slot/slotMath";
import { impactMs, landingPlan } from "@/components/slot/Reel";
import { MAX_CELL_ASPECT, frameGeometry } from "@/components/slot/ReelFrame";
import { rtpRange } from "@/components/slot/SlotSheets";
import { FALLBACK_PAYTABLE } from "@/services/slotApi";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

describe("grid / stop mapping", () => {
  it("stop = top row, rows go down the strip and wrap", () => {
    const L = STRIPS[0]!.length;
    expect(reelWindow(STRIPS[0]!, 0)).toEqual([STRIPS[0]![0], STRIPS[0]![1], STRIPS[0]![2]]);
    expect(reelWindow(STRIPS[0]!, L - 1)).toEqual([STRIPS[0]![L - 1], STRIPS[0]![0], STRIPS[0]![1]]);
  });

  it("gridFromStops is row-major [row][reel]", () => {
    const stops = [3, 7, 11, 19, 30];
    const g = gridFromStops(stops);
    expect(g).toHaveLength(3);
    g.forEach((row) => expect(row).toHaveLength(5));
    stops.forEach((s, r) => {
      const w = reelWindow(STRIPS[r]!, s);
      expect([g[0]![r], g[1]![r], g[2]![r]]).toEqual(w);
    });
  });

  it("normalizeGrid accepts column-major 5×3 and leaves row-major alone", () => {
    const g = gridFromStops([1, 2, 3, 4, 5]);
    const cols = [0, 1, 2, 3, 4].map((r) => g.map((row) => row[r]!));
    expect(normalizeGrid(cols)).toEqual(g);
    expect(normalizeGrid(g as string[][])).toEqual(g);
  });

  it("v1 strips never show 2 scatters or 2 wilds in one window; wilds only on reels 2–4", () => {
    STRIPS.forEach((strip, r) => {
      for (let p = 0; p < strip.length; p++) {
        const w = reelWindow(strip, p);
        expect(w.filter((s) => s === "SCAT").length).toBeLessThanOrEqual(1);
        expect(w.filter((s) => s === "WILD").length).toBeLessThanOrEqual(1);
        if (r === 0 || r === 4) expect(w).not.toContain("WILD");
      }
    });
  });

  it("bet ladder is 25..500 coins", () => {
    expect(BET_LEVELS.map(totalBet)).toEqual([25, 50, 125, 250, 500]);
  });
});

describe("reel landing math", () => {
  it("landingTarget lands exactly on the server stop, moving downward by ≥ minTravel and < minTravel+L", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 2000; k++) {
      const L = STRIPS[k % 5]!.length;
      const current = (rnd() - 0.5) * 400;
      const stop = Math.floor(rnd() * L);
      const minTravel = 2 + rnd() * 30;
      const t = landingTarget(current, stop, L, minTravel);
      expect(mod(t, L)).toBeCloseTo(stop, 9);
      expect(current - t).toBeGreaterThanOrEqual(minTravel - 1e-9);
      expect(current - t).toBeLessThan(minTravel + L);
    }
  });

  it("column offset at the landing target shows the stop in the top row", () => {
    const cell = 73;
    STRIPS.forEach((strip) => {
      const L = strip.length;
      for (const stop of [0, 5, L - 1]) {
        const t = landingTarget(-123.4, stop, L, 6);
        expect(columnOffset(t, L, cell)).toBeCloseTo(-stop * cell, 6);
      }
    });
  });

  it("landingPlan overshoots by 8px and its easing starts near spin speed", () => {
    const plan = landingPlan(10.3, 4, 38, 600, 73);
    expect(plan.over).toBeCloseTo(8 / 73, 9);
    expect(mod(plan.target, 38)).toBeCloseTo(4, 9);
    expect(plan.distance).toBeGreaterThan(0);
    expect(plan.easing[1]).toBeLessThanOrEqual(plan.easing[0]);
  });
});

describe("stop schedule", () => {
  it("normal 600+200i, turbo 250+80i", () => {
    expect(stopSchedule({ turbo: false, reduceMotion: false, anticipationFrom: null })).toEqual([600, 800, 1000, 1200, 1400]);
    expect(stopSchedule({ turbo: true, reduceMotion: false, anticipationFrom: null })).toEqual([250, 330, 410, 490, 570]);
  });

  it("anticipation adds 600ms TOTAL only from the anticipated reel on", () => {
    const s = stopSchedule({ turbo: false, reduceMotion: false, anticipationFrom: 3 });
    expect(s).toEqual([600, 800, 1000, 1200 + ANTICIPATION_MS, 1400 + ANTICIPATION_MS]);
    expect(s[4]! - 1400).toBe(600);
  });

  it("late response keeps the stagger after the response", () => {
    const s = stopSchedule({ turbo: false, reduceMotion: false, anticipationFrom: null, elapsed: 900 });
    expect(s[0]).toBe(1150);
    expect(s[1]! - s[0]!).toBe(200);
  });

  it("reduceMotion cuts all reels together", () => {
    const s = stopSchedule({ turbo: false, reduceMotion: true, anticipationFrom: 2 });
    expect(new Set(s).size).toBe(1);
  });

  it("anticipation only when 2 scatters are already visible on stopped reels", () => {
    const g = (cols: string[][]): Grid => normalizeGrid(cols);
    const filler = ["A", "K", "Q"];
    expect(anticipationFromReel(g([["SCAT", "A", "K"], filler, ["Q", "SCAT", "J"], filler, filler]))).toBe(3);
    expect(anticipationFromReel(g([["SCAT", "A", "K"], ["SCAT", "Q", "J"], filler, filler, filler]))).toBe(2);
    expect(anticipationFromReel(g([["SCAT", "A", "K"], filler, filler, filler, ["SCAT", "A", "K"]]))).toBeNull();
    expect(anticipationFromReel(g([filler, filler, filler, filler, filler]))).toBeNull();
  });
});

describe("LDW classification + copy", () => {
  it("classifies loss / ldw / push / win", () => {
    expect(classifyOutcome(0, 125)).toBe("loss");
    expect(classifyOutcome(50, 125)).toBe("ldw");
    expect(classifyOutcome(125, 125)).toBe("push");
    expect(classifyOutcome(126, 125)).toBe("win");
  });

  it("never says WIN or celebrates when return ≤ wager", () => {
    const ldw = outcomeCopy(50, 125);
    expect(ldw).toEqual({ title: "Returned 50 of 125", detail: "Net −75", celebrate: false });
    expect(ldw.title).not.toMatch(/win/i);
    const push = outcomeCopy(125, 125);
    expect(push.title).toBe("Bet returned");
    expect(push.celebrate).toBe(false);
    expect(outcomeCopy(0, 125).celebrate).toBe(false);
    expect(outcomeCopy(1000, 125)).toEqual({ title: "WIN 1,000", detail: "Net +875", celebrate: true });
  });

  it("no win sound or count-up for LDW/push", () => {
    expect(winSoundKey(-75, 125)).toBeNull();
    expect(winSoundKey(0, 125)).toBeNull();
    expect(countUpMs(-75, 125)).toBe(0);
    expect(countUpMs(0, 125)).toBe(0);
  });
});

describe("tiers + count-ups (net multiple)", () => {
  it("BIG ≥15×, MEGA ≥40×, EPIC ≥100×", () => {
    expect(bigWinTier(14.99 * 100, 100)).toBeNull();
    expect(bigWinTier(1500, 100)).toBe("big");
    expect(bigWinTier(3999, 100)).toBe("big");
    expect(bigWinTier(4000, 100)).toBe("mega");
    expect(bigWinTier(10000, 100)).toBe("epic");
    expect(bigWinTier(0, 100)).toBeNull();
  });

  it("count-up durations 600 / 1200 / 3000 / 5000 / 8000", () => {
    expect(countUpMs(100, 100)).toBe(600);
    expect(countUpMs(499, 100)).toBe(600);
    expect(countUpMs(500, 100)).toBe(1200);
    expect(countUpMs(1500, 100)).toBe(3000);
    expect(countUpMs(4000, 100)).toBe(5000);
    expect(countUpMs(10000, 100)).toBe(8000);
  });

  it("win sound by net multiple", () => {
    expect(winSoundKey(100, 100)).toBe("slot_win_small");
    expect(winSoundKey(500, 100)).toBe("slot_win_medium");
    expect(winSoundKey(1500, 100)).toBe("slot_win_big");
  });
});

describe("win cycling", () => {
  const w = (symbol: WayWin["symbol"], payout: number, count = 3): WayWin => ({ symbol, count, ways: 2, payout, positions: [[0, 0]] });

  it("orders by payout desc, ties by symbol rank, includes scatter, caps at 6", () => {
    const wins = [w("9", 10), w("LION", 300), w("A", 50), w("K", 50), w("Q", 40), w("J", 20), w("10", 15)];
    const order = winCycle(wins, { count: 3, payout: 100, positions: [[1, 1]] });
    expect(order.map((e) => e.symbol)).toEqual(["LION", "SCAT", "A", "K", "Q", "J"]);
    expect(order).toHaveLength(MAX_CYCLE);
    expect(order[0]!.label).toBe("LION MASK ×3 · 2 WAYS · 300");
  });

  it("skips zero-pay entries", () => {
    expect(winCycle([w("9", 0)], { count: 1, payout: 0, positions: [] })).toEqual([]);
  });
});

describe("VoiceOver summary", () => {
  it("reads three rows then wins then net copy", () => {
    const g = gridFromStops([0, 0, 0, 0, 0]);
    const s = spinSummary(g, [{ symbol: "LOTUS", count: 3, ways: 1, payout: 25, positions: [] }], null, 25, 125);
    expect(s).toMatch(/^Row 1: .*Row 2: .*Row 3: /);
    expect(s).toContain("Lotus 3 of a kind, 1 way, pays 25.");
    expect(s).toContain("Returned 25 of 125. Net −100.");
  });
});

describe("slot layout + presentation helpers", () => {
  it("rtpRange collapses a range that rounds to one value", () => {
    expect(rtpRange({ ...FALLBACK_PAYTABLE, rtp: { min: 95.489, max: 95.508 } })).toBe("95.5%");
    expect(rtpRange({ ...FALLBACK_PAYTABLE, rtp: { min: 94.2, max: 96.1 } })).toBe("94.2–96.1%");
  });

  it("frameGeometry stretches cells into spare height, capped by aspect and by height", () => {
    const wide = frameGeometry(395, 900);
    expect(wide.cellH).toBe(Math.floor(wide.cell * MAX_CELL_ASPECT));
    const tight = frameGeometry(395, 240);
    expect(tight.cellH).toBe(tight.cell);
    expect(tight.H).toBeLessThanOrEqual(240);
    const some = frameGeometry(395, 330);
    expect(some.cellH).toBeGreaterThan(some.cell);
    expect(some.H).toBeLessThanOrEqual(330);
  });

  it("reel-stop impact fires at the end of travel, before the overshoot settle", () => {
    expect(impactMs(600)).toBe(510);
    expect(impactMs(150)).toBe(120);
    expect(impactMs(300, true)).toBe(300);
  });
});
