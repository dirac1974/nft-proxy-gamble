// Midnight Keno — pure board/round logic shared by the screen and tests.
// Paytable/bet levels: v1 math — pending Stats sign-off (v2-decisions.md). The server is
// authoritative; this copy only drives the on-screen strip and copy.

export type KenoMode = "single" | "quad";
export type KenoSpeed = "normal" | "fast" | "instant";

// Jurisdiction flag (v2 GLOBAL): disables Instant and enforces a 2.5s minimum draw cycle.
// TODO(lead): hoist to a shared config constant when one exists.
export const RESTRICTED_PLAY = false;
export const RESTRICTED_MIN_CYCLE_MS = 2500;

export const BOARD_SIZE = 80;
export const BOARD_COLS = 10;
export const BOARD_ROWS = 8;
export const DRAW_COUNT = 20;
export const MAX_SPOTS = 10;
export const MIN_SPOTS = 1;
export const BET_LEVELS = [10, 20, 50] as const;
export const DEFAULT_BET = 20;
export const DEFAULT_QP_COUNT = 5;
export const MAX_WIN = 500_000;
export const QUAD_CARDS = 4;
export const QUAD_MAX_TOTAL = 200;
export const RTP_RANGE = "92.5–94.4%";

// Returns per 1 coin staked (incl. stake) ×10, so payout = bet × mult10 / 10 is an exact integer.
export const PAYTABLE_X10: Record<number, Record<number, number>> = {
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

export const RTP_BY_SPOTS: Record<number, number> = {
  1: 92.5,
  2: 93.196,
  3: 94.352,
  4: 93.433,
  5: 93.865,
  6: 93.665,
  7: 93.477,
  8: 93.429,
  9: 93.803,
  10: 93.567,
};

export interface CardStyle {
  letter: "A" | "B" | "C" | "D";
  name: string;
  color: string;
  glyph: "circle" | "square" | "triangle" | "diamond";
  glyphChar: string;
  corner: "tl" | "tr" | "bl" | "br";
}

// Okabe-Ito set, letter + shape + fixed pip corner so colour is never the only cue.
export const CARD_STYLES: readonly CardStyle[] = [
  { letter: "A", name: "Sky", color: "#56B4E9", glyph: "circle", glyphChar: "●", corner: "tl" },
  { letter: "B", name: "Orange", color: "#E69F00", glyph: "square", glyphChar: "■", corner: "tr" },
  { letter: "C", name: "Teal", color: "#2BC4A0", glyph: "triangle", glyphChar: "▲", corner: "bl" },
  { letter: "D", name: "Orchid", color: "#CC79A7", glyph: "diamond", glyphChar: "◆", corner: "br" },
];

export const cardCount = (mode: KenoMode): number => (mode === "quad" ? QUAD_CARDS : 1);
export const emptyCards = (mode: KenoMode): number[][] => Array.from({ length: cardCount(mode) }, () => []);
export const isBetLevel = (v: number): boolean => (BET_LEVELS as readonly number[]).includes(v);

// ---------------------------------------------------------------------------
// Marking
// ---------------------------------------------------------------------------

export type ToggleResult = { ok: true; spots: number[]; added: boolean } | { ok: false; reason: "max" | "range" };

export function toggleSpot(spots: readonly number[], n: number): ToggleResult {
  if (!Number.isInteger(n) || n < 1 || n > BOARD_SIZE) return { ok: false, reason: "range" };
  if (spots.includes(n)) return { ok: true, spots: spots.filter((s) => s !== n), added: false };
  if (spots.length >= MAX_SPOTS) return { ok: false, reason: "max" };
  return { ok: true, spots: [...spots, n].sort((a, b) => a - b), added: true };
}

export const sameSpots = (a: readonly number[], b: readonly number[]): boolean => {
  if (a.length !== b.length || a.length === 0) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
};

/** First pair of non-empty cards with identical spot sets (server rejects these), or null. */
export function findIdentical(cards: readonly (readonly number[])[]): [number, number] | null {
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (sameSpots(cards[i]!, cards[j]!)) return [i, j];
    }
  }
  return null;
}

export type Rng = () => number;

/** N unique random spots; retries so the result never duplicates another card's set. */
export function quickPick(
  count: number,
  others: readonly (readonly number[])[] = [],
  rng: Rng = Math.random,
): number[] {
  const k = Math.max(MIN_SPOTS, Math.min(MAX_SPOTS, Math.floor(count)));
  for (let attempt = 0; attempt < 50; attempt++) {
    const pool = Array.from({ length: BOARD_SIZE }, (_, i) => i + 1);
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(rng() * (BOARD_SIZE - i));
      const t = pool[i]!;
      pool[i] = pool[Math.min(j, BOARD_SIZE - 1)]!;
      pool[Math.min(j, BOARD_SIZE - 1)] = t;
    }
    const pick = pool.slice(0, k).sort((a, b) => a - b);
    if (!others.some((o) => sameSpots(o, pick))) return pick;
  }
  // Astronomically unlikely with a real RNG; fall back to a deterministic distinct set.
  const base = Array.from({ length: k }, (_, i) => i + 1);
  return others.some((o) => sameSpots(o, base)) ? Array.from({ length: k }, (_, i) => BOARD_SIZE - i).sort((a, b) => a - b) : base;
}

