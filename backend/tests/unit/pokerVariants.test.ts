import {
  classify5,
  evaluateJacksOrBetter,
  evaluateBonusPoker,
  evaluateDeucesWild,
  evaluateVariant,
  calcVariantPayout,
  variantFromGameType,
  VARIANT_GAME_TYPE,
  JACKS_OR_BETTER_PAYTABLE,
} from "../../src/services/pokerVariants";

// card = suit*13 + rank; rank 0=2 … 8=10, 9=J,10=Q,11=K,12=A. Deuce = rank 0.
const R = { two: 0, three: 1, four: 2, five: 3, six: 4, seven: 5, eight: 6, nine: 7, ten: 8, J: 9, Q: 10, K: 11, A: 12 };
const S = { club: 0, diamond: 1, heart: 2, spade: 3 };
const c = (rank: number, suit = 0) => suit * 13 + rank;

describe("Jacks or Better evaluation", () => {
  it("classifies the standard ranks", () => {
    expect(evaluateJacksOrBetter([c(R.ten, S.spade), c(R.J, S.spade), c(R.Q, S.spade), c(R.K, S.spade), c(R.A, S.spade)])).toBe("ROYAL_FLUSH");
    expect(evaluateJacksOrBetter([c(R.five, S.club), c(R.six, S.club), c(R.seven, S.club), c(R.eight, S.club), c(R.nine, S.club)])).toBe("STRAIGHT_FLUSH");
    expect(evaluateJacksOrBetter([c(R.seven, 0), c(R.seven, 1), c(R.seven, 2), c(R.seven, 3), c(R.K)])).toBe("FOUR_OF_A_KIND");
    expect(evaluateJacksOrBetter([c(R.seven, 0), c(R.seven, 1), c(R.seven, 2), c(R.K, 0), c(R.K, 1)])).toBe("FULL_HOUSE");
    expect(evaluateJacksOrBetter([c(R.two, S.heart), c(R.five, S.heart), c(R.seven, S.heart), c(R.nine, S.heart), c(R.K, S.heart)])).toBe("FLUSH");
    expect(evaluateJacksOrBetter([c(R.five, 0), c(R.six, 1), c(R.seven, 2), c(R.eight, 3), c(R.nine, 0)])).toBe("STRAIGHT");
    expect(evaluateJacksOrBetter([c(R.J, 0), c(R.J, 1), c(R.four, 0), c(R.seven, 0), c(R.nine, 0)])).toBe("JACKS_OR_BETTER");
  });

  it("does NOT pay a low pair (tens or below)", () => {
    expect(evaluateJacksOrBetter([c(R.ten, 0), c(R.ten, 1), c(R.four, 0), c(R.seven, 0), c(R.nine, 0)])).toBe("LOSE");
    expect(evaluateJacksOrBetter([c(R.two, 0), c(R.two, 1), c(R.four, 0), c(R.seven, 0), c(R.nine, 0)])).toBe("LOSE");
  });

  it("scores the wheel A-2-3-4-5 as a straight", () => {
    expect(evaluateJacksOrBetter([c(R.A, 0), c(R.two, 1), c(R.three, 2), c(R.four, 3), c(R.five, 0)])).toBe("STRAIGHT");
  });
});

describe("Bonus Poker — quad-rank bonuses", () => {
  it("splits four of a kind by rank", () => {
    expect(evaluateBonusPoker([c(R.A, 0), c(R.A, 1), c(R.A, 2), c(R.A, 3), c(R.K)])).toBe("FOUR_ACES");
    expect(evaluateBonusPoker([c(R.three, 0), c(R.three, 1), c(R.three, 2), c(R.three, 3), c(R.K)])).toBe("FOUR_2_3_4");
    expect(evaluateBonusPoker([c(R.K, 0), c(R.K, 1), c(R.K, 2), c(R.K, 3), c(R.two)])).toBe("FOUR_5_K");
    expect(evaluateBonusPoker([c(R.seven, 0), c(R.seven, 1), c(R.seven, 2), c(R.seven, 3), c(R.two)])).toBe("FOUR_5_K");
  });

  it("pays the bonus quads more than a normal 4oak", () => {
    expect(calcVariantPayout("bonus-poker", "FOUR_ACES", 1)).toBe(80);
    expect(calcVariantPayout("bonus-poker", "FOUR_2_3_4", 1)).toBe(40);
    expect(calcVariantPayout("bonus-poker", "FOUR_5_K", 1)).toBe(25);
  });
});

