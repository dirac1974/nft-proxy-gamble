import React from "react";
import { render } from "@testing-library/react-native";
import { WinOverlay, classifyWin } from "@/components/WinOverlay";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

describe("classifyWin (net-based)", () => {
  it("returns null for a loss or push — never celebrate getting your stake back", () => {
    expect(classifyWin(0, 1)).toBeNull();
    expect(classifyWin(-5, 5)).toBeNull();
  });

  it("returns null for a zero bet", () => {
    expect(classifyWin(10, 0)).toBeNull();
  });

  it("small below 5x net", () => {
    expect(classifyWin(1, 1)).toBe("small"); // Two Pair: pays 2, net 1
    expect(classifyWin(4, 1)).toBe("small");
  });

  it("medium from 5x to below 25x net", () => {
    expect(classifyWin(5, 1)).toBe("medium"); // Flush 6 → net 5
    expect(classifyWin(40, 5)).toBe("medium"); // Full House at 5 coins
    expect(classifyWin(24, 1)).toBe("medium"); // Quads net 24
  });

  it("big from 25x net", () => {
    expect(classifyWin(49, 1)).toBe("big"); // Straight Flush net
    expect(classifyWin(3995, 5)).toBe("big"); // Max-bet Royal
  });
});

describe("WinOverlay component", () => {
  const noop = jest.fn();

  it("renders nothing when visible=false", () => {
    const { toJSON } = render(
      <WinOverlay visible={false} title="Full House" amount={8} tier="medium" onDismiss={noop} />,
    );
    expect(toJSON()).toBeNull();
  });

  it("renders the title when visible", () => {
    const { getByText } = render(
      <WinOverlay visible title="Four of a Kind" amount={24} tier="medium" onDismiss={noop} />,
    );
    expect(getByText("Four of a Kind")).toBeTruthy();
  });

  it("shows BIG WIN for big tier only", () => {
    const big = render(<WinOverlay visible title="Royal Flush" amount={3995} tier="big" onDismiss={noop} />);
    expect(big.getByText("BIG WIN")).toBeTruthy();
    const med = render(<WinOverlay visible title="Full House" amount={8} tier="medium" onDismiss={noop} />);
    expect(med.queryByText("BIG WIN")).toBeNull();
  });

  it("is announced as an alert with the net amount", () => {
    const { getByRole } = render(
      <WinOverlay visible title="Flush" amount={5} tier="medium" onDismiss={noop} />,
    );
    const alert = getByRole("alert", { includeHiddenElements: true });
    expect(alert.props.accessibilityLabel).toContain("5 coins");
  });
});