/** Quick-pick every card (quad), each distinct from the others. */
export function quickPickAll(cards: readonly (readonly number[])[], count: number, rng: Rng = Math.random): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < cards.length; i++) out.push(quickPick(count, out, rng));
  return out;
}

// ---------------------------------------------------------------------------
// Wager
// ---------------------------------------------------------------------------

export const playedCardIndexes = (cards: readonly (readonly number[])[]): number[] =>
  cards.map((c, i) => (c.length > 0 ? i : -1)).filter((i) => i >= 0);

export const totalWager = (cards: readonly (readonly number[])[], bet: number): number =>
  playedCardIndexes(cards).length * bet;

export type PlayBlock = "empty" | "identical" | "bet" | "max_total" | null;

export function playBlock(mode: KenoMode, cards: readonly (readonly number[])[], bet: number): PlayBlock {
  if (!isBetLevel(bet)) return "bet";
  if (playedCardIndexes(cards).length === 0) return "empty";
  if (findIdentical(cards)) return "identical";
  if (mode === "quad" && totalWager(cards, bet) > QUAD_MAX_TOTAL) return "max_total";
  return null;
}

export function playLabel(mode: KenoMode, cards: readonly (readonly number[])[], bet: number): string {
  const block = playBlock(mode, cards, bet);
  if (block === "empty") return "Pick numbers";
  if (block === "identical") {
    const [a, b] = findIdentical(cards)!;
    return `Cards ${CARD_STYLES[a]!.letter} & ${CARD_STYLES[b]!.letter} match`;
  }
  const played = playedCardIndexes(cards).length;
  if (mode === "single") return `PLAY · ${bet}`;
  return `PLAY · ${played}×${bet} = ${played * bet}`;
}

export function apiCards(cards: readonly (readonly number[])[], bet: number): { spots: number[]; bet: number }[] {
  return playedCardIndexes(cards).map((i) => ({ spots: [...cards[i]!], bet }));
}

// ---------------------------------------------------------------------------
// Pays & results
// ---------------------------------------------------------------------------

export const multX10 = (spots: number, catches: number): number => PAYTABLE_X10[spots]?.[catches] ?? 0;
export const payFor = (spots: number, catches: number, bet: number): number => (bet * multX10(spots, catches)) / 10;
export const isPayingCatch = (spots: number, catches: number): boolean => multX10(spots, catches) > 0;

/** Paytable rows for a spot count, highest catch first. */
export function payRows(spots: number): { catches: number; x10: number }[] {
  const row = PAYTABLE_X10[spots];
  if (!row) return [];
  return Object.entries(row)
    .map(([c, x10]) => ({ catches: Number(c), x10 }))
    .sort((a, b) => b.catches - a.catches);
}

export function formatMult(x10: number): string {
  if (x10 === 10) return "PUSH";
  return x10 % 10 === 0 ? `${x10 / 10}×` : `${(x10 / 10).toFixed(1)}×`;
}

export function countCatches(spots: readonly number[], drawn: readonly number[] | ReadonlySet<number>): number {
  const set = drawn instanceof Set ? drawn : new Set(drawn as readonly number[]);
  let c = 0;
  for (const s of spots) if (set.has(s)) c++;
  return c;
}

export type ResultKind = "win" | "ldw" | "push" | "loss";

export function classifyReturn(totalReturn: number, wagered: number): ResultKind {
  if (totalReturn > wagered) return "win";
  if (totalReturn === wagered && wagered > 0) return "push";
  if (totalReturn > 0) return "ldw";
  return "loss";
}

const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

/** Net-based banner copy (v2 GLOBAL): never "WIN" for LDW or push. */
export function resultCopy(totalReturn: number, wagered: number): { kind: ResultKind; text: string } {
  const kind = classifyReturn(totalReturn, wagered);
  switch (kind) {
    case "win":
      return { kind, text: `Won ${fmt(totalReturn)} · Net +${fmt(totalReturn - wagered)}` };
    case "push":
      return { kind, text: "Bet returned" };
    case "ldw":
      return { kind, text: `Returned ${fmt(totalReturn)} of ${fmt(wagered)}` };
    default:
      return { kind, text: `No pay this draw · −${fmt(wagered)}` };
  }
}

export function cardResultCopy(catches: number, spots: number, payout: number): string {
  return `Catch ${catches} of ${spots} · ${payout > 0 ? `pays ${fmt(payout)}` : "no pay"}`;
}

