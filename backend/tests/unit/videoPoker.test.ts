import fc from "fast-check";
import {
  generateDeck,
  evaluateHand,
  calcPayout,
  applyHolds,
  resolveHand,
  generateServerSeed,
  hashServerSeed,
  generateClientSeed,
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

describe("generateDeck — additional determinism", () => {
  const SS = "determinism_server_seed_abc";
  const CS = "determinism_client_seed_xyz";

  it("is stable across 1000 repeated calls with same inputs", () => {
    const reference = generateDeck(SS, CS, 7);
    for (let i = 0; i < 1000; i++) {
      expect(generateDeck(SS, CS, 7)).toEqual(reference);
    }
  });

  it("output is a permutation of 0..51", () => {
    const deck = generateDeck(SS, CS, 0);
    const sorted = [...deck].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: 52 }, (_, i) => i));
  });

  it("different handNumber produces different deck order", () => {
    const d0 = generateDeck(SS, CS, 0);
    const d1 = generateDeck(SS, CS, 1);
    expect(d0).not.toEqual(d1);
  });
});

describe("evaluateHand — explicit LOSE cases", () => {
  const card = (rank: number, suit: number) => suit * 13 + rank;

  it("low pair (2s) = LOSE", () => {
    // pair of 2s (rank 0), no other pair, no straight, no flush
    expect(evaluateHand([card(0, 0), card(0, 1), card(2, 2), card(4, 3), card(6, 0)])).toBe("LOSE");
  });

  it("no-pair high-card (A-K-Q-J-9 mixed suits) = LOSE", () => {
    // ranks 12, 11, 10, 9, 7 — not consecutive enough for straight
    expect(evaluateHand([card(12, 0), card(11, 1), card(10, 2), card(9, 3), card(7, 0)])).toBe("LOSE");
  });
});

describe("calcPayout — all ranks and royal branches", () => {
  const ranks = [
    "STRAIGHT_FLUSH",
    "FOUR_OF_A_KIND",
    "FULL_HOUSE",
    "FLUSH",
    "STRAIGHT",
    "THREE_OF_A_KIND",
    "TWO_PAIR",
    "JACKS_OR_BETTER",
    "LOSE",
  ] as const;

  it("ROYAL_FLUSH 250x for bet=1", () => {
    expect(calcPayout("ROYAL_FLUSH", 1)).toBe(250);
  });
  it("ROYAL_FLUSH 250x for bet=2 (non-max)", () => {
    expect(calcPayout("ROYAL_FLUSH", 2)).toBe(500);
  });
  it("ROYAL_FLUSH 250x for bet=3 (non-max)", () => {
    expect(calcPayout("ROYAL_FLUSH", 3)).toBe(750);
  });
  it("ROYAL_FLUSH 250x for bet=4 (non-max)", () => {
    expect(calcPayout("ROYAL_FLUSH", 4)).toBe(1000);
  });
  it("ROYAL_FLUSH 800x for bet=5 (max)", () => {
    expect(calcPayout("ROYAL_FLUSH", 5)).toBe(4000);
  });

  it.each(ranks)("%s payout scales linearly with bet", (rank) => {
    const p1 = calcPayout(rank, 1);
    const p3 = calcPayout(rank, 3);
    if (rank === "LOSE") {
      expect(p1).toBe(0);
      expect(p3).toBe(0);
    } else {
      expect(p3).toBe(p1 * 3);
    }
  });

  it("STRAIGHT_FLUSH pays 50x for bet=1", () => {
    expect(calcPayout("STRAIGHT_FLUSH", 1)).toBe(50);
  });
  it("FOUR_OF_A_KIND pays 25x for bet=1", () => {
    expect(calcPayout("FOUR_OF_A_KIND", 1)).toBe(25);
  });
  it("STRAIGHT pays 4x for bet=2", () => {
    expect(calcPayout("STRAIGHT", 2)).toBe(8);
  });
  it("THREE_OF_A_KIND pays 3x for bet=5", () => {
    expect(calcPayout("THREE_OF_A_KIND", 5)).toBe(15);
  });
  it("TWO_PAIR pays 2x for bet=1", () => {
    expect(calcPayout("TWO_PAIR", 1)).toBe(2);
  });
  it("JACKS_OR_BETTER pays 1x for bet=1", () => {
    expect(calcPayout("JACKS_OR_BETTER", 1)).toBe(1);
  });
});

describe("applyHolds — throws on wrong length", () => {
  it("throws if holds.length < 5", () => {
    expect(() => applyHolds([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [true, true, true])).toThrow(
      "holds must have exactly 5 elements",
    );
  });

  it("throws if holds.length > 5", () => {
    expect(() =>
      applyHolds([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [true, true, true, true, true, true]),
    ).toThrow("holds must have exactly 5 elements");
  });
});

describe("resolveHand — LOSE path", () => {
  it("resolves a losing hand with payout 0", () => {
    // pair of 2s (ranks 0,0) plus three unrelated cards — LOSE
    const deck = [0, 13, 1, 3, 5, 99, 99, 99, 99, 99]; // 99 won't be used (hold all)
    const { rank, payout } = resolveHand({ deck }, [true, true, true, true, true], 3);
    expect(rank).toBe("LOSE");
    expect(payout).toBe(0);
  });
});

describe("generateClientSeed", () => {
  it("returns a 32-char hex string", () => {
    const seed = generateClientSeed();
    expect(seed).toMatch(/^[0-9a-f]{32}$/);
  });

  it("returns different values on successive calls", () => {
    const a = generateClientSeed();
    const b = generateClientSeed();
    expect(a).not.toBe(b);
  });
});
