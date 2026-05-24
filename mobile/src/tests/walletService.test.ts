import { decodeCard } from "@/services/walletService";

describe("decodeCard", () => {
  it("card 0 → 2♣ (black)", () => {
    const c = decodeCard(0);
    expect(c.rank).toBe("2");
    expect(c.suit).toBe("♣");
    expect(c.suitName).toBe("clubs");
    expect(c.isRed).toBe(false);
    expect(c.label).toBe("2♣");
  });

  it("card 12 → A♣", () => {
    const c = decodeCard(12);
    expect(c.rank).toBe("A");
    expect(c.suitName).toBe("clubs");
  });

  it("card 13 → 2♦ (red)", () => {
    const c = decodeCard(13);
    expect(c.rank).toBe("2");
    expect(c.suit).toBe("♦");
    expect(c.isRed).toBe(true);
  });

  it("card 26 → 2♥ (red)", () => {
    const c = decodeCard(26);
    expect(c.suit).toBe("♥");
    expect(c.isRed).toBe(true);
  });

  it("card 39 → 2♠ (black)", () => {
    const c = decodeCard(39);
    expect(c.suit).toBe("♠");
    expect(c.isRed).toBe(false);
  });

  it("card 51 → A♠ (black)", () => {
    const c = decodeCard(51);
    expect(c.rank).toBe("A");
    expect(c.suit).toBe("♠");
    expect(c.isRed).toBe(false);
  });

  // Encoding matches backend ADR-002: rank = card % 13, suit = floor(card / 13)
  it.each([
    [8, "10", "♣"],   // rank index 8 = "10", suit 0 = ♣
    [21, "10", "♦"],  // card 21: rank = 21%13=8 → "10", suit = floor(21/13)=1 → ♦
    [44, "7", "♠"],   // card 44: rank = 44%13=5 → "7", suit = floor(44/13)=3 → ♠
  ] as [number, string, string][])(
    "card %i → %s%s",
    (cardIndex, expectedRank, expectedSuit) => {
      const c = decodeCard(cardIndex);
      expect(c.rank).toBe(expectedRank);
      expect(c.suit).toBe(expectedSuit);
    }
  );
});
