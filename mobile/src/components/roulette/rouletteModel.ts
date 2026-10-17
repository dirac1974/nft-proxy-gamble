import type { RouletteBet, RouletteBetType } from "@/services/api";

// Client-side mirror of backend/src/services/roulette.ts for DISPLAY ONLY
// (chip placement, highlighting, labels). The server is the sole authority on
// validation and payouts — nothing here changes game math.

export const WHEEL_ORDER: readonly number[] = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18,
  29, 7, 28, 12, 35, 3, 26,
];
export const POCKET_COUNT = 37;
export const POCKET_DEG = 360 / POCKET_COUNT;

export const RED_NUMBERS: ReadonlySet<number> = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type PocketColor = "red" | "black" | "green";

export function pocketColor(n: number): PocketColor {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

export const MAX_BETS_PER_SPIN = 20;
export const MAX_TOTAL_WAGER = 1000;
export const CHIP_VALUES = [1, 5, 25, 100] as const;

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

// ---------------------------------------------------------------------------
// Bet spots
// ---------------------------------------------------------------------------

export interface BetSpot {
  key: string;
  type: RouletteBetType;
  numbers?: number[];
  value?: number;
}

export interface PlacedBet extends BetSpot {
  amount: number;
}

export const rowOf = (n: number): number => Math.ceil(n / 3);
export const colOf = (n: number): number => ((n - 1) % 3) + 1;

function inside(type: RouletteBetType, nums: number[]): BetSpot {
  const numbers = [...nums].sort((a, b) => a - b);
  return { key: `${type}:${numbers.join(",")}`, type, numbers };
}

export const spots = {
  straight: (n: number) => inside("straight", [n]),
  split: (a: number, b: number) => inside("split", [a, b]),
  street: (row: number) => inside("street", [row * 3 - 2, row * 3 - 1, row * 3]),
  zeroStreet: (a: number, b: number) => inside("street", [0, a, b]),
  corner: (topLeft: number) => inside("corner", [topLeft, topLeft + 1, topLeft + 3, topLeft + 4]),
  firstFour: () => inside("corner", [0, 1, 2, 3]),
  line: (row: number) => inside("line", Array.from({ length: 6 }, (_, i) => row * 3 - 2 + i)),
  dozen: (v: 1 | 2 | 3): BetSpot => ({ key: `dozen:${v}`, type: "dozen", value: v }),
  column: (v: 1 | 2 | 3): BetSpot => ({ key: `column:${v}`, type: "column", value: v }),
  outside: (type: "red" | "black" | "odd" | "even" | "low" | "high"): BetSpot => ({ key: type, type }),
};

export function toApiBet(b: PlacedBet): RouletteBet {
  const bet: RouletteBet = { type: b.type, amount: b.amount };
  if (b.numbers) bet.numbers = b.numbers;
  if (b.value !== undefined) bet.value = b.value;
  return bet;
}

export function coverage(spot: BetSpot): number[] {
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  switch (spot.type) {
    case "dozen":
      return range((spot.value! - 1) * 12 + 1, spot.value! * 12);
    case "column":
      return range(1, 36).filter((n) => colOf(n) === spot.value);
    case "red":
      return range(1, 36).filter((n) => RED_NUMBERS.has(n));
    case "black":
      return range(1, 36).filter((n) => !RED_NUMBERS.has(n));
    case "odd":
      return range(1, 36).filter((n) => n % 2 === 1);
    case "even":
      return range(1, 36).filter((n) => n % 2 === 0);
    case "low":
      return range(1, 18);
    case "high":
      return range(19, 36);
    default:
      return spot.numbers ?? [];
  }
}

const ORDINAL = ["", "1st", "2nd", "3rd"];

export function describeSpot(spot: BetSpot): string {
  const nums = spot.numbers ?? [];
  switch (spot.type) {
    case "straight":
      return `Straight ${nums[0]}`;
    case "split":
      return `Split ${nums.join("/")}`;
    case "street":
      return nums[0] === 0 ? `Street ${nums.join("/")}` : `Street ${nums[0]}–${nums[2]}`;
    case "corner":
      return nums[0] === 0 ? "First four 0–3" : `Corner ${nums.join("/")}`;
    case "line":
      return `Six line ${nums[0]}–${nums[5]}`;
    case "dozen":
      return `${ORDINAL[spot.value!]} dozen`;
    case "column":
      return `Column ${spot.value}`;
    case "low":
      return "1–18";
    case "high":
      return "19–36";
    default:
      return spot.type[0]!.toUpperCase() + spot.type.slice(1);
  }
}

// ---------------------------------------------------------------------------
// Hit-testing a tap inside a number cell (12 rows × 3 columns, 0 on top).
// Edges map to splits, corners to corners/streets; the outer (right) edge of
// column 3 maps to streets and six-lines like the outer line on a real table.
// ---------------------------------------------------------------------------

export type Zone = -1 | 0 | 1;
export const EDGE_X = 0.2;
export const EDGE_Y = 0.28;

export function zoneOf(pos: number, size: number, frac: number): Zone {
  const edge = Math.min(size * frac, 22);
  if (pos < edge) return -1;
  if (pos > size - edge) return 1;
  return 0;
}

export function cellHitSpot(n: number, hz: Zone, vz: Zone): BetSpot {
  const r = rowOf(n);
  const c = colOf(n);
  const top = r === 1;
  const bottom = r === 12;

  if (hz === 0 && vz === 0) return spots.straight(n);

  if (vz === 0) {
    if (hz === 1) return c < 3 ? spots.split(n, n + 1) : spots.street(r);
    return c > 1 ? spots.split(n - 1, n) : spots.straight(n);
  }

  if (hz === 0) {
    if (vz === 1) return bottom ? spots.straight(n) : spots.split(n, n + 3);
    return top ? spots.split(0, n) : spots.split(n - 3, n);
  }

  // Corners of the cell.
  if (hz === 1 && vz === 1) {
    if (c < 3) return bottom ? spots.split(n, n + 1) : spots.corner(n);
    return bottom ? spots.street(12) : spots.line(r);
  }
  if (hz === -1 && vz === 1) {
    if (c > 1) return bottom ? spots.split(n - 1, n) : spots.corner(n - 1);
    return bottom ? spots.straight(n) : spots.split(n, n + 3);
  }
  if (hz === 1 && vz === -1) {
    if (c < 3) return top ? spots.zeroStreet(n, n + 1) : spots.corner(n - 3);
    return top ? spots.firstFour() : spots.line(r - 1);
  }
  // hz === -1 && vz === -1
  if (c > 1) return top ? spots.zeroStreet(n - 1, n) : spots.corner(n - 4);
  return top ? spots.split(0, 1) : spots.split(n - 3, n);
}

// Tap inside the 0 cell (spans the three number columns).
export function zeroHitSpot(x: number, y: number, width: number, height: number): BetSpot {
  if (zoneOf(y, height, EDGE_Y) !== 1) return spots.straight(0);
  const colW = width / 3;
  const edge = Math.min(colW * EDGE_X, 22);
  if (x > width - edge) return spots.firstFour();
  if (Math.abs(x - colW) < edge) return spots.zeroStreet(1, 2);
  if (Math.abs(x - 2 * colW) < edge) return spots.zeroStreet(2, 3);
  const c = Math.min(3, Math.max(1, Math.floor(x / colW) + 1));
  return spots.split(0, c);
}

// ---------------------------------------------------------------------------
// Bet slip operations (merge, caps, double)
// ---------------------------------------------------------------------------

export type LimitReason = "max_bets" | "max_wager" | "balance";

export type SlipResult = { ok: true; bets: PlacedBet[] } | { ok: false; reason: LimitReason };

export const totalOf = (bets: readonly PlacedBet[]): number => bets.reduce((s, b) => s + b.amount, 0);

export function checkSlip(bets: PlacedBet[], balance: number): SlipResult {
  const total = totalOf(bets);
  if (bets.length > MAX_BETS_PER_SPIN) return { ok: false, reason: "max_bets" };
  if (total > MAX_TOTAL_WAGER) return { ok: false, reason: "max_wager" };
  if (total > balance) return { ok: false, reason: "balance" };
  return { ok: true, bets };
}

// Repeated taps on the same spot merge into ONE bet with a summed amount.
export function addChip(bets: readonly PlacedBet[], spot: BetSpot, amount: number, balance: number): SlipResult {
  const i = bets.findIndex((b) => b.key === spot.key);
  const next =
    i >= 0
      ? bets.map((b, j) => (j === i ? { ...b, amount: b.amount + amount } : b))
      : [...bets, { ...spot, amount }];
  return checkSlip(next, balance);
}

export function doubleBets(bets: readonly PlacedBet[], balance: number): SlipResult {
  return checkSlip(
    bets.map((b) => ({ ...b, amount: b.amount * 2 })),
    balance,
  );
}

export const LIMIT_COPY: Record<LimitReason, string> = {
  max_bets: `Up to ${MAX_BETS_PER_SPIN} different bets per spin.`,
  max_wager: `Table limit is ${MAX_TOTAL_WAGER.toLocaleString("en-US")} coins per spin.`,
  balance: "Not enough coins for that. Lower your chip or top up.",
};

// Visual stack: largest denominations first, max 3 layers.
export function chipStack(amount: number): number[] {
  const out: number[] = [];
  let left = amount;
  for (const v of [...CHIP_VALUES].reverse()) {
    while (left >= v && out.length < 3) {
      out.push(v);
      left -= v;
    }
  }
  return out.length ? out : [amount];
}

export function formatChipLabel(amount: number): string {
  if (amount >= 1000) return `${Math.round(amount / 100) / 10}K`;
  return String(amount);
}

// ---------------------------------------------------------------------------
// Wheel landing plan. Deterministic: the ball always comes to rest in the
// pocket of `winningNumber` — no teasing / near-miss steering.
// Wheel turns clockwise (+deg), ball orbits counter-clockwise (−deg).
// Pocket at WHEEL_ORDER index k sits at wheel-local angle k * POCKET_DEG.
// ---------------------------------------------------------------------------

export const DROP_FRACTION = 0.72;

export interface LandingPlan {
  wheelEnd: number;
  ballEnd: number;
  ballOffset: number;
  dropAt: number;
}

export function easeOutCubic(x: number): number {
  "worklet";
  return 1 - Math.pow(1 - x, 3);
}

export function pocketIndex(n: number): number {
  return WHEEL_ORDER.indexOf(n);
}

export function landingPlan(
  wheelStart: number,
  ballStart: number,
  pocketIdx: number,
  durationMs: number,
  wheelSpeed: number,
  ballSpeed: number,
): LandingPlan {
  "worklet";
  const dropAt = durationMs * DROP_FRACTION;
  // Out-cubic starts at 3·D/T deg/ms — match the current spin speed.
  const wheelTravel = (wheelSpeed * durationMs) / 3;
  const wheelEnd = wheelStart + wheelTravel;
  const wheelAtDrop = wheelStart + wheelTravel * easeOutCubic(DROP_FRACTION);
  const target = wheelAtDrop + pocketIdx * (360 / 37);
  const delta = (((ballStart - target) % 360) + 360) % 360;
  const ideal = (ballSpeed * dropAt) / 3;
  const turns = Math.max(0, Math.round((ideal - delta) / 360));
  const ballEnd = ballStart - (delta + turns * 360);
  return { wheelEnd, ballEnd, ballOffset: ballEnd - wheelAtDrop, dropAt };
}

export function mod360(a: number): number {
  "worklet";
  return ((a % 360) + 360) % 360;
}

// Which pocket index the ball sits in given absolute angles (for tests/a11y).
export function pocketUnderBall(wheelAngle: number, ballAngle: number): number {
  const local = mod360(ballAngle - wheelAngle);
  return Math.round(local / POCKET_DEG) % POCKET_COUNT;
}

// ---------------------------------------------------------------------------
// Human error copy
// ---------------------------------------------------------------------------

export function humanizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/insufficient/i.test(msg)) return "Not enough coins for this spin. Top up to keep playing.";
  if (/exceeds/i.test(msg)) return LIMIT_COPY.max_wager;
  if (/at most/i.test(msg)) return LIMIT_COPY.max_bets;
  if (/session expired/i.test(msg)) return msg;
  if (/session|already spun|atomically/i.test(msg)) return "The table was reset. Check your balance and spin again.";
  if (/network|fetch|timeout/i.test(msg)) return "Can't reach the table. Check your connection and try again.";
  if (/signature/i.test(msg)) return "We couldn't verify your balance. Please reconnect.";
  return "Something went wrong with that spin. Check your balance and try again.";
}

