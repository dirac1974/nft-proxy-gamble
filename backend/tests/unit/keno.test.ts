import { Worker } from "worker_threads";
import * as os from "os";
import * as path from "path";
import {
  BET_LEVELS,
  BOARD_SIZE,
  CARD_CAP_MULTIPLIER,
  DRAW_COUNT,
  KENO4_GAME_TYPE,
  KENO_GAME_TYPE,
  KenoError,
  MAX_WIN,
  PAYTABLE_X10,
  RTP_BY_SPOTS,
  binom,
  catchProbability,
  drawNumbers,
  hmacUint32Stream,
  modeFromGameType,
  partialFisherYates,
  publicPaytable,
  resolveKeno,
  rtpExact,
  rtpPercent,
  validateCards,
  type KenoCardInput,
} from "../../src/services/keno";

// Shipped paytable, transcribed independently from keno-spec-v1 (decimal multipliers).
const SPEC_PAYTABLE: Record<number, Record<number, string>> = {
  1: { 1: "3.7" },
  2: { 2: "15.5" },
  3: { 2: "2", 3: "48" },
  4: { 2: "1", 3: "5", 4: "165" },
  5: { 3: "3", 4: "20", 5: "690" },
  6: { 3: "2", 4: "7", 5: "75", 6: "1900" },
  7: { 3: "1", 4: "4", 5: "20", 6: "300", 7: "6500" },
  8: { 4: "2", 5: "15", 6: "100", 7: "1350", 8: "10000" },
  9: { 4: "1", 5: "6", 6: "47", 7: "375", 8: "4000", 9: "10000" },
  10: { 5: "4", 6: "25", 7: "175", 8: "1000", 9: "4000", 10: "10000" },
};
const SPEC_RTP_PERCENT: Record<number, number> = {
  1: 92.5, 2: 93.196, 3: 94.352, 4: 93.433, 5: 93.865,
  6: 93.665, 7: 93.477, 8: 93.429, 9: 93.803, 10: 93.567,
};

const tenths = (d: string): bigint => {
  const [i, f = ""] = d.split(".");
  return BigInt(i) * 10n + BigInt((f + "0")[0]);
};

describe("keno paytable + exact RTP", () => {
  it("PAYTABLE_X10 equals the spec table exactly", () => {
    const fromSpec: Record<number, Record<number, number>> = {};
    for (const [s, row] of Object.entries(SPEC_PAYTABLE)) {
      fromSpec[Number(s)] = Object.fromEntries(Object.entries(row).map(([k, v]) => [Number(k), Number(tenths(v))]));
    }
    expect(PAYTABLE_X10).toEqual(fromSpec);
    expect(publicPaytable()[1][1]).toBe(3.7);
    expect(publicPaytable()[2][2]).toBe(15.5);
  });

  it("catch probabilities sum to exactly 1 for every spot count", () => {
    for (let s = 1; s <= 10; s++) {
      let num = 0n;
      const den = binom(BOARD_SIZE, DRAW_COUNT);
      for (let k = 0; k <= s; k++) num += binom(s, k) * binom(BOARD_SIZE - s, DRAW_COUNT - k);
      expect(num).toBe(den);
      const p = catchProbability(s, s);
      expect(p.num > 0n && p.den > p.num).toBe(true);
    }
  });

  it("exact hypergeometric RTP (independent BigInt computation) matches spec per spot count", () => {
    const C8020 = binom(80, 20);
    for (let s = 1; s <= 10; s++) {
      // independent rational: Σ C(s,k)C(80-s,20-k)·mult10 / (C(80,20)·10)
      let num = 0n;
      for (const [k, v] of Object.entries(SPEC_PAYTABLE[s])) {
        num += binom(s, Number(k)) * binom(80 - s, 20 - Number(k)) * tenths(v);
      }
      const den = C8020 * 10n;
      const r = rtpExact(s);
      expect(num * r.den).toBe(r.num * den); // identical rational
      // percent to 3 dp, exact half-up rounding
      const pct3 = Number((num * 100_000n * 2n + den) / (den * 2n)) / 1000;
      expect(pct3).toBe(SPEC_RTP_PERCENT[s]);
      expect(rtpPercent(s)).toBe(SPEC_RTP_PERCENT[s]);
      expect(RTP_BY_SPOTS[s]).toBe(SPEC_RTP_PERCENT[s]);
      // spec band 92.50–94.35% (rounded)
      expect(r.num * 10000n >= 9250n * r.den).toBe(true);
      expect(r.num * 10000n < 9436n * r.den).toBe(true);
    }
    expect(rtpExact(1)).toEqual({ num: 37n, den: 40n }); // 1/4 × 3.7 exactly
  });

  it("bet ladder × top pay never exceeds MAX_WIN (cap never cuts a published single-card pay)", () => {
    const top = Math.max(...Object.values(PAYTABLE_X10).flatMap((r) => Object.values(r))) / 10;
    expect(top).toBeLessThanOrEqual(CARD_CAP_MULTIPLIER);
    expect(top * Math.max(...BET_LEVELS)).toBeLessThanOrEqual(MAX_WIN);
  });
});

