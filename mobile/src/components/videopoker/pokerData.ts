import type { PokerVariant } from "@/services/api";

// Client mirror of backend/src/services/pokerVariants.ts + videoPoker.ts.
// Display only — the server is authoritative for every payout.

export const BET_LEVELS = [1, 2, 3, 4, 5] as const;
export const MAX_BET = 5;
export const MAX_BET_ROYAL_MULT = 800;

export interface VariantInfo {
  id: PokerVariant;
  name: string;
  short: string;
  spec: string;
  rtp: string;
}

export const VARIANTS: VariantInfo[] = [
  { id: "jacks-or-better", name: "Jacks or Better", short: "Jacks or Better", spec: "9/6", rtp: "99.54%" },
  { id: "bonus-poker", name: "Bonus Poker", short: "Bonus Poker", spec: "8/5", rtp: "99.17%" },
  { id: "deuces-wild", name: "Deuces Wild", short: "Deuces Wild", spec: "Not So Ugly", rtp: "99.73%" },
];

export function variantInfo(v: PokerVariant): VariantInfo {
  return VARIANTS.find((x) => x.id === v) ?? VARIANTS[0]!;
}

export interface PayRow {
  code: string;
  label: string;
  mult: number;
  desc: string;
  /** Pays MAX_BET_ROYAL_MULT× at max bet instead of mult×. */
  royalBonus?: boolean;
}

export const PAYTABLES: Record<PokerVariant, PayRow[]> = {
  "jacks-or-better": [
    { code: "ROYAL_FLUSH", label: "Royal Flush", mult: 250, desc: "A K Q J 10, same suit", royalBonus: true },
    { code: "STRAIGHT_FLUSH", label: "Straight Flush", mult: 50, desc: "Five in sequence, same suit" },
    { code: "FOUR_OF_A_KIND", label: "Four of a Kind", mult: 25, desc: "Four cards of one rank" },
    { code: "FULL_HOUSE", label: "Full House", mult: 9, desc: "Three of a kind plus a pair" },
    { code: "FLUSH", label: "Flush", mult: 6, desc: "Five cards of one suit" },
    { code: "STRAIGHT", label: "Straight", mult: 4, desc: "Five cards in sequence" },
    { code: "THREE_OF_A_KIND", label: "Three of a Kind", mult: 3, desc: "Three cards of one rank" },
    { code: "TWO_PAIR", label: "Two Pair", mult: 2, desc: "Two different pairs" },
    { code: "JACKS_OR_BETTER", label: "Jacks or Better", mult: 1, desc: "A pair of Jacks, Queens, Kings or Aces" },
  ],
  "bonus-poker": [
    { code: "ROYAL_FLUSH", label: "Royal Flush", mult: 250, desc: "A K Q J 10, same suit", royalBonus: true },
    { code: "STRAIGHT_FLUSH", label: "Straight Flush", mult: 50, desc: "Five in sequence, same suit" },
    { code: "FOUR_ACES", label: "Four Aces", mult: 80, desc: "All four Aces" },
    { code: "FOUR_2_3_4", label: "Four 2s–4s", mult: 40, desc: "Four 2s, 3s or 4s" },
    { code: "FOUR_5_K", label: "Four 5s–Ks", mult: 25, desc: "Four of any rank 5 through King" },
    { code: "FULL_HOUSE", label: "Full House", mult: 8, desc: "Three of a kind plus a pair" },
    { code: "FLUSH", label: "Flush", mult: 5, desc: "Five cards of one suit" },
    { code: "STRAIGHT", label: "Straight", mult: 4, desc: "Five cards in sequence" },
    { code: "THREE_OF_A_KIND", label: "Three of a Kind", mult: 3, desc: "Three cards of one rank" },
    { code: "TWO_PAIR", label: "Two Pair", mult: 2, desc: "Two different pairs" },
    { code: "JACKS_OR_BETTER", label: "Jacks or Better", mult: 1, desc: "A pair of Jacks, Queens, Kings or Aces" },
  ],
  "deuces-wild": [
    { code: "NATURAL_ROYAL", label: "Natural Royal", mult: 250, desc: "Royal flush without deuces", royalBonus: true },
    { code: "FOUR_DEUCES", label: "Four Deuces", mult: 200, desc: "All four 2s" },
    { code: "WILD_ROYAL", label: "Wild Royal", mult: 25, desc: "Royal flush using deuces" },
    { code: "FIVE_OF_A_KIND", label: "Five of a Kind", mult: 16, desc: "Five of one rank, using deuces" },
    { code: "STRAIGHT_FLUSH", label: "Straight Flush", mult: 10, desc: "Five in sequence, same suit" },
    { code: "FOUR_OF_A_KIND", label: "Four of a Kind", mult: 4, desc: "Four cards of one rank" },
    { code: "FULL_HOUSE", label: "Full House", mult: 4, desc: "Three of a kind plus a pair" },
    { code: "FLUSH", label: "Flush", mult: 3, desc: "Five cards of one suit" },
    { code: "STRAIGHT", label: "Straight", mult: 2, desc: "Five cards in sequence" },
    { code: "THREE_OF_A_KIND", label: "Three of a Kind", mult: 1, desc: "Three cards of one rank" },
  ],
};

