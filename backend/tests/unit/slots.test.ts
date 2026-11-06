import { createHmac } from "crypto";
import {
  REEL_STRIPS,
  PAYTABLE,
  PAY_SYMBOLS,
  SCATTER_PAYS,
  BET_LEVELS,
  BASE_BET,
  MATH,
  FEATURE_OPTIONS,
  MAX_WIN,
  CLIENT_SEED_RE,
  spinStops,
  drawMultiplier,
  featureOption,
  gridFromStops,
  evaluateSpin,
  anticipationFor,
  resolveBaseSpin,
  resolveFeature,
  roundCap,
  hmacUniform,
  publicPaytable,
  type SlotSymbol,
} from "../../src/services/slots.js";

const SS = "lion-lantern-pinned-server-seed";
const CS = "pinned_client-01";

// Independent reference sampler (spec wording, no shared code).
function refUniform(serverSeed: string, prefix: string, n: number): number {
  const limit = Math.floor(2 ** 32 / n) * n;
  for (let round = 0; ; round++) {
    const d = createHmac("sha256", serverSeed).update(`${prefix}:${round}`).digest();
    for (let i = 0; i < 32; i += 4) {
      const v = d.readUInt32BE(i);
      if (v < limit) return v % n;
    }
  }
}

// Brute-force 243-ways reference: walk every left→right path explicitly.
function refEvaluate(grid: SlotSymbol[][], level: number, mult: number): number {
  let total = 0;
  for (const sym of PAY_SYMBOLS) {
    let best = 0;
    const walk = (reel: number, usedWild: boolean): number => {
      // returns sum of pays over all maximal paths starting at this reel
      let sum = 0;
      let any = false;
      for (let row = 0; row < 3; row++) {
        const g = reel < 5 ? grid[row][reel] : undefined;
        if (g === sym || g === "WILD") {
          any = true;
          sum += walk(reel + 1, usedWild || g === "WILD");
        }
      }
      if (any) return sum;
      const count = reel;
      if (count < 3) return 0;
      return PAYTABLE[sym][count - 3] * level * (usedWild ? mult : 1);
    };
    best = walk(0, false);
    total += best;
  }
  const sc = grid.flat().filter((g) => g === "SCAT").length;
  return total + (SCATTER_PAYS[sc] ?? 0) * BASE_BET * level;
}

