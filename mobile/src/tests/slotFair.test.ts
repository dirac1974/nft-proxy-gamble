import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { utf8ToBytes } from "@noble/hashes/utils";
import { hashServerSeed } from "@/services/provablyFair";
import {
  deriveMultiplier,
  deriveStops,
  isSlotVerified,
  multMessage,
  reelMessage,
  sampleIndex,
  verifySlotRound,
} from "@/services/slotFair";
import { STRIPS, gridFromStops } from "@/components/slot/slotMath";
import { normalizeFeatureResponse, normalizePaytable, normalizeSession, normalizeSpinResponse } from "@/services/slotApi";

jest.mock("@/services/api", () => ({ request: jest.fn(), extractVerifiedBalance: jest.fn(() => 0) }));

const SEED = "a3f1c0de5eed0000000000000000000000000000000000000000000000000001";
const CS = "player_seed-1";

describe("slotFair sampler", () => {
  it("uses the domain-separated message tags", () => {
    expect(reelMessage("cs", 7, 2, 0)).toBe("cs:7:reel:2:0");
    expect(multMessage("cs", 7, 1)).toBe("cs:7:mult:1");
  });

  it("first chunk below the unbiased limit, big-endian, mod n", () => {
    const mac = hmac(sha256, utf8ToBytes(SEED), utf8ToBytes(reelMessage(CS, 0, 0, 0)));
    const n = STRIPS[0]!.length;
    const limit = Math.floor(2 ** 32 / n) * n;
    let expected = -1;
    for (let i = 0; i < 8 && expected < 0; i++) {
      const v = ((mac[i * 4]! << 24) >>> 0) + (mac[i * 4 + 1]! << 16) + (mac[i * 4 + 2]! << 8) + mac[i * 4 + 3]!;
      if (v < limit) expected = v % n;
    }
    expect(sampleIndex(SEED, (r) => reelMessage(CS, 0, 0, r), n)).toBe(expected);
  });

  it("is deterministic and in range", () => {
    for (let nonce = 0; nonce < 50; nonce++) {
      const a = deriveStops(SEED, CS, nonce);
      expect(deriveStops(SEED, CS, nonce)).toEqual(a);
      a.forEach((s, r) => {
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThan(STRIPS[r]!.length);
      });
    }
    expect(deriveStops(SEED, CS, 0)).not.toEqual(deriveStops(SEED, CS, 1));
  });

  it("is roughly uniform per reel", () => {
    const L = STRIPS[4]!.length;
    const hist = new Array(L).fill(0);
    const N = 7000;
    for (let i = 0; i < N; i++) hist[deriveStops(`s${i}`, CS, 0)[4]!]++;
    const exp = N / L;
    const chi = hist.reduce((a, o) => a + (o - exp) ** 2 / exp, 0);
    expect(chi).toBeLessThan(80); // df = 34, p ≈ 1e-5
  });

  // Backend pinned vector (backend/tests/unit/slots.test.ts).
  it("reproduces the backend pinned vector", () => {
    const SS = "lion-lantern-pinned-server-seed";
    const PCS = "pinned_client-01";
    expect(deriveStops(SS, PCS, 0)).toEqual([12, 35, 16, 7, 23]);
    expect(deriveStops(SS, PCS, 1)).toEqual([11, 26, 29, 35, 26]);
    expect(deriveMultiplier(SS, PCS, 1, [2, 3, 4], [5, 7, 4])).toBe(3);
    expect(deriveMultiplier(SS, PCS, 1, [8, 10, 12, 15], [4, 2, 1, 2])).toBe(8);
    expect(gridFromStops([12, 35, 16, 7, 23])).toEqual([
      ["SCAT", "J", "WILD", "J", "J"],
      ["K", "10", "10", "10", "10"],
      ["LANTERN", "9", "LION", "LANTERN", "LANTERN"],
    ]);
  });

  it("weighted multiplier draw follows the weights", () => {
    const counts: Record<number, number> = { 8: 0, 10: 0, 12: 0, 15: 0 };
    for (let n = 1; n <= 4500; n++) counts[deriveMultiplier(SEED, CS, n, [8, 10, 12, 15], [4, 2, 1, 2])]!++;
    expect(counts[8]! / 4500).toBeCloseTo(4 / 9, 1);
    expect(counts[12]! / 4500).toBeCloseTo(1 / 9, 1);
  });
});