describe("keno provably-fair draw", () => {
  // PINNED (v2 tagged message `${clientSeed}:${nonce}:keno:${counter}`), cross-checked against
  // an independent Python implementation of the same algorithm.
  const TAGGED_VECTOR = [51, 15, 17, 37, 65, 57, 78, 8, 4, 16, 41, 79, 36, 56, 23, 21, 73, 35, 71, 43];
  // v1 spec vector (untagged `${clientSeed}:${nonce}:${counter}`) — reproduces rtp.py.
  const V1_UNTAGGED_VECTOR = [22, 61, 39, 53, 3, 47, 5, 36, 44, 43, 33, 50, 29, 1, 30, 40, 38, 37, 16, 6];

  it("pinned tagged vector: serverSeed='a'*64, clientSeed='client', nonce=0", () => {
    expect(drawNumbers("a".repeat(64), "client", 0)).toEqual(TAGGED_VECTOR);
  });

  it("same Fisher–Yates over the untagged v1 message reproduces the v1 vector, which differs from v2", () => {
    const untagged = partialFisherYates(hmacUint32Stream("a".repeat(64), (c) => `client:0:${c}`));
    expect(untagged).toEqual(V1_UNTAGGED_VECTOR);
    expect(untagged).not.toEqual(TAGGED_VECTOR);
  });

  it("draws 20 distinct numbers in 1..80, deterministic, sensitive to every input", () => {
    const d = drawNumbers("s", "c", 0);
    expect(d).toHaveLength(20);
    expect(new Set(d).size).toBe(20);
    expect(d.every((n) => Number.isInteger(n) && n >= 1 && n <= 80)).toBe(true);
    expect(drawNumbers("s", "c", 0)).toEqual(d);
    expect(drawNumbers("s2", "c", 0)).not.toEqual(d);
    expect(drawNumbers("s", "c2", 0)).not.toEqual(d);
    expect(drawNumbers("s", "c", 1)).not.toEqual(d);
  });

  it("rejection sampling discards v ≥ floor(2^32/n)·n", () => {
    const limit80 = Math.floor(0x1_0000_0000 / 80) * 80;
    const seq = [limit80, 0xffffffff, 5, ...Array.from({ length: 19 }, () => 0)];
    let i = 0;
    const d = partialFisherYates(() => seq[i++]);
    expect(d[0]).toBe(6); // first two rejected, 5 % 80 = 5 → pool[5] = 6
    expect(d.slice(1)).toEqual([2, 3, 4, 5, 1, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  // Chi-square uniformity over 1,000,000 production draws, sharded across worker threads
  // (each worker loads src/services/keno.ts via tsx and calls the real drawNumbers).
  it("chi-square: uniform per number and per draw position over 1e6 draws", async () => {
    const TOTAL = 1_000_000;
    const W = Math.max(1, Math.min(10, os.cpus().length - 1));
    const kenoPath = path.resolve(__dirname, "../../src/services/keno.ts");
    const workerSrc = `
      require("tsx/cjs");
      const { parentPort, workerData } = require("worker_threads");
      const k = require(workerData.kenoPath);
      const counts = new Float64Array(20 * 80);
      for (let n = workerData.from; n < workerData.to; n++) {
        const d = k.drawNumbers("chi-square-server-seed", "chi", n);
        for (let p = 0; p < 20; p++) counts[p * 80 + d[p] - 1]++;
      }
      parentPort.postMessage(counts);
    `;
    const per = Math.ceil(TOTAL / W);
    const shards = await Promise.all(
      Array.from({ length: W }, (_, w) =>
        new Promise<Float64Array>((resolve, reject) => {
          const worker = new Worker(workerSrc, {
            eval: true,
            workerData: { kenoPath, from: w * per, to: Math.min(TOTAL, (w + 1) * per) },
          });
          worker.once("message", (m: Float64Array) => { resolve(m); void worker.terminate(); });
          worker.once("error", reject);
        }),
      ),
    );
    const pos = new Float64Array(20 * 80);
    for (const s of shards) for (let i = 0; i < pos.length; i++) pos[i] += s[i];

    // χ²(79) bounds at two-sided p ≈ 1e-6 (Wilson–Hilferty): [32.7, 154.0]; use [30, 160].
    const LO = 30;
    const HI = 160;

    // Per position: each position is a uniform categorical over 80 numbers.
    for (let p = 0; p < 20; p++) {
      const E = TOTAL / 80;
      let chi = 0;
      for (let n = 0; n < 80; n++) chi += (pos[p * 80 + n] - E) ** 2 / E;
      expect(chi).toBeGreaterThan(LO);
      expect(chi).toBeLessThan(HI);
    }

    // Per number (any position): counts follow sampling without replacement, so
    // Cov = n·p(1−p)·N/(N−1)·(I − J/N) → Σ(O−E)²/(n·p(1−p)·N/(N−1)) ~ χ²(79).
    const p0 = DRAW_COUNT / BOARD_SIZE;
    const E = TOTAL * p0;
    const scale = TOTAL * p0 * (1 - p0) * (BOARD_SIZE / (BOARD_SIZE - 1));
    let chi = 0;
    let total = 0;
    for (let n = 0; n < 80; n++) {
      let c = 0;
      for (let p = 0; p < 20; p++) c += pos[p * 80 + n];
      total += c;
      chi += (c - E) ** 2 / scale;
    }
    expect(total).toBe(TOTAL * 20);
    expect(chi).toBeGreaterThan(LO);
    expect(chi).toBeLessThan(HI);
  }, 60_000);
});

describe("keno validation", () => {
  const card = (spots: number[], bet = 10): KenoCardInput => ({ spots, bet });
  const bad = (cards: KenoCardInput[], mode: "single" | "quad", re: RegExp) =>
    expect(() => validateCards(cards, mode)).toThrow(re);

  it("maps gameTypes to modes", () => {
    expect(modeFromGameType(KENO_GAME_TYPE)).toBe("single");
    expect(modeFromGameType(KENO4_GAME_TYPE)).toBe("quad");
    expect(modeFromGameType("roulette-euro-1-0")).toBeNull();
  });

  it("accepts valid single and quad inputs", () => {
    expect(() => validateCards([card([1, 2, 3])], "single")).not.toThrow();
    expect(() => validateCards([card([1]), card([2]), card([3]), card([1, 2])], "quad")).not.toThrow();
    for (const b of BET_LEVELS) expect(() => validateCards([card([1, 80], b)], "single")).not.toThrow();
    expect(() => validateCards([card([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)], "single")).not.toThrow();
    expect(() =>
      validateCards([card([1], 50), card([2], 50), card([3], 50), card([4], 50)], "quad"),
    ).not.toThrow();
  });

  it("rejects duplicate spots within a card", () => bad([card([5, 5])], "single", /duplicate/));
  it("rejects identical spot sets across cards (order-insensitive)", () =>
    bad([card([3, 1, 2]), card([1, 2, 3])], "quad", /identical/));
  it("rejects bets not in the ladder", () => {
    for (const b of [0, 5, 15, 30, 100, 250, 10.5, -10]) bad([card([1], b)], "single", /bet must be one of/);
  });
  it("rejects mixed bets", () => bad([card([1], 10), card([2], 20)], "quad", /same bet/));
  it("enforces card counts per mode", () => {
    bad([], "single", /exactly 1/);
    bad([card([1]), card([2])], "single", /exactly 1/);
    bad([], "quad", /1–4/);
    bad([card([1]), card([2]), card([3]), card([4]), card([5])], "quad", /1–4/);
  });
  it("rejects out-of-range and non-integer spots, and wrong spot counts", () => {
    bad([card([0])], "single", /1\.\.80/);
    bad([card([81])], "single", /1\.\.80/);
    bad([card([1.5])], "single", /1\.\.80/);
    bad([card([])], "single", /pick 1–10/);
    bad([card([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])], "single", /pick 1–10/);
  });
  it("resolveKeno throws KenoError for a malformed drawn vector", () => {
    expect(() => resolveKeno([1, 2, 3], [card([1])], "single")).toThrow(KenoError);
    expect(() => resolveKeno(Array(20).fill(1), [card([1])], "single")).toThrow(KenoError);
  });
});

describe("keno settlement + caps", () => {
  const drawn1to20 = Array.from({ length: 20 }, (_, i) => i + 1);

  it("pays bet × multiplier with integer math, hits in draw order", () => {
    const drawn = [...drawn1to20].reverse(); // 20..1
    const r = resolveKeno(drawn, [{ spots: [1, 50], bet: 20 }], "single");
    expect(r.results[0]).toMatchObject({ cardIndex: 0, spots: [1, 50], hits: [1], catches: 1, multiplier: 0, payout: 0 });
    const r1 = resolveKeno(drawn, [{ spots: [3], bet: 10 }], "single");
    expect(r1.results[0]).toMatchObject({ catches: 1, multiplier: 3.7, payout: 37 });
    const r5 = resolveKeno(drawn, [{ spots: [2, 3, 4, 70, 80], bet: 50 }], "single");
    expect(r5.results[0]).toMatchObject({ hits: [4, 3, 2], catches: 3, multiplier: 3, payout: 150 });
    expect(r5).toMatchObject({ totalWagered: 50, totalReturn: 150, netProfit: 100, capped: false });
  });

  it("every (spots, catches, bet) payout is an exact integer", () => {
    for (let s = 1; s <= 10; s++)
      for (let k = 0; k <= s; k++)
        for (const b of BET_LEVELS) {
          const spots = Array.from({ length: s }, (_, i) => i + 1);
          // put exactly k of the spots in the draw
          const drawn = [...spots.slice(0, k), ...Array.from({ length: 20 - k }, (_, i) => 41 + i)];
          const r = resolveKeno(drawn, [{ spots, bet: b }], "single");
          expect(Number.isInteger(r.results[0].payout)).toBe(true);
          expect(r.results[0].payout * 10).toBe(b * (PAYTABLE_X10[s][k] ?? 0));
        }
  });

  it("top single-card pay (10 of 10 @ 50) = MAX_WIN exactly and is not capped", () => {
    const spots = Array.from({ length: 10 }, (_, i) => i + 1);
    const r = resolveKeno(drawn1to20, [{ spots, bet: 50 }], "single");
    expect(r.totalReturn).toBe(MAX_WIN);
    expect(r.capped).toBe(false);
  });

  it("quad: game total is capped at MAX_WIN and Σ card payouts === totalReturn", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8]; // 8/8 → 10000× → 500,000
    const b = [1, 2, 3, 4, 5, 6, 7, 8, 60]; // 8/9 → 4000× → 200,000
    const c = [9, 10]; // 2/2 → 15.5× → 775
    const r = resolveKeno(drawn1to20, [{ spots: a, bet: 50 }, { spots: b, bet: 50 }, { spots: c, bet: 50 }], "quad");
    expect(r.capped).toBe(true);
    expect(r.totalReturn).toBe(MAX_WIN);
    expect(r.results.map((x) => x.payout)).toEqual([500_000, 0, 0]);
    expect(r.results.map((x) => x.multiplier)).toEqual([10000, 4000, 15.5]);
    expect(r.totalWagered).toBe(150);
    expect(r.netProfit).toBe(MAX_WIN - 150);
  });

  it("quad below the cap is not capped and sums per-card payouts", () => {
    const r = resolveKeno(drawn1to20, [{ spots: [1], bet: 20 }, { spots: [1, 2], bet: 20 }, { spots: [79], bet: 20 }], "quad");
    expect(r.results.map((x) => x.payout)).toEqual([74, 310, 0]);
    expect(r).toMatchObject({ totalWagered: 60, totalReturn: 384, capped: false });
  });
});