describe("slots RNG — pinned vector + sampler", () => {
  it("reproduces pinned reel stops (nonce 0) and multiplier (nonce 1)", () => {
    expect(spinStops(SS, CS, 0)).toEqual([12, 35, 16, 7, 23]);
    expect(spinStops(SS, CS, 1)).toEqual([11, 26, 29, 35, 26]);
    expect(drawMultiplier(SS, CS, 1, featureOption("ruby")!)).toBe(3);
    expect(drawMultiplier(SS, CS, 1, featureOption("imperial")!)).toBe(8);
  });

  it("matches an independent implementation of the domain-separated messages", () => {
    for (let nonce = 0; nonce < 20; nonce++) {
      const stops = spinStops(SS, CS, nonce);
      stops.forEach((st, r) => expect(st).toBe(refUniform(SS, `${CS}:${nonce}:reel:${r}`, REEL_STRIPS[r].length)));
    }
    const ruby = featureOption("ruby")!;
    const idx = refUniform(SS, `${CS}:1:mult`, 16); // weights 5/7/4
    expect(drawMultiplier(SS, CS, 1, ruby)).toBe(idx < 5 ? 2 : idx < 12 ? 3 : 4);
  });

  it("rejection sampling stays in range under heavy rejection", () => {
    const n = 2 ** 31 + 1; // ~50% of draws rejected
    for (let i = 0; i < 200; i++) {
      const v = hmacUniform(SS, `x:${i}`, n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(n);
      expect(v).toBe(refUniform(SS, `x:${i}`, n));
    }
  });

  it("builds the grid row-major top→bottom from stops", () => {
    expect(gridFromStops([12, 35, 16, 7, 23])).toEqual([
      ["SCAT", "J", "WILD", "J", "J"],
      ["K", "10", "10", "10", "10"],
      ["LANTERN", "9", "LION", "LANTERN", "LANTERN"],
    ]);
    // wraps around the strip end
    const g = gridFromStops([37, 37, 37, 37, 34]);
    expect(g[1][0]).toBe(REEL_STRIPS[0][0]);
    expect(g[2][4]).toBe(REEL_STRIPS[4][1]);
  });

  it("clientSeed pattern", () => {
    expect(CLIENT_SEED_RE.test("abc_DEF-123")).toBe(true);
    expect(CLIENT_SEED_RE.test("a:b")).toBe(false);
    expect(CLIENT_SEED_RE.test("")).toBe(false);
    expect(CLIENT_SEED_RE.test("x".repeat(65))).toBe(false);
  });
});

describe("slots evaluateSpin — hand-built grids", () => {
  const G = (rows: string[]): SlotSymbol[][] => rows.map((r) => r.trim().split(/\s+/) as SlotSymbol[]);

  it("counts ways and pays left→right with wild substitution", () => {
    const grid = G([
      "LION LION   WILD LION K",
      "A    LION   Q    J    K",
      "Q    K      J    10   9",
    ]);
    const e = evaluateSpin(grid, 1);
    const lion = e.wins.find((w) => w.symbol === "LION")!;
    // reels: 1 × 2 × 1(wild) × 1 = 2 ways, 4 of a kind; both ways use the wild
    expect(lion).toMatchObject({ count: 4, ways: 2, wildWays: 2, payout: 2 * 200 });
    expect(lion.positions).toEqual([[0, 0], [1, 0], [1, 1], [2, 0], [3, 0]]);
    // A: reel0 A, reel1 no A no wild → no win
    expect(e.wins.find((w) => w.symbol === "A")).toBeUndefined();
    expect(e.totalWin).toBe(refEvaluate(grid, 1, 1));
  });

  it("multiplier applies only to ways that use a wild", () => {
    const grid = G([
      "K K    WILD K K",
      "K A    K    A A",
      "A A    Q    Q Q",
    ]);
    // K: reel0 2, reel1 1, reel2 2 (K + WILD), reel3 1, reel4 1 → 4 ways; pure 2·1·1·1·1 = 2, wild 2
    const e1 = evaluateSpin(grid, 1, 1);
    const k1 = e1.wins.find((w) => w.symbol === "K")!;
    expect(k1).toMatchObject({ count: 5, ways: 4, wildWays: 2, payout: 4 * 125 });
    const e3 = evaluateSpin(grid, 2, 3);
    const k3 = e3.wins.find((w) => w.symbol === "K")!;
    expect(k3.payout).toBe(125 * 2 * (2 + 2 * 3));
    expect(k3.multiplier).toBe(3);
    // A: 1·2·1(wild)·1·1 = 2 ways, all use the wild
    const a3 = e3.wins.find((w) => w.symbol === "A")!;
    expect(a3).toMatchObject({ count: 5, ways: 2, wildWays: 2, payout: 125 * 2 * 2 * 3 });
    expect(e3.totalWin).toBe(refEvaluate(grid, 2, 3));
  });

  it("10/9 three-of-a-kind pays nothing; four pays 25 per way", () => {
    const g3 = G(["10 10 10 A K", "Q Q Q Q Q", "J K A J A"]);
    const e3 = evaluateSpin(g3, 1);
    expect(e3.wins.find((w) => w.symbol === "10")).toBeUndefined();
    const g4 = G(["10 10 10 10 K", "A K A K A", "J LION LION LION J"]);
    expect(evaluateSpin(g4, 1).wins.find((w) => w.symbol === "10")!.payout).toBe(25);
  });

  it("scatters pay anywhere × total bet and are not multiplied", () => {
    const grid = G([
      "SCAT A    K    Q    J",
      "A    K    Q    J    10",
      "K    SCAT A    SCAT 9",
    ]);
    const e = evaluateSpin(grid, 5, 15);
    expect(e.scatter.count).toBe(3);
    expect(e.scatter.payout).toBe(4 * 25 * 5);
    expect(e.scatter.positions).toEqual([[0, 0], [1, 2], [3, 2]]);
    expect(e.totalWin).toBe(refEvaluate(grid, 5, 15));
  });

  it("anticipation fires from the reel after the 2nd visible scatter", () => {
    const grid = G([
      "SCAT A K Q J",
      "A    K Q J 10",
      "K    A SCAT 9 J",
    ]);
    expect(anticipationFor(grid)).toEqual({ fromReel: 3 });
    expect(anticipationFor(G(["A A A A SCAT", "SCAT K K K K", "Q Q Q Q Q"]))).toBeNull();
  });

  it("matches a brute-force path evaluator on 3,000 random strip grids", () => {
    let seed = 12345;
    const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let i = 0; i < 3000; i++) {
      const stops = REEL_STRIPS.map((s) => rnd(s.length));
      const grid = gridFromStops(stops);
      const level = BET_LEVELS[i % BET_LEVELS.length];
      const mult = [1, 2, 3, 7, 15][i % 5];
      expect(evaluateSpin(grid, level, mult).totalWin).toBe(refEvaluate(grid, level, mult));
    }
  });
});

