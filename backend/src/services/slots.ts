import { createHmac, randomBytes } from "crypto";

// "Lion Lantern Night" — 5×3, 243 ways, provably-fair slot with a free-games feature.
// v1 math — pending Stats sign-off (scratchpad slot2/result.md). Paytable, strips,
// feature options, weights, caps and RTP constants below must not change without
// Stats sign-off + walk-forward validation reference.
//
// Grid convention: grid[row][reel], rows top→bottom (0..2), reels left→right (0..4).
// Reel r showing stop p displays strip[r][p], strip[r][p+1], strip[r][p+2] (mod L).
//
// RNG (domain-separated HMAC-SHA256 keyed by serverSeed):
//   reel stop: `${clientSeed}:${nonce}:reel:${r}:${round}`
//   multiplier: `${clientSeed}:${nonce}:mult:${round}`
// Each digest yields 8 big-endian uint32 values; the first v < floor(2^32/n)·n
// gives v % n (rejection sampling, no modulo bias). If all 8 are rejected, round++.
// Base spin nonce 0; free spins nonces 1..N in play order (retriggers included).

export const SLOTS_GAME_TYPE = "slots-lantern-night-1-0";
export const SLOTS_MATH_VERSION = "v1-pending-stats-signoff";

export const SYMBOLS = [
  "WILD", "SCAT", "LION", "CRANE", "LANTERN", "LOTUS", "PEONY_FAN", "A", "K", "Q", "J", "10", "9",
] as const;
export type SlotSymbol = (typeof SYMBOLS)[number];
export type PaySymbol = Exclude<SlotSymbol, "WILD" | "SCAT">;
export const PAY_SYMBOLS: readonly PaySymbol[] = SYMBOLS.filter(
  (s): s is PaySymbol => s !== "WILD" && s !== "SCAT",
);

export const REELS = 5;
export const ROWS = 3;
export const BASE_BET = 25; // coins per spin at bet level 1
export const BET_LEVELS: readonly number[] = [1, 2, 5, 10, 20];
export const MAX_WIN = 500_000; // coins per game round (base + feature)
export const MAX_WIN_X = 1000; // × total bet; 1000 × 500 = MAX_WIN so the cap is 1000× at every level
export const MAX_RETRIGGERS = 3;
export const MAX_FREE_SPINS = 100;
export const DEFAULT_FEATURE_OPTION = "ruby";
export const CLIENT_SEED_RE = /^[A-Za-z0-9_-]{1,64}$/;

// Coins per way at bet level 1 (25 coins), [3, 4, 5 of a kind]. 0 = no pay.
export const PAYTABLE: Readonly<Record<PaySymbol, readonly [number, number, number]>> = {
  LION: [60, 200, 800],
  CRANE: [40, 125, 400],
  LANTERN: [30, 100, 250],
  LOTUS: [25, 60, 200],
  PEONY_FAN: [20, 50, 150],
  A: [10, 30, 125],
  K: [10, 30, 125],
  Q: [10, 25, 100],
  J: [5, 25, 75],
  "10": [0, 25, 60],
  "9": [0, 25, 60],
};

// Scatter pays × total bet, anywhere.
export const SCATTER_PAYS: Readonly<Record<number, number>> = { 3: 4, 4: 15, 5: 100 };
export const SCATTERS_TO_TRIGGER = 3;

const s = (csv: string): SlotSymbol[] => csv.split(",") as SlotSymbol[];
export const REEL_STRIPS: readonly (readonly SlotSymbol[])[] = [
  s("LANTERN,A,LION,LOTUS,K,Q,PEONY_FAN,CRANE,J,10,9,A,SCAT,K,LANTERN,Q,J,LOTUS,10,PEONY_FAN,9,A,LION,K,Q,CRANE,J,10,LANTERN,9,LOTUS,PEONY_FAN,A,K,Q,J,10,9"),
  s("WILD,LION,LOTUS,K,Q,PEONY_FAN,CRANE,J,A,10,LANTERN,9,SCAT,K,Q,J,LOTUS,WILD,10,PEONY_FAN,9,A,LION,K,Q,CRANE,J,10,LANTERN,9,LOTUS,PEONY_FAN,K,A,Q,J,10,9"),
  s("WILD,SCAT,LOTUS,K,Q,PEONY_FAN,CRANE,J,A,10,LANTERN,9,K,Q,J,LOTUS,WILD,10,LION,PEONY_FAN,9,SCAT,A,K,Q,CRANE,J,10,LANTERN,9,LOTUS,PEONY_FAN,K,A,Q,J,10,9"),
  s("WILD,A,LOTUS,K,Q,PEONY_FAN,CRANE,J,10,LANTERN,9,A,SCAT,K,Q,J,LOTUS,WILD,10,LION,PEONY_FAN,9,A,K,Q,CRANE,J,10,LANTERN,9,LOTUS,PEONY_FAN,A,K,Q,J,10,9"),
  s("LOTUS,K,Q,PEONY_FAN,CRANE,J,A,10,LANTERN,9,SCAT,K,Q,J,LOTUS,10,LION,PEONY_FAN,9,A,K,Q,CRANE,J,10,LANTERN,9,LOTUS,PEONY_FAN,K,A,Q,J,10,9"),
];

