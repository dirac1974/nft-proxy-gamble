import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Card } from "@/components/Card";

// react-native-reanimated mock provided by jest-expo preset
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

describe("Card component", () => {
  const noop = () => {};

  it("renders rank and suit for card 0 (2♣)", () => {
    const { getAllByText, getByLabelText } = render(
      <Card cardIndex={0} held={false} onToggleHold={noop} />
    );
    expect(getAllByText("2").length).toBeGreaterThan(0);
    // Suit pips render as SVG; the suit is conveyed via the accessibility label.
    expect(getByLabelText(/2♣/)).toBeTruthy();
  });

  it("renders rank and suit for card 12 (A♣)", () => {
    const { getAllByText } = render(
      <Card cardIndex={12} held={false} onToggleHold={noop} />
    );
    expect(getAllByText("A").length).toBeGreaterThan(0);
  });

  it("renders rank and suit for card 14 (3♦ — red suit)", () => {
    const { getAllByText, getByLabelText } = render(
      <Card cardIndex={14} held={false} onToggleHold={noop} />
    );
    expect(getAllByText("3").length).toBeGreaterThan(0);
    expect(getByLabelText(/3♦/)).toBeTruthy();
  });

  it("shows HELD badge when held=true", () => {
    const { getByText } = render(
      <Card cardIndex={0} held={true} onToggleHold={noop} />
    );
    expect(getByText("HELD")).toBeTruthy();
  });

  it("does not show HELD badge when held=false", () => {
    const { queryByText } = render(
      <Card cardIndex={0} held={false} onToggleHold={noop} />
    );
    expect(queryByText("HELD")).toBeNull();
  });

  it("calls onToggleHold when pressed and not disabled", () => {
    const onToggle = jest.fn();
    const { getByRole } = render(
      <Card cardIndex={0} held={false} onToggleHold={onToggle} />
    );
    // Pressable is accessible as a button role in RNTL
    fireEvent.press(getByRole("button", { hidden: true }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not call onToggleHold when disabled", () => {
    const onToggle = jest.fn();
    const { getByRole } = render(
      <Card cardIndex={0} held={false} onToggleHold={onToggle} disabled />
    );
    fireEvent.press(getByRole("button", { hidden: true }));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