describe("verifySlotRound", () => {
  const RUBY = { multipliers: [2, 3, 4], weights: [5, 7, 4] };
  const IMPERIAL = { multipliers: [8, 10, 12, 15], weights: [4, 2, 1, 2] };
  const spinsFor = (nonces: number[], set: { multipliers: number[]; weights: number[] } | null) =>
    nonces.map((n) => {
      const stops = deriveStops(SEED, CS, n);
      return { nonce: n, stops, grid: gridFromStops(stops), multiplier: n > 0 && set ? deriveMultiplier(SEED, CS, n, set.multipliers, set.weights) : null };
    });

  it("passes for an honest round incl. free spins + multipliers", () => {
    const v = verifySlotRound(SEED, hashServerSeed(SEED), CS, spinsFor([0, 1, 2, 3], RUBY), RUBY);
    expect(isSlotVerified(v)).toBe(true);
    expect(v.checkedSpins).toBe(4);
  });

  it("fails on a tampered stop, grid, multiplier or seed", () => {
    const spins = spinsFor([0, 1], IMPERIAL);
    const badStop = spins.map((s, i) => (i === 1 ? { ...s, stops: s.stops.map((x, r) => (r === 2 ? (x + 1) % STRIPS[2]!.length : x)) } : s));
    expect(verifySlotRound(SEED, hashServerSeed(SEED), CS, badStop, IMPERIAL).mismatchNonces).toEqual([1]);
    const badGrid = spins.map((s, i) => (i === 0 ? { ...s, grid: gridFromStops([0, 0, 0, 0, 0]) } : s));
    expect(verifySlotRound(SEED, hashServerSeed(SEED), CS, badGrid, null).gridMatch).toBe(false);
    const m = spins[1]!.multiplier!;
    const badMult = spins.map((s, i) => (i === 1 ? { ...s, multiplier: m === 8 ? 15 : 8 } : s));
    expect(verifySlotRound(SEED, hashServerSeed(SEED), CS, badMult, IMPERIAL).multipliersMatch).toBe(false);
    expect(verifySlotRound(SEED, "0xdeadbeef", CS, spins, null).seedHashMatches).toBe(false);
  });
});

describe("slotApi normalisers", () => {
  it("accepts nested spin + column-major grid + object positions", () => {
    const stops = [1, 2, 3, 4, 5];
    const g = gridFromStops(stops);
    const cols = [0, 1, 2, 3, 4].map((r) => g.map((row) => row[r]));
    const r = normalizeSpinResponse(
      {
        sessionId: "s",
        spin: {
          nonce: 0,
          stops,
          grid: cols,
          wins: [{ symbol: "A", count: 3, ways: 2, payout: 20, positions: [{ reel: 0, row: 1 }] }],
          scatter: { count: 1, payout: 0, positions: [[2, 0]] },
          anticipation: null,
        },
        totalWagered: 25,
        totalReturn: 20,
        feature: null,
        serverSeed: "x",
        serverSeedHash: "y",
        clientSeed: "c",
      },
      975,
      1,
    );
    expect(r.spin.grid).toEqual(g);
    expect(r.spin.wins[0]!.positions).toEqual([[0, 1]]);
    expect(r.spin.scatter.positions).toEqual([[2, 0]]);
    expect(r.feature).toBeNull();
    expect(r.newBalance).toBe(975);
  });

  it("feature offer keeps options; seed absent while pending", () => {
    const g = gridFromStops([0, 0, 0, 0, 0]);
    const r = normalizeSpinResponse(
      {
        stops: [0, 0, 0, 0, 0],
        grid: g,
        wins: [],
        scatter: { count: 3, payout: 100, positions: [] },
        totalReturn: 100,
        feature: { triggered: true, scatterCount: 3, options: [{ id: "gold", spins: 10, multipliers: [3, 5, 7], weights: [8, 7, 6], rtp: 95.489, volatility: "high" }] },
      },
      1,
      1,
    );
    expect(r.feature?.options[0]).toEqual({ id: "gold", spins: 10, multipliers: [3, 5, 7], weights: [8, 7, 6], rtp: 95.489, volatility: "High" });
    expect(r.serverSeed).toBeNull();
    const f = normalizeFeatureResponse({ spins: [{ nonce: 1, stops: [0, 0, 0, 0, 0], grid: g, multiplier: 5, wins: [], scatter: {} }], feature: { option: "gold", awarded: 10, retriggers: 0, played: 10, totalWin: 500, capped: false }, totalReturn: 600, serverSeed: "s", serverSeedHash: "h", clientSeed: "c" }, 2);
    expect(f.spins[0]!.multiplier).toBe(5);
    expect(f.feature.totalWin).toBe(500);
  });
});

describe("slotApi paytable/session normalisers (backend shapes)", () => {
  it("reads publicPaytable(): paytable record, rtpRange tuple, weighted options", () => {
    const pt = normalizePaytable({
      betLevels: [1, 2, 5, 10, 20],
      maxWin: 500000,
      paytable: { LION: [60, 200, 800], "10": [0, 25, 60] },
      scatterPays: { 3: 4, 4: 15, 5: 100 },
      options: [{ id: "imperial", spins: 5, multipliers: [8, 10, 12, 15], weights: [4, 2, 1, 2], rtp: 95.489, volatility: "very high" }],
      rtpRange: [95.489, 95.508],
    });
    expect(pt.pays.LION).toEqual([60, 200, 800]);
    expect(pt.rtp).toEqual({ min: 95.489, max: 95.508 });
    expect(pt.options[0]!.volatility).toBe("Very high");
    expect(pt.options[0]!.weights).toEqual([4, 2, 1, 2]);
  });

  it("sums autoResolvedFeatures on start-session", () => {
    const s = normalizeSession({
      sessionId: "x",
      serverSeedHash: "h",
      clientSeed: "c",
      autoResolvedFeatures: [{ feature: { option: "ruby", totalWin: 300 } }, { feature: { option: "ruby", totalWin: 50 } }],
    });
    expect(s.resolvedFeature).toEqual({ option: "ruby", totalWin: 350, count: 2 });
    expect(normalizeSession({ sessionId: "y" }).resolvedFeature).toBeNull();
  });
});
