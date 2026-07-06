import { applyHolds } from "./videoPoker.js";

// ---------------------------------------------------------------------------
// Video poker variants — Jacks or Better, Bonus Poker, Deuces Wild.
//
// Same 52-card deck derivation and provably-fair seed chain as videoPoker.ts;
// only hand EVALUATION and the PAYTABLE differ per variant. Jacks or Better is
// kept in videoPoker.ts (the live default path is untouched); this module adds
// Bonus Poker (quad-rank bonuses) and Deuces Wild (2s are wild) and re-exposes
// a Jacks-or-Better paytable for completeness.
//
// Card encoding matches videoPoker.ts: rank = card % 13 (0=2 … 8=10, 9=J, 10=Q,
// 11=K, 12=A). Deuces (wild in Deuces Wild) are rank index 0.
// ---------------------------------------------------------------------------

export type PokerVariant = "jacks-or-better" | "bonus-poker" | "deuces-wild";

export const VARIANT_GAME_TYPE: Record<PokerVariant, string> = {
  "jacks-or-better": "jacks-or-better-9-6",
  "bonus-poker": "bonus-poker-8-5",
  "deuces-wild": "deuces-wild-nsud",
};

export function variantFromGameType(gameType: string): PokerVariant | null {
  if (gameType.startsWith("jacks-or-better")) return "jacks-or-better";
  if (gameType.startsWith("bonus-poker")) return "bonus-poker";
  if (gameType.startsWith("deuces-wild")) return "deuces-wild";
  return null;
}

// Natural 5-card categories (superset covering wild results like five-of-a-kind).
type NaturalCat =
  | "FIVE_OF_A_KIND"
  | "ROYAL_FLUSH"
  | "STRAIGHT_FLUSH"
  | "FOUR_OF_A_KIND"
  | "FULL_HOUSE"
  | "FLUSH"
  | "STRAIGHT"
  | "THREE_OF_A_KIND"
  | "TWO_PAIR"
  | "ONE_PAIR"
  | "HIGH";

interface Classified {
  cat: NaturalCat;
  quadRank: number | null; // rank index of the four-of-a-kind, if any
  pairRank: number | null; // rank index of the (highest) pair, if ONE_PAIR
}

function isRoyalRanks(ranks: number[]): boolean {
  const set = new Set(ranks);
  return [8, 9, 10, 11, 12].every((r) => set.has(r)); // 10-J-Q-K-A
}

// Classify any 5 concrete cards. Detects FIVE_OF_A_KIND (only reachable with a
// wild substitution) and ROYAL vs plain straight flush.
export function classify5(cards: number[]): Classified {
  if (cards.length !== 5) throw new Error("classify5 requires 5 cards");
  const ranks = cards.map((c) => ((c % 13) + 13) % 13);
  const suits = cards.map((c) => Math.floor(c / 13) % 4);
  const isFlush = suits.every((s) => s === suits[0]);

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const sortedCounts = [...counts.values()].sort((a, b) => b - a);
  const uniq = [...counts.keys()].sort((a, b) => a - b);

  let isStraight = false;
  if (uniq.length === 5) {
    isStraight = uniq[4] - uniq[0] === 4;
    if (!isStraight) isStraight = uniq[4] === 12 && uniq[3] === 3 && uniq[0] === 0; // wheel A-2-3-4-5
  }
  const royal = isFlush && isStraight && isRoyalRanks(ranks);

  const quadRank = sortedCounts[0] === 4 ? [...counts.entries()].find(([, n]) => n === 4)![0] : null;
  const pairRank =
    sortedCounts[0] === 2 && sortedCounts[1] !== 2
      ? [...counts.entries()].find(([, n]) => n === 2)![0]
      : null;

  let cat: NaturalCat;
  if (sortedCounts[0] === 5) cat = "FIVE_OF_A_KIND";
  else if (royal) cat = "ROYAL_FLUSH";
  else if (isFlush && isStraight) cat = "STRAIGHT_FLUSH";
  else if (sortedCounts[0] === 4) cat = "FOUR_OF_A_KIND";
  else if (sortedCounts[0] === 3 && sortedCounts[1] === 2) cat = "FULL_HOUSE";
  else if (isFlush) cat = "FLUSH";
  else if (isStraight) cat = "STRAIGHT";
  else if (sortedCounts[0] === 3) cat = "THREE_OF_A_KIND";
  else if (sortedCounts[0] === 2 && sortedCounts[1] === 2) cat = "TWO_PAIR";
  else if (sortedCounts[0] === 2) cat = "ONE_PAIR";
  else cat = "HIGH";

  return { cat, quadRank, pairRank };
}

