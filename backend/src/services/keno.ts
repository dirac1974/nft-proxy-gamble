import { createHmac, randomBytes } from "crypto";

// Midnight Keno / Midnight Keno ×4 — provably-fair 80-ball keno, 20 drawn.
// Spec: keno v2 BINDING decisions (GLOBAL + KENO) over keno-spec-v1.
// Paytable/bet ladder/caps are "v1 math — pending Stats sign-off". Do not change
// any multiplier, bet level or cap without Stats sign-off + walk-forward note.
//
// One-shot per session (roulette pattern): a single 20-ball draw at nonce 0,
// derived from the committed serverSeed, revealed in the /keno/play response.

export const KENO_GAME_TYPE = "keno-80-20-1-0";
export const KENO4_GAME_TYPE = "keno4-80-20-1-0";
export const KENO_PAYTABLE_VERSION = "keno-v1-2026-10";

export type KenoMode = "single" | "quad";

export const BOARD_SIZE = 80;
export const DRAW_COUNT = 20;
export const MIN_SPOTS = 1;
export const MAX_SPOTS = 10;
export const BET_LEVELS: readonly number[] = [10, 20, 50];
export const MAX_CARDS: Record<KenoMode, number> = { single: 1, quad: 4 };
export const MAX_TOTAL_WAGER = 200; // quad 4 × 50
export const MAX_WIN = 500_000; // coins per game round (GLOBAL)
export const CARD_CAP_MULTIPLIER = 10_000; // per-card cap = 10000 × bet (never binds with table)

export const GAME_TYPE_BY_MODE: Record<KenoMode, string> = {
  single: KENO_GAME_TYPE,
  quad: KENO4_GAME_TYPE,
};

export function modeFromGameType(gameType: string): KenoMode | null {
  if (gameType === KENO_GAME_TYPE) return "single";
  if (gameType === KENO4_GAME_TYPE) return "quad";
  return null;
}

// Returns per 1 unit staked (incl. stake), stored as INTEGER TENTHS (3.7× → 37).
// Missing catch = 0. Exactly the v1 table (RTP 92.50–94.35%).
export const PAYTABLE_X10: Readonly<Record<number, Readonly<Record<number, number>>>> = {
  1: { 1: 37 },
  2: { 2: 155 },
  3: { 2: 20, 3: 480 },
  4: { 2: 10, 3: 50, 4: 1650 },
  5: { 3: 30, 4: 200, 5: 6900 },
  6: { 3: 20, 4: 70, 5: 750, 6: 19000 },
  7: { 3: 10, 4: 40, 5: 200, 6: 3000, 7: 65000 },
  8: { 4: 20, 5: 150, 6: 1000, 7: 13500, 8: 100000 },
  9: { 4: 10, 5: 60, 6: 470, 7: 3750, 8: 40000, 9: 100000 },
  10: { 5: 40, 6: 250, 7: 1750, 8: 10000, 9: 40000, 10: 100000 },
};

export function multiplierX10(spots: number, catches: number): number {
  return PAYTABLE_X10[spots]?.[catches] ?? 0;
}

// ---------------------------------------------------------------------------
// Exact RTP (hypergeometric, BigInt rationals)
// ---------------------------------------------------------------------------

export function binom(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n;
  let r = 1n;
  const kk = Math.min(k, n - k);
  for (let i = 1; i <= kk; i++) r = (r * BigInt(n - kk + i)) / BigInt(i);
  return r;
}

