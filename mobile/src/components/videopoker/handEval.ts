import type { PokerVariant } from "@/services/api";

// Display-only port of backend/src/services/pokerVariants.ts evaluators, used to
// name the made hand after the deal. The server result is always authoritative.

type Cat =
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

const rankOf = (c: number): number => ((c % 13) + 13) % 13;

function classify5(cards: number[]): { cat: Cat; quadRank: number | null; pairRank: number | null } {
  const ranks = cards.map(rankOf);
  const suits = cards.map((c) => Math.floor(c / 13) % 4);
  const isFlush = suits.every((s) => s === suits[0]);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const sorted = [...counts.values()].sort((a, b) => b - a);
  const uniq = [...counts.keys()].sort((a, b) => a - b);
  let isStraight = false;
  if (uniq.length === 5) {
    isStraight = uniq[4]! - uniq[0]! === 4;
    if (!isStraight) isStraight = uniq[4] === 12 && uniq[3] === 3 && uniq[0] === 0;
  }
  const royal = isFlush && isStraight && [8, 9, 10, 11, 12].every((r) => counts.has(r));
  const quadRank = sorted[0] === 4 ? [...counts.entries()].find(([, n]) => n === 4)![0] : null;
  const pairRank = sorted[0] === 2 && sorted[1] !== 2 ? [...counts.entries()].find(([, n]) => n === 2)![0] : null;
  let cat: Cat;
  if (sorted[0] === 5) cat = "FIVE_OF_A_KIND";
  else if (royal) cat = "ROYAL_FLUSH";
  else if (isFlush && isStraight) cat = "STRAIGHT_FLUSH";
  else if (sorted[0] === 4) cat = "FOUR_OF_A_KIND";
  else if (sorted[0] === 3 && sorted[1] === 2) cat = "FULL_HOUSE";
  else if (isFlush) cat = "FLUSH";
  else if (isStraight) cat = "STRAIGHT";
  else if (sorted[0] === 3) cat = "THREE_OF_A_KIND";
  else if (sorted[0] === 2 && sorted[1] === 2) cat = "TWO_PAIR";
  else if (sorted[0] === 2) cat = "ONE_PAIR";
  else cat = "HIGH";
  return { cat, quadRank, pairRank };
}

function jacksOrBetter(cards: number[]): string {
  const cl = classify5(cards);
  if (cl.cat === "ONE_PAIR") return cl.pairRank !== null && cl.pairRank >= 9 ? "JACKS_OR_BETTER" : "LOSE";
  if (cl.cat === "HIGH" || cl.cat === "FIVE_OF_A_KIND") return "LOSE";
  return cl.cat;
}

function bonusPoker(cards: number[]): string {
  const cl = classify5(cards);
  if (cl.cat === "FOUR_OF_A_KIND") {
    const r = cl.quadRank!;
    if (r === 12) return "FOUR_ACES";
    if (r <= 2) return "FOUR_2_3_4";
    return "FOUR_5_K";
  }
  return jacksOrBetter(cards);
}

const DEUCES_ORDER = [
  "LOSE", "THREE_OF_A_KIND", "STRAIGHT", "FLUSH", "FULL_HOUSE",
  "FOUR_OF_A_KIND", "STRAIGHT_FLUSH", "FIVE_OF_A_KIND", "WILD_ROYAL", "FOUR_DEUCES", "NATURAL_ROYAL",
];

function naturalToDeuces(cat: Cat, wild: boolean): string {
  if (cat === "ROYAL_FLUSH") return wild ? "WILD_ROYAL" : "NATURAL_ROYAL";
  if (cat === "TWO_PAIR" || cat === "ONE_PAIR" || cat === "HIGH") return "LOSE";
  return cat;
}

function deucesWild(cards: number[]): string {
  const naturals = cards.filter((c) => rankOf(c) !== 0);
  const w = 5 - naturals.length;
  if (w === 4) return "FOUR_DEUCES";
  if (w === 0) return naturalToDeuces(classify5(cards).cat, false);
  // Wilds are interchangeable, so try combinations with repetition (≈25k for 3 wilds).
  let best = 0;
  const chosen: number[] = [];
  const assign = (idx: number, from: number): void => {
    if (best === DEUCES_ORDER.indexOf("WILD_ROYAL")) return; // ceiling once wilds are involved
    if (idx === w) {
      const r = DEUCES_ORDER.indexOf(naturalToDeuces(classify5([...naturals, ...chosen]).cat, true));
      if (r > best) best = r;
      return;
    }
    for (let card = from; card < 52; card++) {
      chosen.push(card);
      assign(idx + 1, card);
      chosen.pop();
    }
  };
  assign(0, 0);
  return DEUCES_ORDER[best]!;
}

export function evaluateHand(cards: number[], variant: PokerVariant): string {
  if (cards.length !== 5) return "LOSE";
  switch (variant) {
    case "jacks-or-better":
      return jacksOrBetter(cards);
    case "bonus-poker":
      return bonusPoker(cards);
    case "deuces-wild":
      return deucesWild(cards);
  }
}