// ---------------------------------------------------------------------------
// Jacks or Better + Bonus Poker share hand ranks (no wilds); Bonus Poker just
// splits four-of-a-kind by rank. Both use the same evaluator.
// ---------------------------------------------------------------------------
export type JobRank =
  | "ROYAL_FLUSH" | "STRAIGHT_FLUSH" | "FOUR_OF_A_KIND" | "FULL_HOUSE"
  | "FLUSH" | "STRAIGHT" | "THREE_OF_A_KIND" | "TWO_PAIR" | "JACKS_OR_BETTER" | "LOSE";

export type BonusRank =
  | "ROYAL_FLUSH" | "STRAIGHT_FLUSH" | "FOUR_ACES" | "FOUR_2_3_4" | "FOUR_5_K"
  | "FULL_HOUSE" | "FLUSH" | "STRAIGHT" | "THREE_OF_A_KIND" | "TWO_PAIR" | "JACKS_OR_BETTER" | "LOSE";

export type DeucesRank =
  | "NATURAL_ROYAL" | "FOUR_DEUCES" | "WILD_ROYAL" | "FIVE_OF_A_KIND" | "STRAIGHT_FLUSH"
  | "FOUR_OF_A_KIND" | "FULL_HOUSE" | "FLUSH" | "STRAIGHT" | "THREE_OF_A_KIND" | "LOSE";

export type VariantRank = JobRank | BonusRank | DeucesRank;

// A pair "jacks or better" needs the pair rank to be J(9), Q(10), K(11) or A(12).
const isHighPair = (r: number | null): boolean => r !== null && r >= 9;

export function evaluateJacksOrBetter(cards: number[]): JobRank {
  const cl = classify5(cards);
  switch (cl.cat) {
    case "ROYAL_FLUSH": return "ROYAL_FLUSH";
    case "STRAIGHT_FLUSH": return "STRAIGHT_FLUSH";
    case "FOUR_OF_A_KIND": return "FOUR_OF_A_KIND";
    case "FULL_HOUSE": return "FULL_HOUSE";
    case "FLUSH": return "FLUSH";
    case "STRAIGHT": return "STRAIGHT";
    case "THREE_OF_A_KIND": return "THREE_OF_A_KIND";
    case "TWO_PAIR": return "TWO_PAIR";
    case "ONE_PAIR": return isHighPair(cl.pairRank) ? "JACKS_OR_BETTER" : "LOSE";
    default: return "LOSE";
  }
}

export function evaluateBonusPoker(cards: number[]): BonusRank {
  const cl = classify5(cards);
  if (cl.cat === "FOUR_OF_A_KIND") {
    const r = cl.quadRank!;
    if (r === 12) return "FOUR_ACES"; // aces
    if (r <= 2) return "FOUR_2_3_4"; // ranks 0,1,2 = 2,3,4
    return "FOUR_5_K"; // 5..K
  }
  const job = evaluateJacksOrBetter(cards);
  return job as BonusRank;
}

const DEUCES_ORDER: DeucesRank[] = [
  "LOSE", "THREE_OF_A_KIND", "STRAIGHT", "FLUSH", "FULL_HOUSE",
  "FOUR_OF_A_KIND", "STRAIGHT_FLUSH", "FIVE_OF_A_KIND", "WILD_ROYAL", "FOUR_DEUCES", "NATURAL_ROYAL",
];
const deucesRankOf = (r: DeucesRank) => DEUCES_ORDER.indexOf(r);

// Map a wild-substituted natural category to a Deuces Wild pay category. Below
// three-of-a-kind pays nothing in Deuces Wild.
function naturalToDeuces(cat: NaturalCat, wildsUsed: boolean): DeucesRank {
  switch (cat) {
    case "FIVE_OF_A_KIND": return "FIVE_OF_A_KIND";
    case "ROYAL_FLUSH": return wildsUsed ? "WILD_ROYAL" : "NATURAL_ROYAL";
    case "STRAIGHT_FLUSH": return "STRAIGHT_FLUSH";
    case "FOUR_OF_A_KIND": return "FOUR_OF_A_KIND";
    case "FULL_HOUSE": return "FULL_HOUSE";
    case "FLUSH": return "FLUSH";
    case "STRAIGHT": return "STRAIGHT";
    case "THREE_OF_A_KIND": return "THREE_OF_A_KIND";
    default: return "LOSE";
  }
}

