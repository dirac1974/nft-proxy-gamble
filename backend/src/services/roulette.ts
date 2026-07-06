import { createHmac, randomBytes } from "crypto";

// European single-zero roulette (37 pockets: 0–36), provably-fair.
//
// Provably fair: the winning number is a deterministic HMAC of the committed
// serverSeed (revealed after the spin) keyed over the clientSeed + nonce. The
// server publishes hashServerSeed(serverSeed) before the spin, so the player can
// verify after reveal that the number was fixed at commit time and not chosen
// after seeing the bets. (Same house-vs-player caveat as the rest of the
// platform until H-2 committed-client-entropy lands — the server still generates
// clientSeed unless the client supplies one; documented in the audit.)
//
// NOTE: this is a ONE-SHOT resolution (single number per session) and therefore
// does NOT need the multi-step seed chain. Do not reuse this pattern for
// multi-decision games (blackjack/craps) — see docs/FABLE_SECURITY_AUDIT.

export const ROULETTE_GAME_TYPE = "roulette-euro-1-0";
export const POCKETS = 37; // 0–36
export const MAX_BETS_PER_SPIN = 20;
export const MAX_TOTAL_WAGER = 1000; // coins per spin (bounds payout + balance risk)

export type RouletteBetType =
  | "straight"
  | "split"
  | "street"
  | "corner"
  | "line"
  | "dozen"
  | "column"
  | "red"
  | "black"
  | "odd"
  | "even"
  | "high"
  | "low";

export interface RouletteBet {
  type: RouletteBetType;
  amount: number;
  numbers?: number[]; // inside bets (straight/split/street/corner/line)
  value?: number; // dozen/column selector (1|2|3)
}

// Profit-to-stake ratio ("X:1"). Total returned on a win = amount * (ratio + 1).
export const PAYOUT_RATIOS: Record<RouletteBetType, number> = {
  straight: 35,
  split: 17,
  street: 11,
  corner: 8,
  line: 5,
  dozen: 2,
  column: 2,
  red: 1,
  black: 1,
  odd: 1,
  even: 1,
  high: 1,
  low: 1,
};

// Red pockets on a European wheel; everything 1–36 not red is black. 0 is green.
export const RED_NUMBERS: ReadonlySet<number> = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

// --- table geometry (numbers 1–36 laid out in 12 rows × 3 columns) ---
const rowOf = (n: number): number => Math.ceil(n / 3); // 1..12
const colOf = (n: number): number => ((n - 1) % 3) + 1; // 1..3
const groupKey = (nums: number[]): string => [...nums].sort((a, b) => a - b).join(",");

// Pre-compute every LEGAL inside-bet group so validation is a set membership
// test rather than fragile ad-hoc adjacency math.
const VALID_SPLITS = new Set<string>();
const VALID_STREETS = new Set<string>();
const VALID_CORNERS = new Set<string>();
const VALID_LINES = new Set<string>();

for (let n = 1; n <= 36; n++) {
  // horizontal split (n, n+1) within the same row
  if (colOf(n) < 3) VALID_SPLITS.add(groupKey([n, n + 1]));
  // vertical split (n, n+3)
  if (n + 3 <= 36) VALID_SPLITS.add(groupKey([n, n + 3]));
  // corner square with top-left n (not in last column, has a row below)
  if (colOf(n) < 3 && n + 3 <= 36) VALID_CORNERS.add(groupKey([n, n + 1, n + 3, n + 4]));
}
// zero-adjacent splits
for (const n of [1, 2, 3]) VALID_SPLITS.add(groupKey([0, n]));
// streets: each full row, plus the two zero-trios
for (let r = 1; r <= 12; r++) {
  const b = (r - 1) * 3;
  VALID_STREETS.add(groupKey([b + 1, b + 2, b + 3]));
}
VALID_STREETS.add(groupKey([0, 1, 2]));
VALID_STREETS.add(groupKey([0, 2, 3]));
// basket / first four (pays 8:1, treated as a corner)
VALID_CORNERS.add(groupKey([0, 1, 2, 3]));
// lines (double streets): two adjacent full rows
for (let r = 1; r <= 11; r++) {
  const b = (r - 1) * 3;
  VALID_LINES.add(groupKey([b + 1, b + 2, b + 3, b + 4, b + 5, b + 6]));
}

const COLUMN_SETS: Record<number, ReadonlySet<number>> = {
  1: new Set([1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]),
  2: new Set([2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35]),
  3: new Set([3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36]),
};

export function generateServerSeed(): string {
  return randomBytes(32).toString("hex");
}

export function generateClientSeed(): string {
  return randomBytes(16).toString("hex");
}

