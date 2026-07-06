import { describe, it, expect } from "@jest/globals";
import { generateShoe, verifyBlackjackDeal, hashServerSeed } from "@/services/provablyFair";

// Reference vectors computed from backend/src/services/blackjack.ts:generateShoe.
// These MUST match the backend byte-for-byte or players' on-device verification
// would fail.
describe("generateShoe — backend parity", () => {
  it("matches known backend vectors", () => {
    expect(generateShoe("srv", "cli", 1).slice(0, 8)).toEqual([46, 5, 35, 45, 28, 25, 42, 13]);
    expect(generateShoe("a".repeat(64), "b".repeat(32), 6).slice(0, 6)).toEqual([42, 14, 23, 19, 19, 30]);
  });

  it("produces a valid multiset (each face numDecks times)", () => {
    const shoe = generateShoe("s", "c", 6);
    expect(shoe.length).toBe(312);
    const counts = new Map<number, number>();
    for (const card of shoe) counts.set(card, (counts.get(card) ?? 0) + 1);
    expect(counts.size).toBe(52);
    expect([...counts.values()].every((n) => n === 6)).toBe(true);
  });

  it("is deterministic and seed-sensitive", () => {
    expect(generateShoe("s", "c", 1)).toEqual(generateShoe("s", "c", 1));
    expect(generateShoe("s", "c1", 1)).not.toEqual(generateShoe("s", "c2", 1));
  });
});

describe("verifyBlackjackDeal", () => {
  const serverSeed = "srv";
  const clientSeed = "cli";
  const numDecks = 1;
  const shoe = generateShoe(serverSeed, clientSeed, numDecks);
  const serverSeedHash = hashServerSeed(serverSeed);

  it("accepts the correctly reproduced opening", () => {
    const res = verifyBlackjackDeal(
      serverSeed,
      serverSeedHash,
      clientSeed,
      numDecks,
      [shoe[0], shoe[2]],
      [shoe[1], shoe[3]],
    );
    expect(res.seedHashMatches).toBe(true);
    expect(res.cardsMatch).toBe(true);
  });

  it("rejects a tampered serverSeedHash", () => {
    const res = verifyBlackjackDeal(serverSeed, "0xdeadbeef", clientSeed, numDecks, [shoe[0], shoe[2]], [shoe[1], shoe[3]]);
    expect(res.seedHashMatches).toBe(false);
  });

  it("rejects cards that don't match the reproduced shoe", () => {
    const res = verifyBlackjackDeal(serverSeed, serverSeedHash, clientSeed, numDecks, [shoe[0], shoe[2]], [shoe[1], (shoe[3] + 1) % 52]);
    expect(res.cardsMatch).toBe(false);
  });
});
