import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { BettingLayout, boardGeometry, spotAnchor } from "@/components/roulette/BettingLayout";
import { spots } from "@/components/roulette/rouletteModel";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

const base = {
  width: 351,
  rowHeight: 30,
  bets: [],
  outcomes: null,
  winningNumber: null,
  dollyNumber: null,
  disabled: false,
  reduceMotion: true,
};

describe("BettingLayout", () => {
  it("places straight and outside bets via testIDs", () => {
    const onPlace = jest.fn();
    const { getByTestId } = render(<BettingLayout {...base} onPlace={onPlace} />);
    fireEvent.press(getByTestId("bet-number-17"));
    fireEvent.press(getByTestId("bet-red"));
    fireEvent.press(getByTestId("bet-black"));
    expect(onPlace.mock.calls.map((c) => c[0].key)).toEqual(["straight:17", "red", "black"]);
  });

  it("maps an edge tap to a split", () => {
    const onPlace = jest.fn();
    const { getByTestId } = render(<BettingLayout {...base} onPlace={onPlace} />);
    fireEvent.press(getByTestId("bet-number-17"), { nativeEvent: { locationX: 50, locationY: 29 } });
    expect(onPlace.mock.calls[0][0].key).toBe("split:17,20");
  });

  it("does nothing when disabled", () => {
    const onPlace = jest.fn();
    const { getByTestId } = render(<BettingLayout {...base} disabled onPlace={onPlace} />);
    fireEvent.press(getByTestId("bet-number-17"));
    expect(onPlace).not.toHaveBeenCalled();
  });

  it("renders chips for placed bets", () => {
    const { getByTestId } = render(
      <BettingLayout {...base} bets={[{ ...spots.straight(17), amount: 25 }]} onPlace={jest.fn()} />,
    );
    expect(getByTestId("chip-on-straight:17")).toBeTruthy();
  });

  it("anchors streets/lines on the outer rail and splits on the shared line", () => {
    const g = boardGeometry(351, 30);
    expect(spotAnchor(spots.street(4), g).x).toBeCloseTo(g.gridRight);
    expect(spotAnchor(spots.split(17, 20), g).y).toBeCloseTo(g.gridY + 6 * 30);
    expect(spotAnchor(spots.firstFour(), g)).toEqual({ x: g.gridRight, y: g.gridY });
  });
});