export type FeatureOptionId = "jade" | "ruby" | "gold" | "imperial";
export interface FeatureOption {
  id: FeatureOptionId;
  spins: number;
  multipliers: readonly number[]; // applied only to ways that use ≥1 WILD
  weights: readonly number[]; // integer draw weights, same order as multipliers
  rtp: number; // total game RTP % when this option is always chosen (incl. 1000× cap)
  volatility: "low" | "medium" | "high" | "very high";
}

export const FEATURE_OPTIONS: readonly FeatureOption[] = [
  { id: "jade", spins: 20, multipliers: [2], weights: [1], rtp: 95.499, volatility: "low" },
  { id: "ruby", spins: 15, multipliers: [2, 3, 4], weights: [5, 7, 4], rtp: 95.508, volatility: "medium" },
  { id: "gold", spins: 10, multipliers: [3, 5, 7], weights: [8, 7, 6], rtp: 95.489, volatility: "high" },
  { id: "imperial", spins: 5, multipliers: [8, 10, 12, 15], weights: [4, 2, 1, 2], rtp: 95.489, volatility: "very high" },
];

// Exact math constants (×bet per spin) from full enumeration — see slot2/result.md.
export const MATH = {
  cycle: 72_979_760,
  waysPureRtp: 0.18483747274586815,
  waysWildRtp: 0.5250371116594519,
  scatterRtp: 0.03306974426882193,
  baseRtp: 0.742944328674142,
  triggerCombos: 523_530,
  hitFrequency: 0.3112001190467055,
  ldwShareOfHits: 0.3391813594196019,
} as const;

export function featureOption(id: string): FeatureOption | undefined {
  return FEATURE_OPTIONS.find((o) => o.id === id);
}

export function generateClientSeed(): string {
  return randomBytes(16).toString("hex");
}

export function wagerFor(betLevel: number): number {
  return BASE_BET * betLevel;
}

export function roundCap(wager: number): number {
  return Math.min(MAX_WIN_X * wager, MAX_WIN);
}

const MAX_SAMPLE_ROUNDS = 64;

// Uniform integer in [0, n) by rejection sampling over HMAC digests.
export function hmacUniform(serverSeed: string, messagePrefix: string, n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 0xffffffff) throw new Error("hmacUniform: bad range");
  const limit = Math.floor(0x100000000 / n) * n;
  for (let round = 0; round < MAX_SAMPLE_ROUNDS; round++) {
    const d = createHmac("sha256", serverSeed).update(`${messagePrefix}:${round}`).digest();
    for (let i = 0; i < 8; i++) {
      const v = d.readUInt32BE(i * 4);
      if (v < limit) return v % n;
    }
  }
  throw new Error("hmacUniform: exhausted rejection rounds");
}

export function reelStop(serverSeed: string, clientSeed: string, nonce: number, reel: number): number {
  return hmacUniform(serverSeed, `${clientSeed}:${nonce}:reel:${reel}`, REEL_STRIPS[reel].length);
}

export function spinStops(serverSeed: string, clientSeed: string, nonce: number): number[] {
  return REEL_STRIPS.map((_, r) => reelStop(serverSeed, clientSeed, nonce, r));
}

