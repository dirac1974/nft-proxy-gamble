// Lion Lantern Night — client-side game constants + pure presentation logic.
// v1 math — pending Stats sign-off. Do not change pays, strips, bet levels,
// options or tier thresholds without Stats sign-off + walk-forward validation note.
//
// SYNC: STRIPS / PAYS / SCATTER_PAYS / BET_LEVELS / FEATURE_OPTIONS mirror
// backend/src/services/slots.ts (math v2 retune, scratchpad slot2/result.md, total RTP
// 95.489–95.508%). The UI prefers GET /slots/paytable at runtime; these constants are
// the offline fallback and the source for client fairness re-derivation.

export const SYMBOLS = [
  "WILD",
  "SCAT",
  "LION",
  "CRANE",
  "LANTERN",
  "LOTUS",
  "PEONY_FAN",
  "A",
  "K",
  "Q",
  "J",
  "10",
  "9",
] as const;
export type SlotSymbolId = (typeof SYMBOLS)[number];

export const REELS = 5;
export const ROWS = 3;
export const COINS_PER_LEVEL = 25;

// SYNC: backend BET_LEVELS (v2: {1,2,5,10,20} × 25 coins).
export const BET_LEVELS: readonly number[] = [1, 2, 5, 10, 20];
export const MAX_WIN = 500_000;
// Jurisdiction flag (v2 GLOBAL): true disables turbo/autoplay and enforces a 2.5s min cycle.
export { RESTRICTED_PLAY } from "@/config/compliance";
import { RESTRICTED_PLAY } from "@/config/compliance";

// SYNC: backend STRIPS. stops[r] = strip index shown in the TOP row; rows go
// top→bottom as strip[stop], strip[stop+1], strip[stop+2] (mod length).
export const STRIPS: readonly (readonly SlotSymbolId[])[] = [
  ["LANTERN","A","LION","LOTUS","K","Q","PEONY_FAN","CRANE","J","10","9","A","SCAT","K","LANTERN","Q","J","LOTUS","10","PEONY_FAN","9","A","LION","K","Q","CRANE","J","10","LANTERN","9","LOTUS","PEONY_FAN","A","K","Q","J","10","9"],
  ["WILD","LION","LOTUS","K","Q","PEONY_FAN","CRANE","J","A","10","LANTERN","9","SCAT","K","Q","J","LOTUS","WILD","10","PEONY_FAN","9","A","LION","K","Q","CRANE","J","10","LANTERN","9","LOTUS","PEONY_FAN","K","A","Q","J","10","9"],
  ["WILD","SCAT","LOTUS","K","Q","PEONY_FAN","CRANE","J","A","10","LANTERN","9","K","Q","J","LOTUS","WILD","10","LION","PEONY_FAN","9","SCAT","A","K","Q","CRANE","J","10","LANTERN","9","LOTUS","PEONY_FAN","K","A","Q","J","10","9"],
  ["WILD","A","LOTUS","K","Q","PEONY_FAN","CRANE","J","10","LANTERN","9","A","SCAT","K","Q","J","LOTUS","WILD","10","LION","PEONY_FAN","9","A","K","Q","CRANE","J","10","LANTERN","9","LOTUS","PEONY_FAN","A","K","Q","J","10","9"],
  ["LOTUS","K","Q","PEONY_FAN","CRANE","J","A","10","LANTERN","9","SCAT","K","Q","J","LOTUS","10","LION","PEONY_FAN","9","A","K","Q","CRANE","J","10","LANTERN","9","LOTUS","PEONY_FAN","K","A","Q","J","10","9"],
];