// ---------------------------------------------------------------------------
// Neighbours (racetrack-style): n plus `k` pockets either side on the WHEEL,
// placed as individual straight bets (the backend has no call-bet type).
// ---------------------------------------------------------------------------

export function wheelNeighbours(n: number, k = 2): number[] {
  const i = pocketIndex(n);
  return Array.from({ length: 2 * k + 1 }, (_, j) => WHEEL_ORDER[(i - k + j + POCKET_COUNT) % POCKET_COUNT]!);
}

export function addChips(bets: readonly PlacedBet[], list: readonly BetSpot[], amount: number, balance: number): SlipResult {
  let cur: PlacedBet[] = [...bets];
  for (const s of list) {
    const i = cur.findIndex((b) => b.key === s.key);
    cur = i >= 0 ? cur.map((b, j) => (j === i ? { ...b, amount: b.amount + amount } : b)) : [...cur, { ...s, amount }];
  }
  return checkSlip(cur, balance);
}

// ---------------------------------------------------------------------------
// Session statistics (display only — past spins never influence future ones).
// ---------------------------------------------------------------------------

export interface SessionStats {
  spins: number;
  red: number;
  black: number;
  green: number;
  odd: number;
  even: number;
  low: number;
  high: number;
  hot: number[];
  cold: number[];
}

export function sessionStats(history: readonly number[]): SessionStats {
  const counts = new Map<number, number>();
  for (let n = 0; n <= 36; n++) counts.set(n, 0);
  const s: SessionStats = { spins: history.length, red: 0, black: 0, green: 0, odd: 0, even: 0, low: 0, high: 0, hot: [], cold: [] };
  for (const n of history) {
    counts.set(n, (counts.get(n) ?? 0) + 1);
    s[pocketColor(n)]++;
    if (n === 0) continue;
    if (n % 2) s.odd++;
    else s.even++;
    if (n <= 18) s.low++;
    else s.high++;
  }
  const seen = [...counts.entries()].filter(([, c]) => c > 0);
  s.hot = seen.sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4).map(([n]) => n);
  const lastSeen = (n: number) => history.indexOf(n);
  s.cold = [...counts.keys()]
    .sort((a, b) => {
      const la = lastSeen(a) < 0 ? Infinity : lastSeen(a);
      const lb = lastSeen(b) < 0 ? Infinity : lastSeen(b);
      return lb - la || a - b;
    })
    .slice(0, 4);
  return s;
}