describe("Deuces Wild — wild-card evaluation", () => {
  it("recognizes four deuces regardless of the fifth card", () => {
    expect(evaluateDeucesWild([c(R.two, 0), c(R.two, 1), c(R.two, 2), c(R.two, 3), c(R.K)])).toBe("FOUR_DEUCES");
  });

  it("distinguishes a NATURAL royal from a WILD royal", () => {
    const natural = [c(R.ten, S.spade), c(R.J, S.spade), c(R.Q, S.spade), c(R.K, S.spade), c(R.A, S.spade)];
    expect(evaluateDeucesWild(natural)).toBe("NATURAL_ROYAL");
    // deuce + T,J,Q,K spades -> wild completes the ace -> WILD_ROYAL
    const wild = [c(R.two, S.club), c(R.ten, S.spade), c(R.J, S.spade), c(R.Q, S.spade), c(R.K, S.spade)];
    expect(evaluateDeucesWild(wild)).toBe("WILD_ROYAL");
  });

  it("makes five of a kind with two wilds", () => {
    expect(evaluateDeucesWild([c(R.two, 0), c(R.two, 1), c(R.seven, 0), c(R.seven, 1), c(R.seven, 2)])).toBe("FIVE_OF_A_KIND");
  });

  it("a single wild upgrades trips to four of a kind", () => {
    expect(evaluateDeucesWild([c(R.two, 0), c(R.seven, 0), c(R.seven, 1), c(R.seven, 2), c(R.K)])).toBe("FOUR_OF_A_KIND");
  });

  it("a single wild completes a straight (mixed suits) or a flush", () => {
    // deuce + 6,7,8,9 mixed suits -> wild = 5 or 10 -> STRAIGHT
    expect(evaluateDeucesWild([c(R.two, 0), c(R.six, 1), c(R.seven, 2), c(R.eight, 3), c(R.nine, 0)])).toBe("STRAIGHT");
    // deuce + four clubs (non-consecutive) -> wild = a fifth club -> FLUSH
    expect(evaluateDeucesWild([c(R.two, S.club), c(R.five, S.club), c(R.eight, S.club), c(R.J, S.club), c(R.K, S.club)])).toBe("FLUSH");
  });

  it("pays NOTHING below three of a kind (a lone pair does not pay)", () => {
    // one wild + four unconnected off-suit cards -> best is a pair -> LOSE
    expect(evaluateDeucesWild([c(R.two, S.club), c(R.four, S.heart), c(R.seven, S.spade), c(R.nine, S.diamond), c(R.J, S.club)])).toBe("LOSE");
  });

  it("ranks five of a kind above a straight flush and wild royal above five of a kind", () => {
    expect(calcVariantPayout("deuces-wild", "FIVE_OF_A_KIND", 1)).toBeGreaterThan(calcVariantPayout("deuces-wild", "STRAIGHT_FLUSH", 1));
    expect(calcVariantPayout("deuces-wild", "WILD_ROYAL", 1)).toBeGreaterThan(calcVariantPayout("deuces-wild", "FIVE_OF_A_KIND", 1));
    expect(calcVariantPayout("deuces-wild", "FOUR_DEUCES", 1)).toBeGreaterThan(calcVariantPayout("deuces-wild", "WILD_ROYAL", 1));
  });
});

describe("payout + royal max-bet bonus", () => {
  it("pays a natural royal 800x only on a 5-coin max bet", () => {
    expect(calcVariantPayout("jacks-or-better", "ROYAL_FLUSH", 1)).toBe(250);
    expect(calcVariantPayout("jacks-or-better", "ROYAL_FLUSH", 5)).toBe(800 * 5);
    expect(calcVariantPayout("deuces-wild", "NATURAL_ROYAL", 5)).toBe(800 * 5);
    expect(calcVariantPayout("deuces-wild", "NATURAL_ROYAL", 4)).toBe(250 * 4);
  });

  it("scales linearly with bet below max", () => {
    expect(calcVariantPayout("jacks-or-better", "FLUSH", 3)).toBe(JACKS_OR_BETTER_PAYTABLE.FLUSH * 3);
  });
});

describe("variant plumbing", () => {
  it("maps game types both ways", () => {
    expect(variantFromGameType(VARIANT_GAME_TYPE["deuces-wild"])).toBe("deuces-wild");
    expect(variantFromGameType(VARIANT_GAME_TYPE["bonus-poker"])).toBe("bonus-poker");
    expect(variantFromGameType("jacks-or-better-9-6")).toBe("jacks-or-better");
    expect(variantFromGameType("roulette-euro-1-0")).toBeNull();
  });

  it("evaluateVariant dispatches", () => {
    const royal = [c(R.ten, S.spade), c(R.J, S.spade), c(R.Q, S.spade), c(R.K, S.spade), c(R.A, S.spade)];
    expect(evaluateVariant(royal, "jacks-or-better")).toBe("ROYAL_FLUSH");
    expect(evaluateVariant(royal, "deuces-wild")).toBe("NATURAL_ROYAL");
  });
});

describe("classify5 five-of-a-kind support", () => {
  it("detects five of a kind (only reachable via wild substitution)", () => {
    expect(classify5([c(R.seven, 0), c(R.seven, 1), c(R.seven, 2), c(R.seven, 3), c(R.seven, 0)]).cat).toBe("FIVE_OF_A_KIND");
  });
});