// SYNC: backend PAYS — coins per way at bet level 1 (25-coin bet), [3oak, 4oak, 5oak].
export const PAYS: Readonly<Partial<Record<SlotSymbolId, readonly [number, number, number]>>> = {
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
// SYNC: scatter pays × total bet by count.
export const SCATTER_PAYS: Readonly<Record<number, number>> = { 3: 4, 4: 15, 5: 100 };

export type FeatureOptionId = "jade" | "ruby" | "gold" | "imperial";
export interface FeatureOption {
  id: FeatureOptionId;
  spins: number;
  multipliers: number[];
  /** Integer draw weights, same order as multipliers (uniform when absent). */
  weights: number[];
  rtp: number;
  volatility: string;
}
// SYNC: backend FEATURE_OPTIONS (weighted multiplier multisets; option RTP spread 0.018 pt).
export const FEATURE_OPTIONS: readonly FeatureOption[] = [
  { id: "jade", spins: 20, multipliers: [2], weights: [1], rtp: 95.499, volatility: "Low" },
  { id: "ruby", spins: 15, multipliers: [2, 3, 4], weights: [5, 7, 4], rtp: 95.508, volatility: "Medium" },
  { id: "gold", spins: 10, multipliers: [3, 5, 7], weights: [8, 7, 6], rtp: 95.489, volatility: "High" },
  { id: "imperial", spins: 5, multipliers: [8, 10, 12, 15], weights: [4, 2, 1, 2], rtp: 95.489, volatility: "Very high" },
];

/** "×2 31% · ×3 44% · ×4 25%" — disclosed multiplier distribution. */
export function multiplierOdds(o: Pick<FeatureOption, "multipliers" | "weights">): string {
  const w = o.weights.length === o.multipliers.length ? o.weights : o.multipliers.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  return o.multipliers.map((m, i) => `×${m} ${Math.round((w[i]! / total) * 100)}%`).join(" · ");
}
export const OPTION_NAMES: Record<FeatureOptionId, string> = {
  jade: "Jade",
  ruby: "Ruby",
  gold: "Gold",
  imperial: "Imperial",
};
export const MAX_RETRIGGERS = 3;
export const MAX_FREE_SPINS = 100;

export const SYMBOL_NAMES: Record<SlotSymbolId, string> = {
  WILD: "Wild gate",
  SCAT: "Moon gong",
  LION: "Lion mask",
  CRANE: "Crane",
  LANTERN: "Lantern",
  LOTUS: "Lotus",
  PEONY_FAN: "Peony fan",
  A: "Ace",
  K: "King",
  Q: "Queen",
  J: "Jack",
  "10": "Ten",
  "9": "Nine",
};
const RANK: Record<SlotSymbolId, number> = Object.fromEntries(SYMBOLS.map((s, i) => [s, i])) as Record<SlotSymbolId, number>;

export const totalBet = (level: number): number => level * COINS_PER_LEVEL;
export const mod = (n: number, m: number): number => ((n % m) + m) % m;

// ---------------------------------------------------------------------------
// Grid / stops
// ---------------------------------------------------------------------------

export type Grid = SlotSymbolId[][]; // grid[row][reel], rows top→bottom

export function reelWindow(strip: readonly SlotSymbolId[], stop: number): SlotSymbolId[] {
  return [0, 1, 2].map((k) => strip[mod(stop + k, strip.length)]!);
}

export function gridFromStops(stops: readonly number[], strips: readonly (readonly SlotSymbolId[])[] = STRIPS): Grid {
  const cols = stops.map((s, r) => reelWindow(strips[r]!, s));
  return [0, 1, 2].map((row) => cols.map((c) => c[row]!));
}

/** Accepts grid[row][reel] (3×5) or grid[reel][row] (5×3) and returns row-major. */
export function normalizeGrid(g: string[][]): Grid {
  if (g.length === REELS && g[0]?.length === ROWS) {
    return [0, 1, 2].map((row) => g.map((col) => col[row] as SlotSymbolId));
  }
  return g.map((row) => row.map((s) => s as SlotSymbolId));
}

export function scattersOnReel(grid: Grid, reel: number): number {
  return grid.reduce((n, row) => n + (row[reel] === "SCAT" ? 1 : 0), 0);
}

/**
 * First reel that gets anticipation: when ≥2 scatters are already visible on the
 * stopped reels to its left. Outcome-driven, derived from the real grid.
 */
export function anticipationFromReel(grid: Grid): number | null {
  let seen = 0;
  for (let r = 0; r < REELS - 1; r++) {
    seen += scattersOnReel(grid, r);
    if (seen >= 2) return r + 1;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reel timing + landing math
// ---------------------------------------------------------------------------

export const SPIN_SPEED = 30; // symbols per second
export const OVERSHOOT_PX = 8;
export const OVERSHOOT_MS = 90;
export const ANTICIPATION_MS = 600; // TOTAL extra
export const LAND_MS = 260; // decel leg before the overshoot settle

export interface ScheduleOpts {
  turbo: boolean;
  reduceMotion: boolean;
  anticipationFrom: number | null;
  /** ms already elapsed since the reels started when the schedule is applied. */
  elapsed?: number;
}

/** Absolute ms (from spin start) at which each reel is fully stopped. */
export function stopSchedule({ turbo, reduceMotion, anticipationFrom, elapsed = 0 }: ScheduleOpts): number[] {
  if (reduceMotion) return Array.from({ length: REELS }, () => Math.max(elapsed, 300));
  const base = turbo ? 250 : 600;
  const step = turbo ? 80 : 200;
  // Response arrived late: keep the stagger, start it a beat after the response.
  const offset = Math.max(0, elapsed + (turbo ? 120 : 250) - base);
  return Array.from({ length: REELS }, (_, i) => {
    const extra = anticipationFrom !== null && i >= anticipationFrom ? ANTICIPATION_MS : 0;
    return base + step * i + offset + extra;
  });
}

/**
 * Landing target in strip units for a reel whose top-row position `current`
 * moves DOWNWARD (decreasing). Returns the largest t ≤ current − minTravel with
 * t ≡ stop (mod L), so the column lands EXACTLY on the server stop.
 */
export function landingTarget(current: number, stop: number, length: number, minTravel: number): number {
  const limit = current - minTravel;
  return limit - mod(limit - stop, length);
}

/** translateY (px) of the strip column for a top-row position p. */
export function columnOffset(p: number, length: number, cell: number): number {
  return -mod(p, length) * cell;
}

// ---------------------------------------------------------------------------
// Outcome classification (net-based, LDW-safe)
// ---------------------------------------------------------------------------

export type Outcome = "loss" | "ldw" | "push" | "win";

export function classifyOutcome(totalReturn: number, wager: number): Outcome {
  if (totalReturn <= 0) return "loss";
  if (totalReturn < wager) return "ldw";
  if (totalReturn === wager) return "push";
  return "win";
}

const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

export interface BannerCopy {
  title: string;
  detail: string;
  celebrate: boolean;
}

export function outcomeCopy(totalReturn: number, wager: number): BannerCopy {
  const o = classifyOutcome(totalReturn, wager);
  const net = totalReturn - wager;
  switch (o) {
    case "win":
      return { title: `WIN ${fmt(totalReturn)}`, detail: `Net +${fmt(net)}`, celebrate: true };
    case "push":
      return { title: "Bet returned", detail: "Net 0", celebrate: false };
    case "ldw":
      return { title: `Returned ${fmt(totalReturn)} of ${fmt(wager)}`, detail: `Net −${fmt(-net)}`, celebrate: false };
    default:
      return { title: "No win", detail: `Bet ${fmt(wager)}`, celebrate: false };
  }
}

export type BigTier = "big" | "mega" | "epic";
export const TIER_X = { big: 15, mega: 40, epic: 100 } as const;

/** Slot plaque tier by NET multiple of the wager. */
export function bigWinTier(net: number, wager: number): BigTier | null {
  if (net <= 0 || wager <= 0) return null;
  const x = net / wager;
  if (x >= TIER_X.epic) return "epic";
  if (x >= TIER_X.mega) return "mega";
  if (x >= TIER_X.big) return "big";
  return null;
}

/** Count-up duration (ms) by net multiple; 0 = no count-up (LDW/push/loss). */
export function countUpMs(net: number, wager: number): number {
  if (net <= 0 || wager <= 0) return 0;
  const x = net / wager;
  if (x >= TIER_X.epic) return 8000;
  if (x >= TIER_X.mega) return 5000;
  if (x >= TIER_X.big) return 3000;
  if (x >= 5) return 1200;
  return 600;
}

export type SlotWinSound = "slot_win_small" | "slot_win_medium" | "slot_win_big";
export function winSoundKey(net: number, wager: number): SlotWinSound | null {
  if (net <= 0 || wager <= 0) return null;
  const x = net / wager;
  if (x >= TIER_X.big) return "slot_win_big";
  if (x >= 5) return "slot_win_medium";
  return "slot_win_small";
}

// ---------------------------------------------------------------------------
// Win cycling
// ---------------------------------------------------------------------------

export type Pos = [number, number]; // [reel, row]

export interface WayWin {
  symbol: SlotSymbolId;
  count: number;
  ways: number;
  payout: number;
  positions: Pos[];
}
export interface ScatterResult {
  count: number;
  payout: number;
  positions: Pos[];
}

export interface CycleEntry {
  key: string;
  symbol: SlotSymbolId;
  label: string;
  count: number;
  ways: number;
  payout: number;
  positions: Pos[];
}

export const CYCLE_MS = 1200;
export const MAX_CYCLE = 6;

/** Per-symbol cycle order: payout desc, then symbol rank; scatter joins as a normal entry. Max 6. */
export function winCycle(wins: readonly WayWin[], scatter: ScatterResult | null): CycleEntry[] {
  const list: CycleEntry[] = wins
    .filter((w) => w.payout > 0)
    .map((w) => ({
      key: `${w.symbol}-${w.count}`,
      symbol: w.symbol,
      label: `${SYMBOL_NAMES[w.symbol].toUpperCase()} ×${w.count} · ${w.ways} ${w.ways === 1 ? "WAY" : "WAYS"} · ${fmt(w.payout)}`,
      count: w.count,
      ways: w.ways,
      payout: w.payout,
      positions: w.positions,
    }));
  if (scatter && scatter.payout > 0) {
    list.push({
      key: "SCAT",
      symbol: "SCAT",
      label: `MOON GONG ×${scatter.count} · SCATTER · ${fmt(scatter.payout)}`,
      count: scatter.count,
      ways: 1,
      payout: scatter.payout,
      positions: scatter.positions,
    });
  }
  list.sort((a, b) => b.payout - a.payout || RANK[a.symbol] - RANK[b.symbol]);
  return list.slice(0, MAX_CYCLE);
}

export function posKey(reel: number, row: number): string {
  return `${reel}:${row}`;
}

export function winningCells(entries: readonly { positions: Pos[] }[]): Set<string> {
  const s = new Set<string>();
  for (const e of entries) for (const [reel, row] of e.positions) s.add(posKey(reel, row));
  return s;
}

// ---------------------------------------------------------------------------
// VoiceOver
// ---------------------------------------------------------------------------

export function spinSummary(grid: Grid, wins: readonly WayWin[], scatter: ScatterResult | null, totalReturn: number, wager: number): string {
  const rows = grid.map((row, i) => `Row ${i + 1}: ${row.map((s) => SYMBOL_NAMES[s]).join(", ")}.`);
  const list = winCycle(wins, scatter).map((e) =>
    e.symbol === "SCAT"
      ? `${e.count} moon gongs, pays ${fmt(e.payout)}.`
      : `${SYMBOL_NAMES[e.symbol]} ${e.count} of a kind, ${e.ways} ${e.ways === 1 ? "way" : "ways"}, pays ${fmt(e.payout)}.`,
  );
  if (wager <= 0) return [...rows, ...list, totalReturn > 0 ? `Free game wins ${fmt(totalReturn)}.` : "Free game, no win."].join(" ");
  const c = outcomeCopy(totalReturn, wager);
  return [...rows, ...list, `${c.title}. ${c.detail}.`].join(" ");
}

export function optionLabel(o: Pick<FeatureOption, "id" | "spins" | "multipliers">): string {
  const m = o.multipliers.length === 1 ? `×${o.multipliers[0]}` : `×${o.multipliers[0]}–${o.multipliers[o.multipliers.length - 1]}`;
  return `${OPTION_NAMES[o.id]} · ${o.spins} games · ${m}`;
}