export interface Fraction {
  num: bigint;
  den: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

// P(catch k | s spots) = C(s,k)·C(80−s, 20−k) / C(80,20)
export function catchProbability(spots: number, catches: number): Fraction {
  const num = binom(spots, catches) * binom(BOARD_SIZE - spots, DRAW_COUNT - catches);
  const den = binom(BOARD_SIZE, DRAW_COUNT);
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

// Exact expected return per unit staked for a spot count, as a reduced fraction.
export function rtpExact(spots: number): Fraction {
  let num = 0n;
  for (let k = 0; k <= spots; k++) {
    num += binom(spots, k) * binom(BOARD_SIZE - spots, DRAW_COUNT - k) * BigInt(multiplierX10(spots, k));
  }
  const den = binom(BOARD_SIZE, DRAW_COUNT) * 10n;
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

// RTP percent rounded to `decimals` places (exact rational rounding, half-up).
export function rtpPercent(spots: number, decimals = 3): number {
  const { num, den } = rtpExact(spots);
  const scale = 10n ** BigInt(decimals + 2);
  const scaled = (num * scale * 2n + den) / (den * 2n);
  return Number(scaled) / 10 ** decimals;
}

export const RTP_BY_SPOTS: Readonly<Record<number, number>> = Object.fromEntries(
  Array.from({ length: MAX_SPOTS }, (_, i) => [i + 1, rtpPercent(i + 1)]),
);

// ---------------------------------------------------------------------------
// Provably-fair draw
// ---------------------------------------------------------------------------

export function generateClientSeed(): string {
  return randomBytes(16).toString("hex");
}

export const CLIENT_SEED_RE = /^[A-Za-z0-9_-]{1,64}$/;

// Domain-separated message for byte block `counter`.
export function kenoMessage(clientSeed: string, nonce: number, counter: number): string {
  return `${clientSeed}:${nonce}:keno:${counter}`;
}

// Big-endian uint32 stream over HMAC-SHA256(serverSeed, message(counter)), counter = 0,1,…
export function hmacUint32Stream(serverSeed: string, message: (counter: number) => string): () => number {
  let counter = 0;
  let buf: Buffer = Buffer.alloc(0);
  let pos = 0;
  return () => {
    if (pos + 4 > buf.length) {
      buf = createHmac("sha256", serverSeed).update(message(counter)).digest();
      counter++;
      pos = 0;
    }
    const v = buf.readUInt32BE(pos);
    pos += 4;
    return v;
  };
}

// Partial Fisher–Yates over [1..80] for 20 picks with rejection sampling
// (reject v ≥ floor(2^32/n)·n) → unbiased; result is in draw order.
export function partialFisherYates(nextUint32: () => number): number[] {
  const pool = Array.from({ length: BOARD_SIZE }, (_, i) => i + 1);
  const drawn: number[] = [];
  for (let i = 0; i < DRAW_COUNT; i++) {
    const n = BOARD_SIZE - i;
    const limit = Math.floor(0x1_0000_0000 / n) * n;
    let v = nextUint32();
    while (v >= limit) v = nextUint32();
    const j = i + (v % n);
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
    drawn.push(pool[i]);
  }
  return drawn;
}

export function drawNumbers(serverSeed: string, clientSeed: string, nonce: number): number[] {
  return partialFisherYates(hmacUint32Stream(serverSeed, (c) => kenoMessage(clientSeed, nonce, c)));
}

// ---------------------------------------------------------------------------
// Validation + settlement (pure)
// ---------------------------------------------------------------------------

export class KenoError extends Error {}

export interface KenoCardInput {
  spots: number[];
  bet: number;
}

export interface KenoCardResult {
  cardIndex: number;
  spots: number[]; // sorted ascending
  hits: number[]; // caught spots, in draw order
  catches: number;
  multiplier: number; // return incl. stake (e.g. 3.7)
  multiplierX10: number;
  bet: number;
  payout: number; // integer coins after per-card + game caps
}

export interface KenoResolution {
  mode: KenoMode;
  drawn: number[];
  results: KenoCardResult[];
  totalWagered: number;
  totalReturn: number;
  netProfit: number;
  capped: boolean;
}

export function validateCards(cards: KenoCardInput[], mode: KenoMode): void {
  if (!Array.isArray(cards)) throw new KenoError("cards must be an array");
  if (mode === "single" && cards.length !== 1) throw new KenoError("Single keno requires exactly 1 card");
  if (mode === "quad" && (cards.length < 1 || cards.length > MAX_CARDS.quad)) {
    throw new KenoError("Keno ×4 requires 1–4 cards");
  }
  const keys = new Set<string>();
  let totalWagered = 0;
  const bet0 = cards[0].bet;
  cards.forEach((card, idx) => {
    const { spots, bet } = card;
    if (!Number.isInteger(bet) || !BET_LEVELS.includes(bet)) {
      throw new KenoError(`Card ${idx}: bet must be one of ${BET_LEVELS.join(", ")}`);
    }
    if (bet !== bet0) throw new KenoError("All cards must use the same bet");
    if (!Array.isArray(spots) || spots.length < MIN_SPOTS || spots.length > MAX_SPOTS) {
      throw new KenoError(`Card ${idx}: pick ${MIN_SPOTS}–${MAX_SPOTS} spots`);
    }
    if (spots.some((n) => !Number.isInteger(n) || n < 1 || n > BOARD_SIZE)) {
      throw new KenoError(`Card ${idx}: spots must be integers in 1..${BOARD_SIZE}`);
    }
    if (new Set(spots).size !== spots.length) throw new KenoError(`Card ${idx}: duplicate spots`);
    const key = [...spots].sort((a, b) => a - b).join(",");
    if (keys.has(key)) throw new KenoError(`Card ${idx}: identical to another card`);
    keys.add(key);
    totalWagered += bet;
  });
  if (totalWagered > MAX_TOTAL_WAGER) throw new KenoError(`Total wager exceeds ${MAX_TOTAL_WAGER} coins`);
}

export function validateDrawn(drawn: number[]): void {
  if (
    drawn.length !== DRAW_COUNT ||
    new Set(drawn).size !== DRAW_COUNT ||
    drawn.some((n) => !Number.isInteger(n) || n < 1 || n > BOARD_SIZE)
  ) {
    throw new KenoError("drawn must be 20 distinct integers in 1..80");
  }
}

// Throws KenoError on any validation failure (→ HTTP 400 upstream).
// Caps: per card min(bet·mult, 10000·bet); game total ≤ MAX_WIN, applied by
// trimming card payouts in card order so Σ payouts === totalReturn.
export function resolveKeno(drawn: number[], cards: KenoCardInput[], mode: KenoMode): KenoResolution {
  validateDrawn(drawn);
  validateCards(cards, mode);

  let capped = false;
  let remaining = MAX_WIN;
  let totalWagered = 0;
  const results: KenoCardResult[] = cards.map((card, cardIndex) => {
    const spots = [...card.spots].sort((a, b) => a - b);
    const spotSet = new Set(spots);
    const hits = drawn.filter((n) => spotSet.has(n));
    const catches = hits.length;
    const m10 = multiplierX10(spots.length, catches);
    const raw = card.bet * m10;
    if (raw % 10 !== 0) throw new KenoError("Non-integer payout (bet must be a multiple of 10)");
    let payout = raw / 10;
    if (payout > CARD_CAP_MULTIPLIER * card.bet) {
      payout = CARD_CAP_MULTIPLIER * card.bet;
      capped = true;
    }
    if (payout > remaining) {
      payout = remaining;
      capped = true;
    }
    remaining -= payout;
    totalWagered += card.bet;
    return {
      cardIndex,
      spots,
      hits,
      catches,
      multiplier: m10 / 10,
      multiplierX10: m10,
      bet: card.bet,
      payout,
    };
  });

  const totalReturn = results.reduce((s, r) => s + r.payout, 0);
  return {
    mode,
    drawn: [...drawn],
    results,
    totalWagered,
    totalReturn,
    netProfit: totalReturn - totalWagered,
    capped,
  };
}

export function publicPaytable(): Record<number, Record<number, number>> {
  const out: Record<number, Record<number, number>> = {};
  for (const [s, row] of Object.entries(PAYTABLE_X10)) {
    out[Number(s)] = Object.fromEntries(Object.entries(row).map(([k, v]) => [Number(k), v / 10]));
  }
  return out;
}