// ---------------------------------------------------------------------------
// Draw presentation
// ---------------------------------------------------------------------------

export const SPEED_TIMING = {
  normal: { step: 200, hitDwell: 100 },
  fast: { step: 80, hitDwell: 0 },
  instantTotal: 300,
} as const;

export function effectiveSpeed(speed: KenoSpeed, reduceMotion: boolean, restricted = RESTRICTED_PLAY): KenoSpeed {
  if (restricted && speed === "instant") return "fast";
  if (reduceMotion) return restricted ? "fast" : "instant";
  return speed;
}

/** Reveal time (ms from start) for each drawn ball, plus the total presentation length. */
export function drawSchedule(
  drawn: readonly number[],
  cards: readonly (readonly number[])[],
  speed: KenoSpeed,
  restricted = RESTRICTED_PLAY,
): { times: number[]; total: number } {
  const marked = new Set(cards.flat());
  const times: number[] = [];
  let t = 0;
  if (speed === "instant") {
    const stagger = Math.floor(SPEED_TIMING.instantTotal / Math.max(1, drawn.length));
    drawn.forEach((_, i) => times.push(i * stagger));
    t = drawn.length ? (drawn.length - 1) * stagger : 0;
  } else {
    const { step, hitDwell } = SPEED_TIMING[speed];
    drawn.forEach((n) => {
      t += step;
      times.push(t);
      if (marked.has(n)) t += hitDwell;
    });
  }
  if (restricted && t < RESTRICTED_MIN_CYCLE_MS && times.length) {
    const scale = RESTRICTED_MIN_CYCLE_MS / Math.max(1, t);
    return { times: times.map((x) => Math.round(x * scale)), total: RESTRICTED_MIN_CYCLE_MS };
  }
  return { times, total: t };
}

/**
 * Hit-bell variant for ball `index`: pitch rises only for catches landing on a paying row
 * (index = that card's catch count, max 10); non-paying catches stay flat (1). null = miss.
 */
export function hitSoundIndex(drawn: readonly number[], index: number, cards: readonly (readonly number[])[]): number | null {
  const ball = drawn[index];
  if (ball === undefined) return null;
  const upTo = new Set(drawn.slice(0, index + 1));
  let best = 0;
  let hit = false;
  for (const spots of cards) {
    if (!spots.includes(ball)) continue;
    hit = true;
    const c = countCatches(spots, upTo);
    if (isPayingCatch(spots.length, c)) best = Math.max(best, c);
  }
  if (!hit) return null;
  return best > 0 ? Math.min(10, best) : 1;
}

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

export function cellA11yLabel(n: number, markedBy: readonly number[], drawn: boolean, mode: KenoMode): string {
  const parts = [String(n)];
  if (markedBy.length) {
    if (mode === "single") parts.push("marked");
    else {
      const letters = markedBy.map((i) => CARD_STYLES[i]!.letter);
      const list = letters.length === 1 ? letters[0]! : `${letters.slice(0, -1).join(", ")} and ${letters[letters.length - 1]}`;
      parts.push(`marked card${letters.length > 1 ? "s" : ""} ${list}`);
    }
  }
  if (drawn) parts.push("drawn");
  if (drawn && markedBy.length) parts.push("hit");
  return parts.join(", ");
}

export function roundSummary(
  mode: KenoMode,
  results: readonly { cardIndex: number; spots: readonly number[]; catches: number; payout: number }[],
  totalReturn: number,
  wagered: number,
): string {
  const cards = results.map((r) =>
    `${mode === "quad" ? `Card ${CARD_STYLES[r.cardIndex]?.letter ?? r.cardIndex + 1}: ` : ""}${cardResultCopy(r.catches, r.spots.length, r.payout)}`,
  );
  return `Draw complete. ${cards.join(". ")}. ${resultCopy(totalReturn, wagered).text}.`;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const LIMIT_COPY = {
  max: "Max 10 spots per card",
  identical: "Two cards have the same numbers. Change one to play.",
  empty: "Pick at least one number to play.",
} as const;

export function humanizeKenoError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/insufficient/i.test(msg)) return "Not enough coins for this draw. Top up to keep playing.";
  if (/identical/i.test(msg)) return LIMIT_COPY.identical;
  if (/session expired/i.test(msg)) return msg;
  if (/session|already|claim/i.test(msg)) return "The game was reset. Check your balance and play again.";
  if (/network|fetch|timeout/i.test(msg)) return "Can't reach the game. Check your connection and try again.";
  if (/signature/i.test(msg)) return "We couldn't verify your balance. Please reconnect.";
  if (/spot|bet|card/i.test(msg)) return "That ticket wasn't accepted. Check your numbers and bet.";
  return "Something went wrong with that draw. Check your balance and try again.";
}