export function drawMultiplier(serverSeed: string, clientSeed: string, nonce: number, option: FeatureOption): number {
  const total = option.weights.reduce((a, b) => a + b, 0);
  let u = hmacUniform(serverSeed, `${clientSeed}:${nonce}:mult`, total);
  for (let i = 0; i < option.weights.length; i++) {
    if (u < option.weights[i]) return option.multipliers[i];
    u -= option.weights[i];
  }
  throw new Error("drawMultiplier: unreachable");
}

export function gridFromStops(stops: readonly number[]): SlotSymbol[][] {
  const grid: SlotSymbol[][] = [];
  for (let row = 0; row < ROWS; row++) {
    grid.push(REEL_STRIPS.map((strip, r) => strip[(stops[r] + row) % strip.length]));
  }
  return grid;
}

export interface WayWin {
  symbol: PaySymbol;
  count: number; // reels matched left→right (3..5)
  ways: number; // total ways incl. wild substitution
  wildWays: number; // ways that use ≥1 WILD (multiplier applies to these only)
  multiplier: number; // multiplier applied to wildWays (1 in base game)
  payout: number; // coins
  positions: [number, number][]; // [reel, row]
}

export interface ScatterResult {
  count: number;
  payout: number; // coins
  positions: [number, number][];
}

export interface SpinEvaluation {
  wins: WayWin[];
  scatter: ScatterResult;
  waysWin: number;
  totalWin: number; // ways + scatter, coins (uncapped)
  anticipation: { fromReel: number } | null;
}

// Anticipation: first reel index k (1..4) such that ≥2 scatters are visible on
// reels 0..k-1 — reels k..4 get the slow/glow treatment. Derived only from the
// actual grid (outcome-driven, logged in the hand record).
export function anticipationFor(grid: readonly (readonly SlotSymbol[])[]): { fromReel: number } | null {
  let seen = 0;
  for (let r = 0; r < REELS - 1; r++) {
    for (let row = 0; row < ROWS; row++) if (grid[row][r] === "SCAT") seen++;
    if (seen >= 2) return { fromReel: r + 1 };
  }
  return null;
}

export function evaluateSpin(
  grid: readonly (readonly SlotSymbol[])[],
  betLevel: number,
  multiplier = 1,
): SpinEvaluation {
  const wager = wagerFor(betLevel);
  const wins: WayWin[] = [];
  let waysWin = 0;
  for (const sym of PAY_SYMBOLS) {
    let all = 1;
    let pure = 1;
    let count = 0;
    const positions: [number, number][] = [];
    for (let r = 0; r < REELS; r++) {
      let c = 0;
      let w = 0;
      const cells: [number, number][] = [];
      for (let row = 0; row < ROWS; row++) {
        const g = grid[row][r];
        if (g === sym) { c++; cells.push([r, row]); } else if (g === "WILD") { w++; cells.push([r, row]); }
      }
      if (c + w === 0) break;
      all *= c + w;
      pure *= c;
      count++;
      positions.push(...cells);
    }
    if (count < 3) continue;
    const pay = PAYTABLE[sym][count - 3];
    if (pay === 0) continue;
    const wildWays = all - pure;
    const payout = pay * betLevel * (pure + wildWays * multiplier);
    wins.push({ symbol: sym, count, ways: all, wildWays, multiplier: wildWays > 0 ? multiplier : 1, payout, positions });
    waysWin += payout;
  }
  const scatterPositions: [number, number][] = [];
  for (let r = 0; r < REELS; r++) for (let row = 0; row < ROWS; row++) if (grid[row][r] === "SCAT") scatterPositions.push([r, row]);
  const scatterCount = scatterPositions.length;
  const scatterPayout = (SCATTER_PAYS[scatterCount] ?? 0) * wager;
  return {
    wins,
    scatter: { count: scatterCount, payout: scatterPayout, positions: scatterPositions },
    waysWin,
    totalWin: waysWin + scatterPayout,
    anticipation: anticipationFor(grid),
  };
}

export interface SpinRecord extends SpinEvaluation {
  nonce: number;
  stops: number[];
  grid: SlotSymbol[][];
  multiplier?: number;
  retrigger?: boolean; // free spin that awarded extra spins
  retriggerDenied?: boolean; // 3+ scatters but retrigger cap reached
}

export interface BaseResolution {
  spin: SpinRecord;
  betLevel: number;
  wager: number;
  baseWin: number; // capped at roundCap (never binds: max base 273.2×)
  featureTriggered: boolean;
}

