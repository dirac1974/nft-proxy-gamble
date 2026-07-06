import { keccak256, toBytes, type Hex } from "viem";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

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

// ---------------------------------------------------------------------------
// Roulette provably-fair verification.
// Mirrors backend/src/services/roulette.ts:spinNumber exactly:
//   winningNumber = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}`) mod 37
// ---------------------------------------------------------------------------

export function rouletteSpinNumber(serverSeed: string, clientSeed: string, nonce: number): number {
  const mac = hmac(sha256, utf8ToBytes(serverSeed), utf8ToBytes(`${clientSeed}:${nonce}`));
  return Number(BigInt("0x" + bytesToHex(mac)) % 37n);
}

export interface RouletteVerificationResult {
  seedHashMatches: boolean;
  numberMatches: boolean;
  expectedNumber: number;
}

// Verify a completed spin:
// 1. serverSeedHash (committed before the spin) matches keccak256(serverSeed).
// 2. The winning number recomputes from serverSeed + clientSeed + nonce.
export function verifyRouletteSpin(
  serverSeed: string,
  serverSeedHash: string,
  clientSeed: string,
  nonce: number,
  winningNumber: number,
): RouletteVerificationResult {
  const seedHashMatches = hashServerSeed(serverSeed) === serverSeedHash;
  const expectedNumber = rouletteSpinNumber(serverSeed, clientSeed, nonce);
  return {
    seedHashMatches,
    numberMatches: expectedNumber === winningNumber,
    expectedNumber,
  };
}
