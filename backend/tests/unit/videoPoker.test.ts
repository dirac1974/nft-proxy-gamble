import fc from "fast-check";
import {
  generateDeck,
  evaluateHand,
  calcPayout,
  applyHolds,
  resolveHand,
  generateServerSeed,
  generateClientSeed,
  hashServerSeed,
  createHandRecord,
} from "../../src/services/videoPoker";

describe("generateDeck", () => {
  it("produces a complete 52-card deck", () => {
    const deck = generateDeck("seed_a", "seed_b", 0);
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
    expect(Math.min(...deck)).toBe(0);
    expect(Math.max(...deck)).toBe(51);
  });

  it("is deterministic — same inputs always produce the same deck", () => {
    const a = generateDeck("serverSeed_test", "clientSeed_test", 0);
    const b = generateDeck("serverSeed_test", "clientSeed_test", 0);
    expect(a).toEqual(b);
  });

  it("produces different decks for different hand numbers", () => {
    const d0 = generateDeck("s", "c", 0);
    const d1 = generateDeck("s", "c", 1);
    expect(d0).not.toEqual(d1);
  });

  it("produces different decks for different server seeds", () => {
    const a = generateDeck("seed_A", "same_client", 0);
    const b = generateDeck("seed_B", "same_client", 0);
    expect(a).not.toEqual(b);
  });
});

describe("evaluateHand", () => {
  const card = (rank: number, suit: number) => suit * 13 + rank;
  // ranks: 0=2,1=3,2=4,3=5,4=6,5=7,6=8,7=9,8=10,9=J,10=Q,11=K,12=A

  it("identifies Royal Flush", () => {
    // 10,J,Q,K,A of spades (suit 3): 3*13+8=47, 48,49,50,51
    expect(evaluateHand([47, 48, 49, 50, 51])).toBe("ROYAL_FLUSH");
  });

  it("identifies Straight Flush", () => {
    // 2-3-4-5-6 of clubs (suit 0): 0,1,2,3,4
    expect(evaluateHand([0, 1, 2, 3, 4])).toBe("STRAIGHT_FLUSH");
  });

  it("identifies Four of a Kind", () => {
    // Four Aces: A♣=12, A♦=25, A♥=38, A♠=51, plus 2♣=0
    expect(evaluateHand([12, 25, 38, 51, 0])).toBe("FOUR_OF_A_KIND");
  });

  it("identifies Full House", () => {
    // Three 2s + two 3s: ranks 0,0,0,1,1 suits 0,1,2,0,1
    expect(evaluateHand([0, 13, 26, 1, 14])).toBe("FULL_HOUSE");
  });

  it("identifies Flush", () => {
    // Non-consecutive hearts (suit 2): 2*13=26+0, +2, +4, +6, +8 = 26,28,30,32,34
    expect(evaluateHand([26, 28, 30, 32, 34])).toBe("FLUSH");
  });

  it("identifies Straight", () => {
    // 2-3-4-5-6 different suits
    expect(evaluateHand([0, 14, 2, 16, 4])).toBe("STRAIGHT");
  });

  it("identifies wheel Straight (A-2-3-4-5)", () => {
    // A(12)+suit0=12, 2(0)+suit1=13, 3(1)+suit2=27, 4(2)+suit3=41, 5(3)+suit0=3
    expect(evaluateHand([12, 13, 27, 41, 3])).toBe("STRAIGHT");
  });

  it("identifies Three of a Kind", () => {
    // Three Ks (rank 11): 11, 24, 37 + two different
    expect(evaluateHand([11, 24, 37, 0, 2])).toBe("THREE_OF_A_KIND");
  });

  it("identifies Two Pair", () => {
    // Pair of As and pair of 2s
    expect(evaluateHand([12, 25, 0, 13, 3])).toBe("TWO_PAIR");
  });

  it("identifies Jacks or Better — pair of Jacks", () => {
    expect(evaluateHand([9, 22, 0, 2, 4])).toBe("JACKS_OR_BETTER");
  });

  it("identifies Jacks or Better — pair of Queens", () => {
    expect(evaluateHand([10, 23, 0, 2, 4])).toBe("JACKS_OR_BETTER");
  });

  it("identifies Jacks or Better — pair of Kings", () => {
    expect(evaluateHand([11, 24, 0, 2, 4])).toBe("JACKS_OR_BETTER");
  });

  it("identifies Jacks or Better — pair of Aces", () => {
    expect(evaluateHand([12, 25, 0, 2, 4])).toBe("JACKS_OR_BETTER");
  });

  it("pair of 10s = LOSE (not Jacks or Better)", () => {
    expect(evaluateHand([8, 21, 0, 2, 4])).toBe("LOSE");
  });

  it("identifies LOSE for high card hand", () => {
    // 2, 4, 7, 9, J of different suits — no pair, no straight, no flush
    expect(evaluateHand([0, 15, 5, 20, 9])).toBe("LOSE");
  });

  it("throws for non-5-card input", () => {
    expect(() => evaluateHand([0, 1, 2, 3])).toThrow();
  });
});

