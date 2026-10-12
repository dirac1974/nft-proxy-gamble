import React from "react";
import { render, fireEvent, within } from "@testing-library/react-native";
import { PaytableModal } from "@/components/PaytableModal";
import {
  PAYTABLES,
  rankLabel,
  isPremiumRank,
  rowPayout,
  winningCardIndices,
} from "@/components/videopoker/pokerData";
import { evaluateHand } from "@/components/videopoker/handEval";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("expo-blur", () => ({ BlurView: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe("PaytableModal", () => {
  const noop = jest.fn();

  it("renders nothing when hidden", () => {
    const { queryByText } = render(<PaytableModal visible={false} betAmount={1} onClose={noop} />);
    expect(queryByText("Jacks or Better paytable")).toBeNull();
  });

  it("renders all 9 Jacks or Better hands by default", () => {
    const { getByText } = render(<PaytableModal visible betAmount={1} onClose={noop} />);
    for (const h of [
      "Royal Flush",
      "Straight Flush",
      "Four of a Kind",
      "Full House",
      "Flush",
      "Straight",
      "Three of a Kind",
      "Two Pair",
      "Jacks or Better",
    ]) {
      expect(getByText(h)).toBeTruthy();
    }
  });

  it("is variant-aware (Bonus Poker quads, Deuces Wild rows)", () => {
    const bonus = render(<PaytableModal visible betAmount={1} variant="bonus-poker" onClose={noop} />);
    expect(bonus.getByText("Four Aces")).toBeTruthy();
    expect(bonus.getByText("Four 2s–4s")).toBeTruthy();
    bonus.unmount();
    const deuces = render(<PaytableModal visible betAmount={1} variant="deuces-wild" onClose={noop} />);
    expect(deuces.getByText("Natural Royal")).toBeTruthy();
    expect(deuces.getByText("Four Deuces")).toBeTruthy();
    expect(deuces.queryByText("Jacks or Better")).toBeNull();
  });

  it("shows the bet in the subtitle", () => {
    const { getByText } = render(<PaytableModal visible betAmount={3} onClose={noop} />);
    expect(getByText(/Bet 3/)).toBeTruthy();
  });

  it("calls onClose from the close button", () => {
    const onClose = jest.fn();
    const { getByTestId } = render(<PaytableModal visible betAmount={1} onClose={onClose} />);
    fireEvent.press(getByTestId("sheet-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows corrected 9/6 strategy tips", () => {
    const { getByTestId } = render(<PaytableModal visible betAmount={5} onClose={noop} />);
    const tips = within(getByTestId("strategy-tips"));
    expect(tips.getByText("4 to a flush beats a low pair (2s through 10s).")).toBeTruthy();
    expect(tips.getByText("A high pair (Jacks or better) beats 3 to a Royal or 4 to a flush.")).toBeTruthy();
    expect(tips.queryByText(/Hold low pair over four to a Flush/i)).toBeNull();
  });

  it("omits tips for Bonus Poker (not verified)", () => {
    const { queryByTestId } = render(<PaytableModal visible betAmount={1} variant="bonus-poker" onClose={noop} />);
    expect(queryByTestId("strategy-tips")).toBeNull();
  });

  it("explains the max bet royal bonus", () => {
    const { getByText } = render(<PaytableModal visible betAmount={5} onClose={noop} />);
    expect(getByText("Max bet bonus")).toBeTruthy();
    expect(getByText(/pays 4,000 at 5 coins/)).toBeTruthy();
  });
});

describe("pokerData (mirrors backend pokerVariants.ts)", () => {
  it("maps backend rank codes to labels", () => {
    expect(rankLabel("ROYAL_FLUSH")).toBe("Royal Flush");
    expect(rankLabel("JACKS_OR_BETTER")).toBe("Jacks or Better");
    expect(rankLabel("FOUR_2_3_4")).toBe("Four 2s–4s");
    expect(rankLabel("NATURAL_ROYAL")).toBe("Natural Royal");
    expect(rankLabel("LOSE")).toBe("No win");
    expect(rankLabel("Full House")).toBe("Full House");
    expect(rankLabel("SOME_NEW_HAND")).toBe("Some New Hand");
  });

  it("pays 800x on a max-bet royal only", () => {
    const royal = PAYTABLES["jacks-or-better"][0]!;
    expect(rowPayout(royal, 4)).toBe(1000);
    expect(rowPayout(royal, 5)).toBe(4000);
    const natural = PAYTABLES["deuces-wild"][0]!;
    expect(rowPayout(natural, 5)).toBe(4000);
    const wildRoyal = PAYTABLES["deuces-wild"].find((r) => r.code === "WILD_ROYAL")!;
    expect(rowPayout(wildRoyal, 5)).toBe(125);
  });

  it("matches backend multipliers", () => {
    const m = (v: keyof typeof PAYTABLES) => Object.fromEntries(PAYTABLES[v].map((r) => [r.code, r.mult]));
    expect(m("jacks-or-better")).toEqual({
      ROYAL_FLUSH: 250, STRAIGHT_FLUSH: 50, FOUR_OF_A_KIND: 25, FULL_HOUSE: 9, FLUSH: 6,
      STRAIGHT: 4, THREE_OF_A_KIND: 3, TWO_PAIR: 2, JACKS_OR_BETTER: 1,
    });
    expect(m("bonus-poker")).toEqual({
      ROYAL_FLUSH: 250, STRAIGHT_FLUSH: 50, FOUR_ACES: 80, FOUR_2_3_4: 40, FOUR_5_K: 25,
      FULL_HOUSE: 8, FLUSH: 5, STRAIGHT: 4, THREE_OF_A_KIND: 3, TWO_PAIR: 2, JACKS_OR_BETTER: 1,
    });
    expect(m("deuces-wild")).toEqual({
      NATURAL_ROYAL: 250, FOUR_DEUCES: 200, WILD_ROYAL: 25, FIVE_OF_A_KIND: 16, STRAIGHT_FLUSH: 10,
      FOUR_OF_A_KIND: 4, FULL_HOUSE: 4, FLUSH: 3, STRAIGHT: 2, THREE_OF_A_KIND: 1,
    });
  });

  it("treats straight flush / quads tier as premium (longer jingle + overlay)", () => {
    expect(isPremiumRank("ROYAL_FLUSH", "jacks-or-better")).toBe(true);
    expect(isPremiumRank("FOUR_OF_A_KIND", "jacks-or-better")).toBe(true);
    expect(isPremiumRank("FULL_HOUSE", "jacks-or-better")).toBe(false);
    expect(isPremiumRank("FOUR_OF_A_KIND", "deuces-wild")).toBe(false);
    expect(isPremiumRank("STRAIGHT_FLUSH", "deuces-wild")).toBe(true);
  });

  it("names the made hand after the deal (client display eval)", () => {
    // J♣ J♦ 4♥ 6♠ 9♣
    expect(evaluateHand([9, 22, 28, 43, 7], "jacks-or-better")).toBe("JACKS_OR_BETTER");
    // 10♠ J♠ Q♠ K♠ A♠
    expect(evaluateHand([47, 48, 49, 50, 51], "jacks-or-better")).toBe("ROYAL_FLUSH");
    // A♣ A♦ A♥ A♠ 3♣
    expect(evaluateHand([12, 25, 38, 51, 1], "bonus-poker")).toBe("FOUR_ACES");
    // 2♣ 2♦ 2♥ 2♠ 9♣
    expect(evaluateHand([0, 13, 26, 39, 7], "deuces-wild")).toBe("FOUR_DEUCES");
    // 2♣ 10♥ J♥ Q♥ K♥ — wild royal
    expect(evaluateHand([0, 34, 35, 36, 37], "deuces-wild")).toBe("WILD_ROYAL");
    // 2♣ 9♥ 9♠ 4♣ 6♦ — three of a kind with one deuce
    expect(evaluateHand([0, 33, 46, 2, 17], "deuces-wild")).toBe("THREE_OF_A_KIND");
    // 3♣ 5♦ 7♥ 9♠ J♣ — nothing
    expect(evaluateHand([1, 16, 31, 46, 9], "jacks-or-better")).toBe("LOSE");
  });

  it("finds the cards that make the hand", () => {
    // J♣ J♦ 4♥ 6♠ 9♣ — pair of jacks at positions 0,1
    expect(winningCardIndices([9, 22, 28, 43, 7], "JACKS_OR_BETTER", "jacks-or-better")).toEqual([0, 1]);
    // 5♣ 5♦ 8♥ 8♠ K♣ — two pair
    expect(winningCardIndices([3, 16, 32, 45, 11], "TWO_PAIR", "jacks-or-better")).toEqual([0, 1, 2, 3]);
    // Deuces: 2♣ 2♦ 9♥ 9♠ 4♣ — four 9s using two deuces
    expect(winningCardIndices([0, 13, 33, 46, 2], "FOUR_OF_A_KIND", "deuces-wild")).toEqual([0, 1, 2, 3]);
    expect(winningCardIndices([0, 1, 2, 3, 4], "LOSE", "jacks-or-better")).toEqual([]);
  });
});