export function rowPayout(row: PayRow, bet: number): number {
  const mult = row.royalBonus && bet === MAX_BET ? MAX_BET_ROYAL_MULT : row.mult;
  return mult * bet;
}

const LABELS: Record<string, string> = {
  ROYAL_FLUSH: "Royal Flush",
  STRAIGHT_FLUSH: "Straight Flush",
  FOUR_OF_A_KIND: "Four of a Kind",
  FULL_HOUSE: "Full House",
  FLUSH: "Flush",
  STRAIGHT: "Straight",
  THREE_OF_A_KIND: "Three of a Kind",
  TWO_PAIR: "Two Pair",
  JACKS_OR_BETTER: "Jacks or Better",
  FOUR_ACES: "Four Aces",
  FOUR_2_3_4: "Four 2s–4s",
  FOUR_5_K: "Four 5s–Ks",
  NATURAL_ROYAL: "Natural Royal",
  FOUR_DEUCES: "Four Deuces",
  WILD_ROYAL: "Wild Royal",
  FIVE_OF_A_KIND: "Five of a Kind",
  LOSE: "No win",
};

/** Normalise a backend rank code (or a legacy display label) to its canonical code. */
export function normalizeRank(raw: string | null | undefined): string {
  if (!raw) return "LOSE";
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function rankLabel(raw: string | null | undefined): string {
  const code = normalizeRank(raw);
  if (LABELS[code]) return LABELS[code]!;
  return code
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export function isLosingRank(raw: string | null | undefined): boolean {
  return normalizeRank(raw) === "LOSE";
}

/** Per-coin multiplier for a rank in a variant (0 when it does not pay). */
export function rankMultiplier(raw: string | null | undefined, variant: PokerVariant): number {
  const code = normalizeRank(raw);
  return PAYTABLES[variant].find((r) => r.code === code)?.mult ?? 0;
}

/** Straight flush / quads tier and up: longer jingle + big overlay. */
export const PREMIUM_MULT = 10;
export function isPremiumRank(raw: string | null | undefined, variant: PokerVariant): boolean {
  return rankMultiplier(raw, variant) >= PREMIUM_MULT;
}

const rankOf = (c: number): number => ((c % 13) + 13) % 13;

function indicesOfTopGroups(cards: number[], groups: number, exclude?: (r: number) => boolean): number[] {
  const counts = new Map<number, number>();
  cards.forEach((c) => {
    const r = rankOf(c);
    if (exclude?.(r)) return;
    counts.set(r, (counts.get(r) ?? 0) + 1);
  });
  const ranked = [...counts.entries()]
    .filter(([, n]) => n >= 2 || groups === 0)
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .slice(0, Math.max(groups, 1))
    .map(([r]) => r);
  return cards.flatMap((c, i) => (ranked.includes(rankOf(c)) ? [i] : []));
}

/**
 * Positions (0–4) of the cards that make the paying hand, so the rest can be
 * dimmed. Returns all five for hands that use every card, [] for no win.
 */
export function winningCardIndices(cards: number[], raw: string, variant: PokerVariant): number[] {
  if (cards.length !== 5) return [];
  const code = normalizeRank(raw);
  const all = [0, 1, 2, 3, 4];
  if (code === "LOSE") return [];

  if (variant === "deuces-wild") {
    const deuces = cards.flatMap((c, i) => (rankOf(c) === 0 ? [i] : []));
    if (code === "FOUR_DEUCES") return deuces;
    if (code === "FOUR_OF_A_KIND" || code === "THREE_OF_A_KIND") {
      const counts = new Map<number, number>();
      cards.forEach((c) => {
        const r = rankOf(c);
        if (r !== 0) counts.set(r, (counts.get(r) ?? 0) + 1);
      });
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
      if (!best) return deuces;
      return cards.flatMap((c, i) => (rankOf(c) === 0 || rankOf(c) === best[0] ? [i] : []));
    }
    return all;
  }

  switch (code) {
    case "FOUR_OF_A_KIND":
    case "FOUR_ACES":
    case "FOUR_2_3_4":
    case "FOUR_5_K":
    case "THREE_OF_A_KIND":
    case "JACKS_OR_BETTER":
      return indicesOfTopGroups(cards, 1);
    case "TWO_PAIR":
      return indicesOfTopGroups(cards, 2);
    default:
      return all;
  }
}

const RANK_NAMES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "Jack", "Queen", "King", "Ace"];
const SUIT_NAMES = ["clubs", "diamonds", "hearts", "spades"];

export function spokenCard(card: number): string {
  return `${RANK_NAMES[rankOf(card)]} of ${SUIT_NAMES[Math.floor(card / 13) % 4]}`;
}

/** Human copy for API errors — never surface raw server text. */
export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/insufficient/i.test(msg)) return "Not enough coins for this bet. Tap + to add coins.";
  if (/session expired|reconnect/i.test(msg)) return "Your session expired. Please reconnect your wallet.";
  if (/signature/i.test(msg)) return "We couldn't verify your balance. Please reconnect.";
  if (/network|fetch|timeout/i.test(msg)) return "Can't reach the table. Check your connection and try again.";
  return "Something went wrong. Your coins are safe — please try again.";
}
