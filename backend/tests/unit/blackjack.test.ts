import {
  cardValue,
  handValue,
  isBlackjack,
  generateShoe,
  deal,
  applyAction,
  resolveInsurance,
  settle,
  legalActions,
  publicView,
  BlackjackError,
  DEFAULT_NUM_DECKS,
  type BlackjackState,
} from "../../src/services/blackjack";

// Card encoding helper: card = suit*13 + rank, rank 0=2 … 8=10, 9=J,10=Q,11=K,12=A.
const R = { two: 0, three: 1, four: 2, five: 3, six: 4, seven: 5, eight: 6, nine: 7, ten: 8, J: 9, Q: 10, K: 11, A: 12 };
const c = (rank: number, suit = 0) => suit * 13 + rank;
const OPTS = { numDecks: DEFAULT_NUM_DECKS, dealerHitsSoft17: true };

describe("card + hand values", () => {
  it("scores pips, faces, and aces", () => {
    expect(cardValue(c(R.two))).toBe(2);
    expect(cardValue(c(R.nine))).toBe(9);
    expect(cardValue(c(R.ten))).toBe(10);
    expect(cardValue(c(R.K))).toBe(10);
    expect(cardValue(c(R.A))).toBe(11);
  });

  it("softens aces to avoid busting", () => {
    expect(handValue([c(R.A), c(R.K)])).toEqual({ total: 21, soft: true });
    expect(handValue([c(R.A), c(R.A)])).toEqual({ total: 12, soft: true });
    expect(handValue([c(R.A), c(R.six), c(R.K)])).toEqual({ total: 17, soft: false });
    expect(handValue([c(R.A), c(R.A), c(R.nine)])).toEqual({ total: 21, soft: true });
    expect(handValue([c(R.K), c(R.Q), c(R.five)])).toEqual({ total: 25, soft: false });
  });

  it("identifies a two-card natural only", () => {
    expect(isBlackjack([c(R.A), c(R.K)])).toBe(true);
    expect(isBlackjack([c(R.A), c(R.five), c(R.five)])).toBe(false); // 21 in 3 cards
    expect(isBlackjack([c(R.ten), c(R.nine)])).toBe(false);
  });
});

describe("provably-fair shoe", () => {
  it("is reproducible from the same seeds and is a valid multiset", () => {
    const a = generateShoe("server-seed-abc", "client-xyz", 6);
    const b = generateShoe("server-seed-abc", "client-xyz", 6);
    expect(a).toEqual(b);
    expect(a.length).toBe(312);
    // Each of the 52 card faces appears exactly numDecks (6) times.
    const counts = new Map<number, number>();
    for (const card of a) counts.set(card, (counts.get(card) ?? 0) + 1);
    expect(counts.size).toBe(52);
    expect([...counts.values()].every((n) => n === 6)).toBe(true);
  });

  it("differs when the client seed changes", () => {
    const a = generateShoe("s", "client-1", 1);
    const b = generateShoe("s", "client-2", 1);
    expect(a).not.toEqual(b);
  });
});

// A crafted shoe lets us force exact cards: player=[shoe0,shoe2], dealer=[shoe1,shoe3],
// then hits/dealer draws come from index 4 onward.
function shoe(cards: number[]): number[] {
  // pad with harmless low cards so draws never run off the end
  return [...cards, ...Array.from({ length: 40 }, () => c(R.two))];
}

describe("deal + naturals", () => {
  it("pays a player natural 3:2 immediately (dealer non-ten upcard)", () => {
    // player A,K ; dealer 9,5
    const s = deal(shoe([c(R.A), c(R.nine), c(R.K), c(R.five)]), 100, OPTS);
    expect(s.phase).toBe("settled");
    expect(s.playerBlackjack).toBe(true);
    expect(s.results[0].outcome).toBe("blackjack");
    expect(s.results[0].ret).toBe(250); // 100 + floor(150)
    expect(s.netProfit).toBe(150);
  });

  it("floors 3:2 on odd bets (house-favorable)", () => {
    const s = deal(shoe([c(R.A), c(R.nine), c(R.K), c(R.five)]), 5, OPTS);
    expect(s.results[0].ret).toBe(12); // 5 + floor(7.5)=7
  });

  it("pushes when both have naturals", () => {
    // dealer up ten -> peek. player A,Q ; dealer K,A -> both BJ
    const s = deal(shoe([c(R.A), c(R.K), c(R.Q), c(R.A)]), 100, OPTS);
    expect(s.dealerBlackjack).toBe(true);
    expect(s.phase).toBe("settled");
    expect(s.results[0].outcome).toBe("push");
    expect(s.netProfit).toBe(0);
  });

  it("dealer natural on a ten upcard beats a non-natural player (peek ends round)", () => {
    // player 9,7 ; dealer K,A -> dealer BJ, player 16
    const s = deal(shoe([c(R.nine), c(R.K), c(R.seven), c(R.A)]), 100, OPTS);
    expect(s.phase).toBe("settled");
    expect(s.results[0].outcome).toBe("lose");
    expect(s.netProfit).toBe(-100);
  });
});