// Provably-fair winning pocket: HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`) mod 37.
// Modulo bias over a 256-bit digest against 37 is negligible (< 2^-250).
export function spinNumber(serverSeed: string, clientSeed: string, nonce: number): number {
  const digest = createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}`).digest("hex");
  return Number(BigInt("0x" + digest) % BigInt(POCKETS));
}

class BetError extends Error {}

// Compute the set of pockets a bet covers, throwing BetError if the bet is
// structurally invalid (wrong count, illegal group, out-of-range selector).
export function betCoverage(bet: RouletteBet): Set<number> {
  const { type } = bet;

  const requireNumbers = (len: number): number[] => {
    const nums = bet.numbers ?? [];
    if (nums.length !== len) throw new BetError(`${type} requires exactly ${len} number(s)`);
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 36)) {
      throw new BetError(`${type} numbers must be integers in 0..36`);
    }
    if (new Set(nums).size !== nums.length) throw new BetError(`${type} numbers must be distinct`);
    return nums;
  };

  const requireValue = (): number => {
    if (bet.value !== 1 && bet.value !== 2 && bet.value !== 3) {
      throw new BetError(`${type} requires value 1, 2, or 3`);
    }
    return bet.value;
  };

  switch (type) {
    case "straight": {
      const [n] = requireNumbers(1);
      return new Set([n]);
    }
    case "split": {
      const nums = requireNumbers(2);
      if (!VALID_SPLITS.has(groupKey(nums))) throw new BetError("Not an adjacent split");
      return new Set(nums);
    }
    case "street": {
      const nums = requireNumbers(3);
      if (!VALID_STREETS.has(groupKey(nums))) throw new BetError("Not a valid street");
      return new Set(nums);
    }
    case "corner": {
      const nums = requireNumbers(4);
      if (!VALID_CORNERS.has(groupKey(nums))) throw new BetError("Not a valid corner");
      return new Set(nums);
    }
    case "line": {
      const nums = requireNumbers(6);
      if (!VALID_LINES.has(groupKey(nums))) throw new BetError("Not a valid six-line");
      return new Set(nums);
    }
    case "dozen": {
      const v = requireValue();
      const start = (v - 1) * 12 + 1;
      return new Set(Array.from({ length: 12 }, (_, i) => start + i));
    }
    case "column":
      return new Set(COLUMN_SETS[requireValue()]);
    case "red":
      return new Set(RED_NUMBERS);
    case "black":
      return new Set(Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => !RED_NUMBERS.has(n)));
    case "odd":
      return new Set(Array.from({ length: 18 }, (_, i) => i * 2 + 1)); // 1,3,..35
    case "even":
      return new Set(Array.from({ length: 18 }, (_, i) => i * 2 + 2)); // 2,4,..36
    case "high":
      return new Set(Array.from({ length: 18 }, (_, i) => i + 19)); // 19..36
    case "low":
      return new Set(Array.from({ length: 18 }, (_, i) => i + 1)); // 1..18
    default:
      throw new BetError(`Unknown bet type: ${String(type)}`);
  }
}

export interface BetResult {
  type: RouletteBetType;
  amount: number;
  numbers?: number[];
  value?: number;
  won: boolean;
  payout: number; // total returned (stake + profit); 0 on loss
}

export interface SpinResolution {
  winningNumber: number;
  color: "red" | "black" | "green";
  totalWagered: number;
  totalReturn: number; // sum of all bet payouts
  netProfit: number; // totalReturn - totalWagered
  results: BetResult[];
}

export function pocketColor(n: number): "red" | "black" | "green" {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

// Validate the full set of bets and resolve them against a winning number.
// Throws BetError on any structural/limit violation (mapped to HTTP 400 upstream).
export function resolveSpin(winningNumber: number, bets: RouletteBet[]): SpinResolution {
  if (!Number.isInteger(winningNumber) || winningNumber < 0 || winningNumber > 36) {
    throw new BetError("winningNumber out of range");
  }
  if (bets.length === 0) throw new BetError("At least one bet is required");
  if (bets.length > MAX_BETS_PER_SPIN) throw new BetError(`At most ${MAX_BETS_PER_SPIN} bets per spin`);

  let totalWagered = 0;
  const results: BetResult[] = bets.map((bet) => {
    if (!Number.isInteger(bet.amount) || bet.amount < 1) {
      throw new BetError("Each bet amount must be a positive integer");
    }
    const coverage = betCoverage(bet); // validates structure
    totalWagered += bet.amount;
    const won = coverage.has(winningNumber);
    const payout = won ? bet.amount * (PAYOUT_RATIOS[bet.type] + 1) : 0;
    return {
      type: bet.type,
      amount: bet.amount,
      numbers: bet.numbers,
      value: bet.value,
      won,
      payout,
    };
  });

  if (totalWagered > MAX_TOTAL_WAGER) {
    throw new BetError(`Total wager exceeds ${MAX_TOTAL_WAGER} coins`);
  }

  const totalReturn = results.reduce((s, r) => s + r.payout, 0);
  return {
    winningNumber,
    color: pocketColor(winningNumber),
    totalWagered,
    totalReturn,
    netProfit: totalReturn - totalWagered,
    results,
  };
}

export { BetError };
