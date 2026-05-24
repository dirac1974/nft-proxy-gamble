import { describe, it, expect } from "@jest/globals";
import { generateDeck, hashServerSeed, verifyHand } from "@/services/provablyFair";

const SERVER_SEED = "a".repeat(64);  // deterministic test seed
const CLIENT_SEED = "b".repeat(32);
const HAND_NUMBER = 0;

describe("hashServerSeed", () => {
  it("returns deterministic keccak256 hash", () => {
    const h1 = hashServerSeed(SERVER_SEED);
    const h2 = hashServerSeed(SERVER_SEED);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it("different seeds produce different hashes", () => {
    expect(hashServerSeed(SERVER_SEED)).not.toBe(hashServerSeed("b".repeat(64)));
  });
});

describe("generateDeck", () => {
  it("produces exactly 52 unique cards", () => {
    const deck = generateDeck(SERVER_SEED, CLIENT_SEED, HAND_NUMBER);
    expect(deck).toHaveLength(52);
    const unique = new Set(deck);
    expect(unique.size).toBe(52);
  });

  it("deck contains cards 0–51", () => {
    const deck = generateDeck(SERVER_SEED, CLIENT_SEED, HAND_NUMBER);
    for (let i = 0; i < 52; i++) {
      expect(deck).toContain(i);
    }
  });

  it("different seeds produce different decks", () => {
    const d1 = generateDeck(SERVER_SEED, CLIENT_SEED, 0);
    const d2 = generateDeck(SERVER_SEED, CLIENT_SEED, 1);
    expect(d1.slice(0, 5)).not.toEqual(d2.slice(0, 5));
  });

  it("deck is deterministic for same inputs", () => {
    const d1 = generateDeck(SERVER_SEED, CLIENT_SEED, HAND_NUMBER);
    const d2 = generateDeck(SERVER_SEED, CLIENT_SEED, HAND_NUMBER);
    expect(d1).toEqual(d2);
  });
});

describe("verifyHand", () => {
  it("passes when dealt cards and final hand match generated deck", () => {
    const deck = generateDeck(SERVER_SEED, CLIENT_SEED, HAND_NUMBER);
    const dealtCards = deck.slice(0, 5);
    const holds = [true, true, true, true, true]; // hold all
    const drawnCards = [...dealtCards]; // no replacements
    const serverSeedHash = hashServerSeed(SERVER_SEED);

    const result = verifyHand(
      SERVER_SEED, serverSeedHash, CLIENT_SEED, HAND_NUMBER, dealtCards, drawnCards, holds,
    );
    expect(result.seedHashMatches).toBe(true);
    expect(result.deckMatches).toBe(true);
  });

  it("passes when draw replaces non-held cards correctly", () => {
    const deck = generateDeck(SERVER_SEED, CLIENT_SEED, HAND_NUMBER);
    const dealtCards = deck.slice(0, 5);
    const holds = [false, true, false, true, false]; // hold cards at index 1 and 3
    // Draw pool is deck[5..9]; non-held positions replaced in order
    const drawPool = deck.slice(5, 10);
    const drawnCards = [
      drawPool[0]!,  // replace index 0
      dealtCards[1]!, // hold index 1
      drawPool[1]!,  // replace index 2
      dealtCards[3]!, // hold index 3
      drawPool[2]!,  // replace index 4
    ];
    const serverSeedHash = hashServerSeed(SERVER_SEED);

    const result = verifyHand(
      SERVER_SEED, serverSeedHash, CLIENT_SEED, HAND_NUMBER, dealtCards, drawnCards, holds,
    );
    expect(result.seedHashMatches).toBe(true);
    expect(result.deckMatches).toBe(true);
  });

  it("fails if server seed hash does not match", () => {
    const deck = generateDeck(SERVER_SEED, CLIENT_SEED, HAND_NUMBER);
    const dealtCards = deck.slice(0, 5);
    const holds = [true, true, true, true, true];
    const drawnCards = [...dealtCards];
    const wrongHash = "0x" + "0".repeat(64);

    const result = verifyHand(
      SERVER_SEED, wrongHash, CLIENT_SEED, HAND_NUMBER, dealtCards, drawnCards, holds,
    );
    expect(result.seedHashMatches).toBe(false);
  });

  it("fails if drawn cards are tampered", () => {
    const deck = generateDeck(SERVER_SEED, CLIENT_SEED, HAND_NUMBER);
    const dealtCards = deck.slice(0, 5);
    const holds = [false, false, false, false, false];
    const tamperedDrawn = [0, 1, 2, 3, 4]; // forced best cards
    const serverSeedHash = hashServerSeed(SERVER_SEED);

    const result = verifyHand(
      SERVER_SEED, serverSeedHash, CLIENT_SEED, HAND_NUMBER, dealtCards, tamperedDrawn, holds,
    );
    expect(result.deckMatches).toBe(false);
  });
});