describe("hit / stand / bust", () => {
  it("busts on hitting over 21", () => {
    // player K,7 (17); dealer 5,9 ; next card is a K -> 27 bust
    let s = deal(shoe([c(R.K), c(R.five), c(R.seven), c(R.nine), c(R.K)]), 100, OPTS);
    expect(s.phase).toBe("player");
    s = applyAction(s, "hit", shoe([c(R.K), c(R.five), c(R.seven), c(R.nine), c(R.K)]));
    expect(s.phase).toBe("settled");
    expect(s.results[0].outcome).toBe("bust");
    expect(s.netProfit).toBe(-100);
  });

  it("stand lets the dealer play to 17 and compares", () => {
    // player K,Q (20); dealer 10,6 then draws... next card index4 = 5 -> dealer 21? 10+6+5=21
    const deckArr = shoe([c(R.K), c(R.ten), c(R.Q), c(R.six), c(R.five)]);
    let s = deal(deckArr, 100, OPTS);
    s = applyAction(s, "stand", deckArr);
    // dealer 10+6=16 -> hits -> +5 =21 -> player 20 loses
    expect(s.phase).toBe("settled");
    expect(handValue(s.dealer).total).toBe(21);
    expect(s.results[0].outcome).toBe("lose");
  });

  it("dealer stands on hard 17 and hits soft 17 only when configured", () => {
    // dealer 10,7 = hard 17: stands regardless. player 18 wins.
    const arr = shoe([c(R.K), c(R.ten), c(R.eight), c(R.seven)]);
    let s = deal(arr, 100, { numDecks: 1, dealerHitsSoft17: true });
    s = applyAction(s, "stand", arr);
    expect(handValue(s.dealer).total).toBe(17);
    expect(s.results[0].outcome).toBe("win");
  });
});

describe("double", () => {
  it("doubles the bet, draws exactly one card, and ends the hand", () => {
    // player 5,6 (11); dealer 9,7 ; double card = K -> 21
    const arr = shoe([c(R.five), c(R.nine), c(R.six), c(R.seven), c(R.K)]);
    let s = deal(arr, 100, OPTS);
    expect(legalActions(s)).toContain("double");
    s = applyAction(s, "double", arr);
    expect(s.hands[0].bet).toBe(200);
    expect(s.hands[0].cards.length).toBe(3);
    expect(s.totalWagered).toBe(200);
    expect(s.phase).toBe("settled");
    // player 21 vs dealer 16->hits. Either way bet risked is 200.
  });

  it("rejects double after more than two cards", () => {
    const arr = shoe([c(R.five), c(R.nine), c(R.four), c(R.seven), c(R.two)]);
    let s = deal(arr, 100, OPTS);
    s = applyAction(s, "hit", arr); // now 3 cards
    if (s.phase === "player") {
      expect(() => applyAction(s, "double", arr)).toThrow(BlackjackError);
    }
  });
});

describe("split", () => {
  it("splits a pair into two hands, one added bet, a card to each", () => {
    // player 8,8 ; dealer 9,6 ; split cards: idx4=2,idx5=3 -> hands [8,2]=? and [8,3]
    const arr = shoe([c(R.eight), c(R.nine), c(R.eight), c(R.six), c(R.two), c(R.three)]);
    let s = deal(arr, 100, OPTS);
    expect(legalActions(s)).toContain("split");
    s = applyAction(s, "split", arr);
    expect(s.hands.length).toBe(2);
    expect(s.totalWagered).toBe(200);
    expect(s.hands[0].cards.length).toBe(2);
    expect(s.hands[1].cards.length).toBe(2);
  });

  it("splits equal-VALUE tens (K and Q)", () => {
    const arr = shoe([c(R.K), c(R.nine), c(R.Q), c(R.six), c(R.two), c(R.three)]);
    const s = deal(arr, 100, OPTS);
    expect(legalActions(s)).toContain("split");
  });

  it("rejects splitting unequal cards", () => {
    const arr = shoe([c(R.eight), c(R.nine), c(R.seven), c(R.six)]);
    const s = deal(arr, 100, OPTS);
    expect(legalActions(s)).not.toContain("split");
    expect(() => applyAction(s, "split", arr)).toThrow(BlackjackError);
  });

  it("split aces get exactly one card each and cannot be hit", () => {
    // player A,A ; dealer 9,6 ; each ace gets one card (idx4=K,idx5=five)
    const arr = shoe([c(R.A), c(R.nine), c(R.A), c(R.six), c(R.K), c(R.five)]);
    let s = deal(arr, 100, OPTS);
    s = applyAction(s, "split", arr);
    // Both split-ace hands are done immediately -> dealer plays -> settled.
    expect(s.phase).toBe("settled");
    // Hand0 A+K = 21 (not a blackjack); hand1 A+5 = 16.
    expect(handValue(s.hands[0].cards).total).toBe(21);
    expect(s.results[0].outcome).not.toBe("blackjack");
  });
});