describe("calcPayout", () => {
  it("Royal Flush pays 250x for 1-coin bet", () => {
    expect(calcPayout("ROYAL_FLUSH", 1)).toBe(250);
  });

  it("Royal Flush pays 800x for max 5-coin bet", () => {
    expect(calcPayout("ROYAL_FLUSH", 5)).toBe(4000);
  });

  it("Full House pays 9x (the '9' in 9/6 JoB)", () => {
    expect(calcPayout("FULL_HOUSE", 1)).toBe(9);
    expect(calcPayout("FULL_HOUSE", 3)).toBe(27);
  });

  it("Flush pays 6x (the '6' in 9/6 JoB)", () => {
    expect(calcPayout("FLUSH", 1)).toBe(6);
  });

  it("LOSE pays 0", () => {
    expect(calcPayout("LOSE", 5)).toBe(0);
  });
});

describe("applyHolds", () => {
  it("keeping all 5 cards returns the original dealt hand", () => {
    const deck = [10, 20, 30, 40, 50, 0, 1, 2, 3, 4];
    const result = applyHolds(deck, [true, true, true, true, true]);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it("discarding all 5 replaces all from draw pool", () => {
    const deck = [10, 20, 30, 40, 50, 0, 1, 2, 3, 4];
    const result = applyHolds(deck, [false, false, false, false, false]);
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  it("partial hold: keeps held cards and replaces discards in order", () => {
    const deck = [10, 20, 30, 40, 50, 99, 88, 77, 66, 55];
    const result = applyHolds(deck, [true, false, true, false, true]);
    expect(result).toEqual([10, 99, 30, 88, 50]);
  });

  it("throws for holds array != 5 elements", () => {
    expect(() => applyHolds([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [true, true])).toThrow();
  });
});

describe("resolveHand", () => {
  it("resolves a known hand — four aces for 1 coin = 25 payout", () => {
    // A♣=12, A♦=25, A♥=38, A♠=51, 2♣=0 — hold all five
    const hand = { deck: [12, 25, 38, 51, 0, 1, 2, 3, 4, 5] };
    const { rank, payout } = resolveHand(hand, [true, true, true, true, true], 1);
    expect(rank).toBe("FOUR_OF_A_KIND");
    expect(payout).toBe(25);
  });
});

describe("createHandRecord", () => {
  it("returns deck of length 10", () => {
    const hand = createHandRecord(0, "s", "c");
    expect(hand.deck).toHaveLength(10);
  });

  it("has null rank and 0 payout before draw", () => {
    const hand = createHandRecord(0, "s", "c");
    expect(hand.rank).toBeNull();
    expect(hand.payout).toBe(0);
  });
});

describe("generateServerSeed / hashServerSeed", () => {
  it("generateServerSeed returns 64-char hex", () => {
    const seed = generateServerSeed();
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashServerSeed returns a 0x-prefixed 66-char keccak256 hash", () => {
    const hash = hashServerSeed("test_seed");
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("different seeds produce different hashes", () => {
    expect(hashServerSeed("a")).not.toBe(hashServerSeed("b"));
  });

  it("generateClientSeed returns 32-char hex (16 random bytes)", () => {
    const seed = generateClientSeed();
    expect(seed).toMatch(/^[0-9a-f]{32}$/);
  });

  it("generateClientSeed returns different values each call (RNG sanity)", () => {
    const seeds = new Set(Array.from({ length: 50 }, () => generateClientSeed()));
    expect(seeds.size).toBe(50);
  });
});

describe("property — deck determinism and completeness", () => {
  it("generateDeck is always a valid 52-card permutation", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 10 }), fc.string({ minLength: 4 }), fc.nat(100), (ss, cs, hn) => {
        const deck = generateDeck(ss, cs, hn);
        return (
          deck.length === 52 &&
          new Set(deck).size === 52 &&
          deck.every((c) => c >= 0 && c <= 51)
        );
      }),
    );
  });
});