describe("slots math — exact RTP from shipped strips + paytable", () => {
  // Ways RTP is separable per symbol by reel independence:
  // E[pay_k] = Π_{r<k} E[count_r] × P(reel k has no sym/wild) (k<5), times pay.
  const windows = REEL_STRIPS.map((strip) => strip.map((_, p) => [0, 1, 2].map((row) => strip[(p + row) % strip.length])));

  it("no window ever shows 2 scatters or 2 wilds; wilds only on reels 2–4", () => {
    windows.forEach((reel, r) => reel.forEach((w) => {
      expect(w.filter((x) => x === "SCAT").length).toBeLessThanOrEqual(1);
      expect(w.filter((x) => x === "WILD").length).toBeLessThanOrEqual(1);
      if (r === 0 || r === 4) expect(w).not.toContain("WILD");
    }));
  });

  it("ways RTP (pure + wild) equals the enumeration constants", () => {
    let pure = 0;
    let all = 0;
    for (const sym of PAY_SYMBOLS) {
      const Ec: number[] = [], Ea: number[] = [], P0: number[] = [];
      windows.forEach((reel) => {
        let c = 0, a = 0, z = 0;
        for (const w of reel) {
          const cs = w.filter((x) => x === sym).length;
          const ws = w.filter((x) => x === "WILD").length;
          c += cs; a += cs + ws; if (cs + ws === 0) z++;
        }
        Ec.push(c / reel.length); Ea.push(a / reel.length); P0.push(z / reel.length);
      });
      for (let k = 3; k <= 5; k++) {
        let pp = 1, pa = 1;
        for (let r = 0; r < k; r++) { pp *= Ec[r]; pa *= Ea[r]; }
        if (k < 5) { pp *= P0[k]; pa *= P0[k]; }
        pure += pp * PAYTABLE[sym][k - 3];
        all += pa * PAYTABLE[sym][k - 3];
      }
    }
    expect(pure / BASE_BET).toBeCloseTo(MATH.waysPureRtp, 12);
    expect((all - pure) / BASE_BET).toBeCloseTo(MATH.waysWildRtp, 12);
  });

  it("scatter RTP and trigger rate equal the enumeration constants", () => {
    // convolve per-reel scatter-count distributions (counts, exact integers)
    let dist = [1];
    for (const reel of windows) {
      const per = [0, 0];
      for (const w of reel) per[w.includes("SCAT") ? 1 : 0]++;
      const next = new Array(dist.length + 1).fill(0);
      dist.forEach((v, i) => { next[i] += v * per[0]; next[i + 1] += v * per[1]; });
      dist = next;
    }
    const N = dist.reduce((a, b) => a + b, 0);
    expect(N).toBe(MATH.cycle);
    expect(dist[3] + dist[4] + dist[5]).toBe(MATH.triggerCombos);
    const scat = (dist[3] * 4 + dist[4] * 15 + dist[5] * 100) / N;
    expect(scat).toBeCloseTo(MATH.scatterRtp, 14);
    expect(MATH.waysPureRtp + MATH.waysWildRtp + MATH.scatterRtp).toBeCloseTo(MATH.baseRtp, 12);
  });

  it("feature options are within 0.1 pt RTP of each other and in 95.0–96.0", () => {
    const rtps = FEATURE_OPTIONS.map((o) => o.rtp);
    expect(Math.max(...rtps) - Math.min(...rtps)).toBeLessThanOrEqual(0.1);
    rtps.forEach((r) => { expect(r).toBeGreaterThanOrEqual(95); expect(r).toBeLessThanOrEqual(96); });
    FEATURE_OPTIONS.forEach((o) => expect(o.weights.length).toBe(o.multipliers.length));
  });

  it("published top pay × max bet never exceeds MAX_WIN", () => {
    const maxLevel = Math.max(...BET_LEVELS);
    expect(roundCap(BASE_BET * maxLevel)).toBe(MAX_WIN);
    expect(roundCap(25)).toBe(25_000);
    expect(SCATTER_PAYS[5] * BASE_BET * maxLevel).toBeLessThanOrEqual(MAX_WIN);
    expect(publicPaytable().rtpRange[0]).toBeGreaterThanOrEqual(95);
  });
});

