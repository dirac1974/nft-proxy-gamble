import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Card } from "@/components/Card";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

describe("Card (wrapper over ui/PlayingCard)", () => {
  const noop = () => {};

  it("announces rank and suit for card 0 (2 of clubs)", () => {
    const { getByLabelText } = render(<Card cardIndex={0} held={false} onToggleHold={noop} testID="card-0" />);
    expect(getByLabelText("2 of clubs")).toBeTruthy();
  });

  it("announces Ace of clubs for card 12", () => {
    const { getByLabelText } = render(<Card cardIndex={12} held={false} onToggleHold={noop} />);
    expect(getByLabelText("Ace of clubs")).toBeTruthy();
  });

  it("announces a red suit for card 14 (3 of diamonds)", () => {
    const { getByLabelText } = render(<Card cardIndex={14} held={false} onToggleHold={noop} />);
    expect(getByLabelText("3 of diamonds")).toBeTruthy();
  });

  it("includes held state in the label and shows the HELD tab", () => {
    const { getByLabelText, getByText } = render(<Card cardIndex={0} held onToggleHold={noop} />);
    expect(getByLabelText("2 of clubs, held")).toBeTruthy();
    expect(getByText("HELD")).toBeTruthy();
  });

  it("does not show HELD when not held", () => {
    const { queryByText } = render(<Card cardIndex={0} held={false} onToggleHold={noop} />);
    expect(queryByText("HELD")).toBeNull();
  });

  it("hides the face when faceDown", () => {
    const { getByLabelText, queryByLabelText } = render(
      <Card cardIndex={0} held={false} faceDown onToggleHold={noop} />,
    );
    expect(getByLabelText("Face-down card")).toBeTruthy();
    expect(queryByLabelText("2 of clubs")).toBeNull();
  });

  it("calls onToggleHold when pressed", () => {
    const onToggle = jest.fn();
    const { getByTestId } = render(<Card cardIndex={0} held={false} onToggleHold={onToggle} testID="card-0" />);
    fireEvent.press(getByTestId("card-0"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not call onToggleHold when disabled", () => {
    const onToggle = jest.fn();
    const { getByTestId } = render(
      <Card cardIndex={0} held={false} onToggleHold={onToggle} disabled testID="card-0" />,
    );
    fireEvent.press(getByTestId("card-0"));
    expect(onToggle).not.toHaveBeenCalled();
    expect(getByTestId("card-0").props.accessibilityState).toMatchObject({ disabled: true });
  });
});
