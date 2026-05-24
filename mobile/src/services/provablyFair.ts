import { keccak256, toBytes, type Hex } from "viem";

const toUtf8Bytes = (s: string) => toBytes(s);

// Client-side reimplementation of the deck shuffle algorithm.
// Matches backend/src/services/videoPoker.ts:generateDeck exactly.
// Used to let players independently verify their hand was dealt honestly.

export function generateDeck(serverSeed: string, clientSeed: string, handNumber: number): number[] {
  const deck: number[] = Array.from({ length: 52 }, (_, i) => i);
  let hash = keccak256(toUtf8Bytes(`${serverSeed}:${clientSeed}:${handNumber}`));

  for (let i = 51; i > 0; i--) {
    hash = keccak256(hash as Hex);
    const j = Number(BigInt(hash) % BigInt(i + 1));
    const tmp = deck[i];
    deck[i] = deck[j]!;
    deck[j] = tmp!;
  }
  return deck;
}

// Matches backend hashServerSeed
export function hashServerSeed(serverSeed: string): string {
  return keccak256(toUtf8Bytes(serverSeed));
}

export interface VerificationResult {
  seedHashMatches: boolean;
  deckMatches: boolean;
  expectedDealt: number[];   // first 5 cards of the generated deck
  expectedDraw: number[];    // cards 5–9 (draw pool)
}

// Verify a completed hand:
// 1. serverSeedHash (shown before deal) matches keccak256(serverSeed) (revealed after draw)
// 2. The deck generated from serverSeed + clientSeed + handNumber matches the dealtCards + drawnCards
export function verifyHand(
  serverSeed: string,
  serverSeedHash: string,
  clientSeed: string,
  handNumber: number,
  dealtCards: number[],     // cards shown at deal (positions 0–4)
  drawnCards: number[],     // final hand after draw (server-filled non-held positions)
  holds: boolean[],
): VerificationResult {
  const computedHash = hashServerSeed(serverSeed);
  const seedHashMatches = computedHash === serverSeedHash;

  const deck = generateDeck(serverSeed, clientSeed, handNumber);
  const expectedDealt = deck.slice(0, 5);
  const expectedDraw = deck.slice(5, 10);

  // Reconstruct expected final hand: held cards stay, non-held come from draw pool
  let drawIdx = 0;
  const expectedFinalHand: number[] = [];
  for (let i = 0; i < 5; i++) {
    if (holds[i]) {
      expectedFinalHand.push(expectedDealt[i]!);
    } else {
      expectedFinalHand.push(expectedDraw[drawIdx++]!);
    }
  }

  const deckMatches =
    dealtCards.length === 5 &&
    drawnCards.length === 5 &&
    dealtCards.every((c, i) => c === expectedDealt[i]) &&
    drawnCards.every((c, i) => c === expectedFinalHand[i]);

  return { seedHashMatches, deckMatches, expectedDealt, expectedDraw };
}