export function evaluateDeucesWild(cards: number[]): DeucesRank {
  if (cards.length !== 5) throw new Error("evaluateDeucesWild requires 5 cards");
  const wildPositions = cards.filter((c) => ((c % 13) + 13) % 13 === 0);
  const naturals = cards.filter((c) => ((c % 13) + 13) % 13 !== 0);
  const w = wildPositions.length;

  if (w === 4) return "FOUR_DEUCES";
  if (w === 0) {
    const cl = classify5(cards);
    return naturalToDeuces(cl.cat, false);
  }

  // Brute-force each wild over all 52 cards; take the best resulting category.
  // w ≤ 3 here (w===4 handled above), so at most 52^3 ≈ 140k cheap evaluations.
  let best: DeucesRank = "LOSE";
  const assign = (idx: number, chosen: number[]): void => {
    if (idx === w) {
      const cl = classify5([...naturals, ...chosen]);
      const mapped = naturalToDeuces(cl.cat, true);
      if (deucesRankOf(mapped) > deucesRankOf(best)) best = mapped;
      return;
    }
    for (let card = 0; card < 52; card++) assign(idx + 1, [...chosen, card]);
  };
  assign(0, []);
  return best;
}

// ---- Paytables (× bet in coins; royal pays 800× on a 5-coin max bet) ----------

export const JACKS_OR_BETTER_PAYTABLE: Record<JobRank, number> = {
  ROYAL_FLUSH: 250, STRAIGHT_FLUSH: 50, FOUR_OF_A_KIND: 25, FULL_HOUSE: 9, FLUSH: 6,
  STRAIGHT: 4, THREE_OF_A_KIND: 3, TWO_PAIR: 2, JACKS_OR_BETTER: 1, LOSE: 0,
};

// Bonus Poker 8/5 (~99.17% EV).
export const BONUS_POKER_PAYTABLE: Record<BonusRank, number> = {
  ROYAL_FLUSH: 250, STRAIGHT_FLUSH: 50, FOUR_ACES: 80, FOUR_2_3_4: 40, FOUR_5_K: 25,
  FULL_HOUSE: 8, FLUSH: 5, STRAIGHT: 4, THREE_OF_A_KIND: 3, TWO_PAIR: 2, JACKS_OR_BETTER: 1, LOSE: 0,
};

// "Not So Ugly" Deuces Wild (NSUD, ~99.73% EV).
export const DEUCES_WILD_PAYTABLE: Record<DeucesRank, number> = {
  NATURAL_ROYAL: 250, FOUR_DEUCES: 200, WILD_ROYAL: 25, FIVE_OF_A_KIND: 16, STRAIGHT_FLUSH: 10,
  FOUR_OF_A_KIND: 4, FULL_HOUSE: 4, FLUSH: 3, STRAIGHT: 2, THREE_OF_A_KIND: 1, LOSE: 0,
};

// Royal (natural, and NATURAL_ROYAL for deuces) pays 800× on a 5-coin max bet.
function payoutMultiplier(variant: PokerVariant, rank: VariantRank, betCoins: number): number {
  const isTopRoyal = rank === "ROYAL_FLUSH" || rank === "NATURAL_ROYAL";
  if (isTopRoyal && betCoins === 5) return 800;
  switch (variant) {
    case "jacks-or-better": return JACKS_OR_BETTER_PAYTABLE[rank as JobRank];
    case "bonus-poker": return BONUS_POKER_PAYTABLE[rank as BonusRank];
    case "deuces-wild": return DEUCES_WILD_PAYTABLE[rank as DeucesRank];
  }
}

export function evaluateVariant(cards: number[], variant: PokerVariant): VariantRank {
  switch (variant) {
    case "jacks-or-better": return evaluateJacksOrBetter(cards);
    case "bonus-poker": return evaluateBonusPoker(cards);
    case "deuces-wild": return evaluateDeucesWild(cards);
  }
}

export function calcVariantPayout(variant: PokerVariant, rank: VariantRank, betCoins: number): number {
  return payoutMultiplier(variant, rank, betCoins) * betCoins;
}

// Resolve a drawn hand for a given variant (mirrors videoPoker.resolveHand).
export function resolveVariantHand(
  deck: number[],
  holds: boolean[],
  betCoins: number,
  variant: PokerVariant,
): { drawnCards: number[]; rank: VariantRank; payout: number } {
  const drawnCards = applyHolds(deck, holds);
  const rank = evaluateVariant(drawnCards, variant);
  const payout = calcVariantPayout(variant, rank, betCoins);
  return { drawnCards, rank, payout };
}
