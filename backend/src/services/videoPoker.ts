import { randomBytes } from "crypto";
import { keccak256, toUtf8Bytes } from "ethers";
import type { HandRank, HandRecord } from "../types/index.js";

// Card encoding: 0–51. rank = card % 13, suit = Math.floor(card / 13)
// Ranks: 0=2 … 8=10, 9=J, 10=Q, 11=K, 12=A
// Suits: 0=clubs, 1=diamonds, 2=hearts, 3=spades

const PAYOUT_TABLE: Record<HandRank, number> = {
  ROYAL_FLUSH: 250,       // × bet; 800× for max (5-coin) handled in calcPayout
  STRAIGHT_FLUSH: 50,
  FOUR_OF_A_KIND: 25,
  FULL_HOUSE: 9,
  FLUSH: 6,
  STRAIGHT: 4,
  THREE_OF_A_KIND: 3,
  TWO_PAIR: 2,
  JACKS_OR_BETTER: 1,
  LOSE: 0,
};

export function generateServerSeed(): string {
  return randomBytes(32).toString("hex");
}

export function hashServerSeed(serverSeed: string): string {
  return keccak256(toUtf8Bytes(serverSeed));
}

export function generateClientSeed(): string {
  return randomBytes(16).toString("hex");
}

export function generateDeck(serverSeed: string, clientSeed: string, handNumber: number): number[] {
  const deck: number[] = Array.from({ length: 52 }, (_, i) => i);
  let hash = keccak256(toUtf8Bytes(`${serverSeed}:${clientSeed}:${handNumber}`));

  for (let i = 51; i > 0; i--) {
    hash = keccak256(hash);
    const j = Number(BigInt(hash) % BigInt(i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

export function evaluateHand(cards: number[]): HandRank {
  if (cards.length !== 5) throw new Error("evaluateHand requires exactly 5 cards");

  const ranks = cards.map((c) => c % 13);
  const suits = cards.map((c) => Math.floor(c / 13));

  const isFlush = suits.every((s) => s === suits[0]);

  const rankCounts = new Map<number, number>();
  for (const r of ranks) rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
  const counts = [...rankCounts.values()].sort((a, b) => b - a);
  const uniqueRanks = [...rankCounts.keys()].sort((a, b) => a - b);

  let isStraight = false;
  if (uniqueRanks.length === 5) {
    isStraight = uniqueRanks[4] - uniqueRanks[0] === 4;
    // Wheel: A(12)-2(0)-3(1)-4(2)-5(3)
    if (!isStraight) {
      isStraight = uniqueRanks[4] === 12 && uniqueRanks[3] === 3 && uniqueRanks[0] === 0;
    }
  }

  // Royal flush: 10(8)-J(9)-Q(10)-K(11)-A(12) same suit
  const isRoyal =
    isFlush && isStraight && uniqueRanks.length === 5 && uniqueRanks[0] === 8 && uniqueRanks[4] === 12;

  if (isRoyal) return "ROYAL_FLUSH";
  if (isFlush && isStraight) return "STRAIGHT_FLUSH";
  if (counts[0] === 4) return "FOUR_OF_A_KIND";
  if (counts[0] === 3 && counts[1] === 2) return "FULL_HOUSE";
  if (isFlush) return "FLUSH";
  if (isStraight) return "STRAIGHT";
  if (counts[0] === 3) return "THREE_OF_A_KIND";
  if (counts[0] === 2 && counts[1] === 2) return "TWO_PAIR";
  if (counts[0] === 2) {
    const pairRank = [...rankCounts.entries()].find(([, c]) => c === 2)![0];
    if (pairRank >= 9) return "JACKS_OR_BETTER"; // J=9, Q=10, K=11, A=12
  }
  return "LOSE";
}

export function calcPayout(rank: HandRank, betCoins: number): number {
  // Royal flush pays 800× for max bet (5 coins), 250× otherwise
  const multiplier =
    rank === "ROYAL_FLUSH" && betCoins === 5 ? 800 : PAYOUT_TABLE[rank];
  return multiplier * betCoins;
}

export function applyHolds(deck: number[], holds: boolean[]): number[] {
  if (holds.length !== 5) throw new Error("holds must have exactly 5 elements");
  const result: number[] = [...deck.slice(0, 5)];
  let drawIdx = 5;
  for (let i = 0; i < 5; i++) {
    if (!holds[i]) result[i] = deck[drawIdx++];
  }
  return result;
}

export function createHandRecord(
  handNumber: number,
  serverSeed: string,
  clientSeed: string,
): Pick<HandRecord, "handNumber" | "deck" | "holds" | "rank" | "payout"> {
  const deck = generateDeck(serverSeed, clientSeed, handNumber);
  return {
    handNumber,
    deck: deck.slice(0, 10),
    holds: [],
    rank: null,
    payout: 0,
  };
}

export function resolveHand(
  hand: Pick<HandRecord, "deck">,
  holds: boolean[],
  betCoins: number,
): { drawnCards: number[]; rank: HandRank; payout: number } {
  const drawnCards = applyHolds(hand.deck, holds);
  const rank = evaluateHand(drawnCards);
  const payout = calcPayout(rank, betCoins);
  return { drawnCards, rank, payout };
}