export function resolveBaseSpin(serverSeed: string, clientSeed: string, betLevel: number): BaseResolution {
  if (!BET_LEVELS.includes(betLevel)) throw new Error("invalid bet level");
  const nonce = 0;
  const stops = spinStops(serverSeed, clientSeed, nonce);
  const grid = gridFromStops(stops);
  const ev = evaluateSpin(grid, betLevel, 1);
  const wager = wagerFor(betLevel);
  return {
    spin: { nonce, stops, grid, ...ev },
    betLevel,
    wager,
    baseWin: Math.min(ev.totalWin, roundCap(wager)),
    featureTriggered: ev.scatter.count >= SCATTERS_TO_TRIGGER,
  };
}

export interface FeatureResolution {
  option: FeatureOptionId;
  spins: SpinRecord[];
  awarded: number; // total free spins awarded incl. retriggers
  retriggers: number;
  played: number;
  rawWin: number; // sum of free-spin wins, uncapped
  totalWin: number; // feature award after round cap (base + feature ≤ roundCap)
  capped: boolean;
}

export function resolveFeature(
  serverSeed: string,
  clientSeed: string,
  betLevel: number,
  optionId: string,
  baseWin: number,
): FeatureResolution {
  const option = featureOption(optionId);
  if (!option) throw new Error("invalid feature option");
  if (!BET_LEVELS.includes(betLevel)) throw new Error("invalid bet level");
  const spins: SpinRecord[] = [];
  let left = option.spins;
  let awarded = option.spins;
  let retriggers = 0;
  let rawWin = 0;
  let nonce = 0;
  while (left > 0) {
    left--;
    nonce++;
    const stops = spinStops(serverSeed, clientSeed, nonce);
    const grid = gridFromStops(stops);
    const multiplier = drawMultiplier(serverSeed, clientSeed, nonce, option);
    const ev = evaluateSpin(grid, betLevel, multiplier);
    const rec: SpinRecord = { nonce, stops, grid, multiplier, ...ev };
    if (ev.scatter.count >= SCATTERS_TO_TRIGGER) {
      if (retriggers < MAX_RETRIGGERS && awarded + option.spins <= MAX_FREE_SPINS) {
        retriggers++;
        awarded += option.spins;
        left += option.spins;
        rec.retrigger = true;
      } else {
        rec.retriggerDenied = true;
      }
    }
    rawWin += ev.totalWin;
    spins.push(rec);
  }
  const room = Math.max(0, roundCap(wagerFor(betLevel)) - baseWin);
  const totalWin = Math.min(rawWin, room);
  return { option: option.id, spins, awarded, retriggers, played: spins.length, rawWin, totalWin, capped: rawWin > room };
}

export function publicFeatureOptions(): Array<Pick<FeatureOption, "id" | "spins" | "multipliers" | "weights" | "rtp" | "volatility">> {
  return FEATURE_OPTIONS.map(({ id, spins, multipliers, weights, rtp, volatility }) => ({
    id, spins, multipliers: [...multipliers], weights: [...weights], rtp, volatility,
  }));
}

export function publicPaytable(): {
  gameType: string;
  mathVersion: string;
  baseBet: number;
  betLevels: number[];
  maxWin: number;
  maxWinX: number;
  paytable: Record<PaySymbol, readonly [number, number, number]>;
  scatterPays: Record<number, number>;
  stripLengths: number[];
  wildReels: number[];
  options: ReturnType<typeof publicFeatureOptions>;
  maxRetriggers: number;
  maxFreeSpins: number;
  rtpRange: [number, number];
} {
  const rtps = FEATURE_OPTIONS.map((o) => o.rtp);
  return {
    gameType: SLOTS_GAME_TYPE,
    mathVersion: SLOTS_MATH_VERSION,
    baseBet: BASE_BET,
    betLevels: [...BET_LEVELS],
    maxWin: MAX_WIN,
    maxWinX: MAX_WIN_X,
    paytable: { ...PAYTABLE },
    scatterPays: { ...SCATTER_PAYS },
    stripLengths: REEL_STRIPS.map((r) => r.length),
    wildReels: [1, 2, 3],
    options: publicFeatureOptions(),
    maxRetriggers: MAX_RETRIGGERS,
    maxFreeSpins: MAX_FREE_SPINS,
    rtpRange: [Math.min(...rtps), Math.max(...rtps)],
  };
}
