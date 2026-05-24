import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { PaytableModal } from "@/components/PaytableModal";

describe("PaytableModal", () => {
  const noop = jest.fn();

  it("renders nothing when visible=false", () => {
    const { queryByText } = render(
      <PaytableModal visible={false} betAmount={1} onClose={noop} />
    );
    // Modal content not present when hidden
    expect(queryByText("PAYTABLE")).toBeNull();
  });

  it("renders all 9 hand names when visible=true", () => {
    const { getByText } = render(
      <PaytableModal visible={true} betAmount={1} onClose={noop} />
    );
    expect(getByText("Royal Flush")).toBeTruthy();
    expect(getByText("Straight Flush")).toBeTruthy();
    expect(getByText("Four of a Kind")).toBeTruthy();
    expect(getByText("Full House")).toBeTruthy();
    expect(getByText("Flush")).toBeTruthy();
    expect(getByText("Straight")).toBeTruthy();
    expect(getByText("Three of a Kind")).toBeTruthy();
    expect(getByText("Two Pair")).toBeTruthy();
    expect(getByText("Jacks or Better")).toBeTruthy();
  });

  it("shows correct bet subtitle", () => {
    const { getByText } = render(
      <PaytableModal visible={true} betAmount={3} onClose={noop} />
    );
    expect(getByText(/Bet 3/i)).toBeTruthy();
  });

  it("calls onClose when close button pressed", () => {
    const onClose = jest.fn();
    const { getByRole } = render(
      <PaytableModal visible={true} betAmount={1} onClose={onClose} />
    );
    fireEvent.press(getByRole("button", { name: /Close paytable modal/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows strategy tips section", () => {
    const { getByText } = render(
      <PaytableModal visible={true} betAmount={5} onClose={noop} />
    );
    expect(getByText("BASIC STRATEGY")).toBeTruthy();
  });

  it("shows max bet bonus note at bet 5", () => {
    const { getByText } = render(
      <PaytableModal visible={true} betAmount={5} onClose={noop} />
    );
    expect(getByText(/Max Bet Bonus/i)).toBeTruthy();
  });
});