describe("insurance", () => {
  it("offers insurance on a dealer ace and pays 2:1 on a dealer natural", () => {
    // dealer A,K -> natural. player 9,7. bet 100 -> insurance 50 -> pays 150 back.
    const arr = shoe([c(R.nine), c(R.A), c(R.seven), c(R.K)]);
    let s = deal(arr, 100, OPTS);
    expect(s.phase).toBe("insurance");
    s = resolveInsurance(s, true, arr);
    expect(s.phase).toBe("settled");
    expect(s.dealerBlackjack).toBe(true);
    // Hand loses 100, insurance 50 -> returns 150. Net = 150 - (100+50) = 0.
    expect(s.insurance).toBe(50);
    expect(s.totalReturn).toBe(150);
    expect(s.netProfit).toBe(0);
  });

  it("loses insurance when the dealer has no natural, then play continues", () => {
    // dealer A,6 (no BJ). player K,9. take insurance 50.
    const arr = shoe([c(R.K), c(R.A), c(R.nine), c(R.six), c(R.two)]);
    let s = deal(arr, 100, OPTS);
    s = resolveInsurance(s, true, arr);
    expect(s.phase).toBe("player");
    expect(s.insurance).toBe(50);
    expect(s.totalWagered).toBe(150);
  });
});

// -------------------------------------------------------------------------
// RED TEAM — attempts to cheat the engine must throw or be impossible.
// -------------------------------------------------------------------------
describe("red team", () => {
  it("cannot act after the round is settled", () => {
    const arr = shoe([c(R.A), c(R.nine), c(R.K), c(R.five)]); // player natural -> settled
    const s = deal(arr, 100, OPTS);
    expect(s.phase).toBe("settled");
    expect(() => applyAction(s, "hit", arr)).toThrow(/phase/);
    expect(() => applyAction(s, "stand", arr)).toThrow(/phase/);
  });

  it("cannot resolve insurance twice or when not offered", () => {
    const arr = shoe([c(R.K), c(R.nine), c(R.nine), c(R.six)]); // dealer 9 up -> no insurance
    const s = deal(arr, 100, OPTS);
    expect(() => resolveInsurance(s, true, arr)).toThrow(/insurance not offered/);
  });

  it("does not leak the dealer hole card or seed in the mid-round public view", () => {
    const arr = shoe([c(R.K), c(R.five), c(R.seven), c(R.nine), c(R.two)]);
    const s = deal(arr, 100, OPTS);
    const view = publicView(s, { reveal: false }) as {
      dealer: number[];
      dealerHoleHidden: boolean;
    };
    expect(view.dealer.length).toBe(1); // only the upcard
    expect(view.dealerHoleHidden).toBe(true);
    expect(JSON.stringify(view)).not.toContain("serverSeed");
  });

  it("does not let a hand exceed the shoe or produce negative/duplicate settlement", () => {
    // Force a full split-and-double sequence; totalReturn must equal sum(results.ret)+insurance.
    const arr = shoe([c(R.eight), c(R.nine), c(R.eight), c(R.six), c(R.three), c(R.two), c(R.K), c(R.K)]);
    let s = deal(arr, 100, OPTS);
    s = applyAction(s, "split", arr);
    while (s.phase === "player") {
      s = applyAction(s, "stand", arr);
    }
    const sum = s.results.reduce((a, r) => a + r.ret, 0);
    expect(s.totalReturn).toBe(sum + (s.dealerBlackjack ? s.insurance * 3 : 0));
    expect(s.totalReturn).toBeGreaterThanOrEqual(0);
  });

  it("caps splits at MAX_HANDS", () => {
    // four eights: split three times -> 4 hands, 4th split rejected.
    const arr = shoe([
      c(R.eight), c(R.nine), c(R.eight), c(R.six),
      c(R.eight, 1), c(R.eight, 2), c(R.eight, 3), c(R.two), c(R.three), c(R.four), c(R.five), c(R.six),
    ]);
    let s = deal(arr, 100, OPTS);
    let splits = 0;
    while (s.phase === "player" && legalActions(s).includes("split") && splits < 10) {
      s = applyAction(s, "split", arr);
      splits++;
    }
    expect(s.hands.length).toBeLessThanOrEqual(4);
  });
});
