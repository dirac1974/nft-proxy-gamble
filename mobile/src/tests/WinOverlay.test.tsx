import React from "react";
import { render } from "@testing-library/react-native";
import { WinOverlay, classifyWin } from "@/components/WinOverlay";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

describe("classifyWin", () => {
  it("returns null for payout 0", () => {
    expect(classifyWin(0, 1)).toBeNull();
    expect(classifyWin(0, 5)).toBeNull();
  });

  it("returns 'big' for Royal Flush (per-coin payout >= 50)", () => {
    expect(classifyWin(250, 1)).toBe("big"); // Royal Flush 1 coin: 250/1 = 250
    expect(classifyWin(50, 1)).toBe("big");  // Straight Flush 1 coin: 50/1 = 50
  });

  it("returns 'medium' for Full House / Four of a Kind", () => {
    expect(classifyWin(9, 1)).toBe("medium"); // Full House 1 coin
    expect(classifyWin(45, 5)).toBe("medium"); // Full House 5 coins: 45/5 = 9
    expect(classifyWin(25, 1)).toBe("medium"); // Four of a Kind
  });

  it("returns 'small' for Jacks or Better / Two Pair", () => {
    expect(classifyWin(1, 1)).toBe("small");
    expect(classifyWin(2, 1)).toBe("small");
    expect(classifyWin(6, 1)).toBe("small"); // Flush
  });

  it("handles max-bet Royal Flush (4000 coins)", () => {
    expect(classifyWin(4000, 5)).toBe("big"); // 4000/5 = 800
  });
});

describe("WinOverlay component", () => {
  const noop = jest.fn();

  it("renders nothing when visible=false", () => {
    const { toJSON } = render(
      <WinOverlay visible={false} rank="Full House" payout={9} tier="medium" onDismiss={noop} />
    );
    expect(toJSON()).toBeNull();
  });

  it("renders rank and payout when visible=true", () => {
    const { getByText } = render(
      <WinOverlay visible={true} rank="Four of a Kind" payout={25} tier="medium" onDismiss={noop} />
    );
    expect(getByText("Four of a Kind")).toBeTruthy();
    expect(getByText("+25 coins")).toBeTruthy();
  });

  it("shows BIG WIN label for big tier", () => {
    const { getByText } = render(
      <WinOverlay visible={true} rank="Royal Flush" payout={800} tier="big" onDismiss={noop} />
    );
    expect(getByText("BIG WIN!")).toBeTruthy();
  });

  it("does not show BIG WIN label for medium tier", () => {
    const { queryByText } = render(
      <WinOverlay visible={true} rank="Full House" payout={9} tier="medium" onDismiss={noop} />
    );
    expect(queryByText("BIG WIN!")).toBeNull();
  });

  it("has accessibilityRole alert", () => {
    const { getByRole } = render(
      <WinOverlay visible={true} rank="Flush" payout={6} tier="small" onDismiss={noop} />
    );
    expect(getByRole("alert")).toBeTruthy();
  });
});
