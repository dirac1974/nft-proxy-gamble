import type { BlackjackRound } from "@/services/api";
import type { BadgeTone } from "@/components/ui";

// Table limits mirror backend/src/routes/blackjack.ts (BJ_MIN_BET / BJ_MAX_BET).
export const BJ_MIN_BET = 1;
export const BJ_MAX_BET = 500;
export const BET_CHIPS = [5, 25, 100, 250] as const;

// Backend shoe is numDecks*52 cards with card = index % 52; normalise defensively.
export function faceOf(card: number): number {
  return ((card % 52) + 52) % 52;
}

// Mirrors backend cardValue/handValue so totals can update as each card lands.
export function cardValue(card: number): number {
  const r = faceOf(card) % 13;
  if (r <= 7) return r + 2;
  if (r <= 11) return 10;
  return 11;
}

export function handValue(cards: number[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = cardValue(c);
    if (v === 11) aces++;
    total += v;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export function isNatural(cards: number[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function tableRuleLine(dealerHitsSoft17: boolean): string {
  return dealerHitsSoft17 ? "DEALER MUST HIT SOFT 17" : "DEALER STANDS ON ALL 17S";
}

// ---------------------------------------------------------------------------
// Betting
// ---------------------------------------------------------------------------
export type BetRejection = "max" | "balance" | null;

export function tryRaiseBet(next: number, balance: number): { bet: number | null; reason: BetRejection } {
  if (next > BJ_MAX_BET) return { bet: null, reason: "max" };
  if (next > balance) return { bet: null, reason: "balance" };
  return { bet: next, reason: null };
}

export function betRejectionMessage(reason: Exclude<BetRejection, null>): string {
  return reason === "max"
    ? `The table maximum is ${BJ_MAX_BET} coins per hand.`
    : "Not enough coins for that bet. Add coins to raise it.";
}

// Greedy denomination split for the bet-circle stack (bottom chip first).
export function chipStack(amount: number, maxChips = 10): number[] {
  const denoms = [250, 100, 25, 5, 1];
  const out: number[] = [];
  let rest = Math.max(0, Math.floor(amount));
  for (const d of denoms) {
    while (rest >= d && out.length < maxChips) {
      out.push(d);
      rest -= d;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
export interface HandResultView {
  label: string;
  tone: BadgeTone;
}

export function resultView(r: { outcome: string; bet: number; ret: number }): HandResultView {
  const net = r.ret - r.bet;
  switch (r.outcome) {
    case "blackjack":
      return { label: `Blackjack +${net}`, tone: "gold" };
    case "win":
      return { label: `Win +${net}`, tone: "success" };
    case "push":
      return { label: "Push", tone: "neutral" };
    case "bust":
      return { label: "Bust", tone: "danger" };
    case "surrender":
      return { label: "Surrendered", tone: "neutral" };
    default:
      return { label: "Lose", tone: "danger" };
  }
}

export type RoundVoice = "vo_blackjack" | "vo_dealer_bj" | "vo_dealer_bust" | "vo_push" | null;

export function roundVoice(r: BlackjackRound): RoundVoice {
  const results = r.results ?? [];
  if (results.some((x) => x.outcome === "blackjack")) return "vo_blackjack";
  if (isNatural(r.dealer)) return "vo_dealer_bj";
  const anyLive = r.hands.some((h) => !h.busted);
  if (anyLive && handValue(r.dealer).total > 21) return "vo_dealer_bust";
  if (results.length > 0 && results.every((x) => x.outcome === "push")) return "vo_push";
  return null;
}

// Mutation errors → human language. Server messages are developer-facing.
export function humanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const m = msg.toLowerCase();
  if (m.includes("session expired")) return "Your session expired. Please reconnect your wallet.";
  if (m.includes("network request failed") || m.includes("failed to fetch") || m.includes("timeout"))
    return "We couldn't reach the table. Check your connection and try again.";
  if (m.includes("balance") || m.includes("insufficient"))
    return "Your balance changed before that went through. Please try again.";
  if (m.includes("too small to insure")) return "This bet is too small to insure.";
  if (m.includes("atomically") || m.includes("not in active state"))
    return "The table was busy. Please try that again.";
  if (m.includes("signature")) return "We couldn't confirm your balance. Please reconnect your wallet.";
  return "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------------------
// Presentation timeline. The server answers instantly; the client paces the
// reveal: how many cards of each hand are on the felt, whether the hole card is
// face-up, and whether the outcome is shown.
// ---------------------------------------------------------------------------
export interface Shown {
  dealer: number; // dealer card slots on the felt (slot 1 is the hole card)
  hole: boolean; // hole card face-up
  hands: number[]; // cards on the felt per player hand
  settled: boolean; // outcome presented
}

export const EMPTY_SHOWN: Shown = { dealer: 0, hole: false, hands: [], settled: false };

export type StepKind = "player" | "dealer" | "reveal" | "outcome";
export interface Step {
  at: number;
  kind: StepKind;
  hand?: number;
}

export interface Timings {
  cardInterval: number;
  dealerDraw: number;
  revealDelay: number;
}

export function targetFor(r: BlackjackRound): Shown {
  return {
    dealer: r.dealerHoleHidden ? 2 : Math.max(2, r.dealer.length),
    hole: !r.dealerHoleHidden,
    hands: r.hands.map((h) => h.cards.length),
    settled: r.phase === "settled",
  };
}

// After a split the active hand keeps its first card and the moved card opens a
// new hand right after it; both then receive one new card from the shoe.
export function remapForSplit(from: Shown, prev: BlackjackRound | null, next: BlackjackRound): Shown {
  if (!prev || next.hands.length <= prev.hands.length || from.hands.length === 0) return from;
  const at = prev.active;
  const hands = [...from.hands];
  hands[at] = 1;
  hands.splice(at + 1, 0, 1);
  return { ...from, hands };
}

export function planSteps(from: Shown, r: BlackjackRound, t: Timings): Step[] {
  const target = targetFor(r);
  const steps: Step[] = [];
  let at = 0;
  const shownHands = target.hands.map((_, i) => Math.min(from.hands[i] ?? 0, target.hands[i]!));
  let dealerSlots = from.dealer;

  const initial = from.dealer === 0 && shownHands.every((n) => n === 0);
  if (initial) {
    // Casino order: player, dealer, player, dealer hole.
    for (const kind of ["player", "dealer", "player", "dealer"] as const) {
      steps.push(kind === "player" ? { at, kind, hand: 0 } : { at, kind });
      at += t.cardInterval;
      if (kind === "player") shownHands[0]!++;
      else dealerSlots++;
    }
  }

  for (let i = 0; i < target.hands.length; i++) {
    while (shownHands[i]! < target.hands[i]!) {
      steps.push({ at, kind: "player", hand: i });
      at += t.cardInterval;
      shownHands[i]!++;
    }
  }

  // Any dealer slots up to the hole (only relevant on a fresh table).
  while (dealerSlots < Math.min(2, target.dealer)) {
    steps.push({ at, kind: "dealer" });
    at += t.cardInterval;
    dealerSlots++;
  }

  if (target.hole && !from.hole) {
    at += Math.max(0, t.revealDelay - (steps.length ? t.cardInterval : 0));
    steps.push({ at, kind: "reveal" });
    while (dealerSlots < target.dealer) {
      at += t.dealerDraw;
      steps.push({ at, kind: "dealer" });
      dealerSlots++;
    }
  }

  if (target.settled && !from.settled) {
    at += steps.length ? t.revealDelay : 0;
    steps.push({ at, kind: "outcome" });
  }
  return steps;
}

export function applyStep(s: Shown, step: Step, handCount: number): Shown {
  const hands = Array.from({ length: handCount }, (_, i) => s.hands[i] ?? 0);
  switch (step.kind) {
    case "player":
      hands[step.hand ?? 0]!++;
      return { ...s, hands };
    case "dealer":
      return { ...s, hands, dealer: s.dealer + 1 };
    case "reveal":
      return { ...s, hands, hole: true };
    case "outcome":
      return { ...s, hands, settled: true };
  }
}

export function scaleTimings(t: Timings, reduceMotion: boolean): Timings {
  if (!reduceMotion) return t;
  const f = 0.3;
  return { cardInterval: t.cardInterval * f, dealerDraw: t.dealerDraw * f, revealDelay: t.revealDelay * f };
}