describe("slots feature resolution", () => {
  it("is deterministic and numbers free spins 1..N", () => {
    const a = resolveFeature(SS, "trig-136", 2, "ruby", 0);
    const b = resolveFeature(SS, "trig-136", 2, "ruby", 0);
    expect(a).toEqual(b);
    expect(a.spins.map((s) => s.nonce)).toEqual(Array.from({ length: a.played }, (_, i) => i + 1));
    expect(a.played).toBe(a.awarded);
    expect(a.awarded).toBe(15 * (1 + a.retriggers));
    expect(a.rawWin).toBe(a.spins.reduce((x, s) => x + s.totalWin, 0));
    a.spins.forEach((s) => expect([2, 3, 4]).toContain(s.multiplier));
    expect(resolveFeature(SS, "trig-137", 2, "ruby", 0)).not.toEqual(a);
  });

  it("pinned trigger seed triggers the feature on the base spin", () => {
    const r = resolveBaseSpin(SS, "trig-136", 1);
    expect(r.featureTriggered).toBe(true);
    expect(r.spin.scatter.count).toBeGreaterThanOrEqual(3);
  });

  it("caps retriggers at 3 (denied 4th retrigger)", () => {
    const f = resolveFeature(SS, "cap-1860", 1, "jade", 0);
    expect(f.retriggers).toBe(3);
    expect(f.awarded).toBe(80);
    expect(f.played).toBe(80);
    expect(f.spins.some((s) => s.retriggerDenied)).toBe(true);
    expect(f.spins.filter((s) => s.retrigger).length).toBe(3);
  });

  it("clamps base + feature to the round cap", () => {
    const free = resolveFeature(SS, "trig-136", 1, "gold", 0);
    expect(free.rawWin).toBeGreaterThan(0);
    const cap = roundCap(25);
    const clamped = resolveFeature(SS, "trig-136", 1, "gold", cap - 1);
    expect(clamped.totalWin).toBe(Math.min(1, free.rawWin));
    expect(clamped.capped).toBe(free.rawWin > 1);
    const none = resolveFeature(SS, "trig-136", 1, "gold", cap);
    expect(none.totalWin).toBe(0);
    expect(none.capped).toBe(true);
  });

  it("rejects bad options and bet levels", () => {
    expect(() => resolveFeature(SS, CS, 1, "emerald", 0)).toThrow();
    expect(() => resolveBaseSpin(SS, CS, 3)).toThrow();
  });
});
